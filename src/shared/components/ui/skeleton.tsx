import React from 'react';

export const Skeleton: React.FC<{ 
  className?: string; 
  width?: string | number;
  height?: string | number;
}> = ({ className = '', width, height }) => (
  <div 
    className={`animate-pulse bg-gray-200 dark:bg-gray-700 rounded ${className}`}
    style={{ width, height }}
  />
);

export const CardSkeleton: React.FC = () => (
  <div className="space-y-3 p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
    <Skeleton className="h-4 w-3/4" />
    <Skeleton className="h-4 w-1/2" />
    <Skeleton className="h-6 w-1/4" />
  </div>
);

export const ChartSkeleton: React.FC = () => (
  <div className="w-full h-[350px] bg-gray-50 dark:bg-gray-800 rounded-lg p-6 flex items-center justify-center">
    <div className="w-6 h-6 bg-gray-300 dark:bg-gray-600 rounded-full animate-pulse" />
    <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">Loading chart...</span>
  </div>
);