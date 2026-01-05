import React from 'react';

export interface ChartDataPoint {
  x: number; // Match day number
  y: number; // Share price
  label?: string; // Optional label for data points
  price?: number; // Share price (for tooltip)
  date?: string; // Full date string
  opponent?: string; // Match opponent
}

export interface LineChartProps {
  data: ChartDataPoint[];
  width?: number;
  height?: number;
  color?: string;
  showGrid?: boolean;
  showAxes?: boolean;
}

interface ChartSegment {
  startIndex: number;
  endIndex: number;
  isRising: boolean;
  startPrice: number;
  endPrice: number;
}

export const LineChart: React.FC<LineChartProps> = ({
  data,
  width = 400,
  height = 200,
  color = '#10b981',
  showGrid = true,
  showAxes = true
}) => {
  // Responsive sizing
  const [containerWidth, setContainerWidth] = React.useState(width);
  const [containerHeight, setContainerHeight] = React.useState(height);
  const [hoveredPoint, setHoveredPoint] = React.useState<{point: ChartDataPoint, cx: number, cy: number} | null>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);
  
  React.useEffect(() => {
    const updateSize = () => {
      if (!containerRef.current) return;
      
      const container = containerRef.current.parentElement;
      if (!container) return;
      
      // Get available width from parent container, accounting for padding
      const containerRect = container.getBoundingClientRect();
      const availableWidth = containerRect.width - 32; // Account for padding
      const actualWidth = Math.min(width, Math.max(300, availableWidth));
      const actualHeight = Math.max(200, Math.min(height, (actualWidth * height) / width));
      
      setContainerWidth(actualWidth);
      setContainerHeight(actualHeight);
    };
    
    updateSize();
    window.addEventListener('resize', updateSize);
    
    // Use ResizeObserver for better responsiveness
    let resizeObserver: ResizeObserver | null = null;
    if (containerRef.current?.parentElement) {
      resizeObserver = new ResizeObserver(updateSize);
      resizeObserver.observe(containerRef.current.parentElement);
    }
    
    return () => {
      window.removeEventListener('resize', updateSize);
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
    };
  }, [width, height]);
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-800 rounded-lg">
        <p className="text-sm">No data available for chart</p>
      </div>
    );
  }

  // Find min/max values for scaling
  const minX = Math.min(...data.map(d => d.x));
  const maxX = Math.max(...data.map(d => d.x));
  const minY = Math.min(...data.map(d => d.y));
  const maxY = Math.max(...data.map(d => d.y));

  // Add some padding
  const paddingX = (maxX - minX) * 0.1;
  const paddingY = (maxY - minY) * 0.1;

  const scaleX = (value: number) =>
    ((value - minX + paddingX) / (maxX - minX + 2 * paddingX)) * (containerWidth - 80) + 50;

  const scaleY = (value: number) =>
    containerHeight - ((value - minY + paddingY) / (maxY - minY + 2 * paddingY)) * (containerHeight - 60) - 30;

  // Calculate segments for different colors
  const segments: ChartSegment[] = [];
  if (data.length > 1) {
    let currentSegment: ChartSegment | null = null;
    
    for (let i = 1; i < data.length; i++) {
      const prevPrice = data[i - 1].y;
      const currentPrice = data[i].y;
      const isRising = currentPrice >= prevPrice;
      
      if (!currentSegment) {
        currentSegment = {
          startIndex: i - 1,
          endIndex: i,
          isRising,
          startPrice: prevPrice,
          endPrice: currentPrice
        };
      } else if (currentSegment.isRising === isRising) {
        currentSegment.endIndex = i;
        currentSegment.endPrice = currentPrice;
      } else {
        segments.push(currentSegment);
        currentSegment = {
          startIndex: i - 1,
          endIndex: i,
          isRising,
          startPrice: prevPrice,
          endPrice: currentPrice
        };
      }
    }
    
    if (currentSegment) {
      segments.push(currentSegment);
    }
  }

  // Generate paths for each segment with proper point connections
  const segmentPaths = segments.map(segment => {
    let pathCommands: string[] = [];
    
    // Generate path through all points in this segment
    for (let i = segment.startIndex; i <= segment.endIndex; i++) {
      const point = data[i];
      const command = i === segment.startIndex ? 'M' : 'L';
      pathCommands.push(`${command} ${scaleX(point.x)} ${scaleY(point.y)}`);
    }
    
    return {
      path: pathCommands.join(' '),
      isRising: segment.isRising,
      color: segment.isRising ? '#10b981' : '#ef4444',
      gradientId: segment.isRising ? 'greenGradient' : 'redGradient'
    };
  });

  // Generate overall path for area fill
  const pathData = data
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${scaleX(point.x)} ${scaleY(point.y)}`)
    .join(' ');

  // Generate Y-axis labels
  const yLabels = [];
  const steps = 5;
  for (let i = 0; i <= steps; i++) {
    const value = minY + (maxY - minY) * (i / steps);
    yLabels.push({
      value: value,
      y: scaleY(value)
    });
  }

  return (
    <div className="w-full relative" data-chart-container ref={containerRef} style={{ minWidth: '100%' }}>
      <svg 
        width="100%" 
        height={containerHeight} 
        viewBox={`0 0 ${containerWidth} ${containerHeight}`}
        preserveAspectRatio="xMidYMid meet"
        className="overflow-visible"
      >
        {/* Subtle area fill */}
        <defs>
          <linearGradient id="chartBg" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.08"/>
            <stop offset="100%" stopColor="currentColor" stopOpacity="0"/>
          </linearGradient>
        </defs>
        
        {/* Area under the curve */}
        <path
          d={`${pathData} L ${scaleX(data[data.length - 1]?.x || 0)} ${containerHeight - 30} L ${scaleX(data[0]?.x || 0)} ${containerHeight - 30} Z`}
          fill="url(#chartBg)"
        />
        
        {/* Grid lines */}
        {showGrid && (
          <>
            {/* Horizontal grid lines */}
            {yLabels.map((label, index) => (
              <line
                key={`h-${index}`}
                x1={50}
                y1={label.y}
                x2={containerWidth - 30}
                y2={label.y}
                stroke="rgb(75 85 99)"
                strokeWidth="1"
                opacity="0.2"
              />
            ))}
            
            {/* Vertical grid lines */}
            {Array.from({ length: Math.min(8, data.length) }).map((_, index) => {
              const x = 50 + ((containerWidth - 80) * index) / (Math.min(8, data.length) - 1);
              return (
                <line
                  key={`v-${index}`}
                  x1={x}
                  y1={30}
                  x2={x}
                  y2={containerHeight - 30}
                  stroke="rgb(75 85 99)"
                  strokeWidth="1"
                  opacity="0.1"
                />
              );
            })}
          </>
        )}
        
        {/* Y-axis */}
        {showAxes && (
          <>
            {/* Y-axis labels */}
            {yLabels.map((label, index) => (
              <text
                key={index}
                x={45}
                y={label.y + 4}
                textAnchor="end"
                fontSize="10"
                fill="rgb(107 114 128)"
                className="font-medium"
              >
                ${label.value.toFixed(2)}
              </text>
            ))}
          </>
        )}
                
        {/* Clean line path */}
        <path
          d={pathData}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.8"
        />
        
        {/* Data points */}
        {data.map((point, index) => {
          // Determine color based on direction from previous point
          let pointColor = '#10b981'; // Default green
          if (index > 0) {
            const prevPrice = data[index - 1].y;
            pointColor = point.y >= prevPrice ? '#10b981' : '#ef4444';
          }
          
          const cx = scaleX(point.x);
          const cy = scaleY(point.y);
          
          return (
            <g key={index}>
              {/* Interactive area - larger than visible circle for easier hover */}
              <circle
                cx={cx}
                cy={cy}
                r="8"
                fill="transparent"
                onMouseEnter={() => {
                  setHoveredPoint({ point, cx, cy });
                }}
                onMouseLeave={() => setHoveredPoint(null)}
              />
              {/* Visible point */}
              <circle
                cx={cx}
                cy={cy}
                r="2.5"
                fill={pointColor}
                stroke="white"
                strokeWidth="1"
              />
              {/* Tooltip on hover */}
              <title>
                {point.label || `Day ${point.x}`}: ${point.y.toFixed(2)}
              </title>
            </g>
          );
        })}
        
        {/* X-axis */}
        {showAxes && (
          <>
            {/* X-axis labels */}
            {data.filter((_, index) => index % Math.ceil(data.length / 6) === 0 || index === data.length - 1).map((point, index) => (
              <text
                key={index}
                x={scaleX(point.x)}
                y={containerHeight - 10}
                textAnchor="middle"
                fontSize="10"
                fill="rgb(107 114 128)"
                className="font-medium"
              >
                {point.label || `Day ${point.x}`}
              </text>
            ))}
          </>
        )}
      </svg>
      
      {/* Hover Tooltip */}
      {hoveredPoint && (
        <div 
          className="absolute bg-gray-900 dark:bg-gray-700 text-white px-3 py-2 rounded-lg shadow-lg text-sm pointer-events-none z-10"
          style={{
            left: `${hoveredPoint.cx + 20}px`,
            top: `${hoveredPoint.cy - 50}px`,
          }}
        >
          {hoveredPoint.point.opponent && (
            <div className="font-semibold mb-1">vs {hoveredPoint.point.opponent}</div>
          )}
          <div className="text-gray-300">
            {hoveredPoint.point.date || hoveredPoint.point.label || `Day ${hoveredPoint.point.x}`}
          </div>
          <div className="text-green-400 font-medium">
            ${(hoveredPoint.point.price || hoveredPoint.point.y).toFixed(2)}
          </div>
        </div>
      )}
      
      {/* Minimal legend */}
      <div className="flex justify-center mt-2 sm:mt-4">
        <div className="flex items-center text-[10px] sm:text-xs text-gray-500 dark:text-gray-400">
          <div className="w-2 h-2 bg-green-500 rounded-full mr-1"></div>
          <span className="mr-3">Gain</span>
          <div className="w-2 h-2 bg-red-500 rounded-full mr-1"></div>
          <span>Loss</span>
        </div>
      </div>
    </div>
  );
};
