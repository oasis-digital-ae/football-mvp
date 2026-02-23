import React, { useState } from 'react';
import { HelpCircle, X } from 'lucide-react';
import { Card } from '@/shared/components/ui/card';
import { LEADERBOARD_WIDGET_CONFIG } from '../config/leaderboard-widget.config';

/**
 * FEATURE FLAG: Set to false to completely disable this widget
 * This makes it easy to remove the feature if the client rejects it
 * @deprecated Use LEADERBOARD_WIDGET_CONFIG.enabled instead
 */
export const SHOW_LEADERBOARD_INFO = LEADERBOARD_WIDGET_CONFIG.enabled;

interface LeaderboardInfoWidgetProps {
  /**
   * Position of the widget on screen
   * @default 'bottom-right'
   */
  position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
}

export const LeaderboardInfoWidget: React.FC<LeaderboardInfoWidgetProps> = ({ 
  position = 'bottom-right' 
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  // Don't render if feature flag is disabled
  if (!SHOW_LEADERBOARD_INFO) {
    return null;
  }
  const positionClasses = {
    'bottom-right': 'bottom-20 md:bottom-6 right-6',
    'bottom-left': 'bottom-20 md:bottom-6 left-6',
    'top-right': 'top-6 right-6',
    'top-left': 'top-6 left-6',
  };

  const tooltipPositionClasses = {
    'bottom-right': 'bottom-full right-0 mb-2',
    'bottom-left': 'bottom-full left-0 mb-2',
    'top-right': 'top-full right-0 mt-2',
    'top-left': 'top-full left-0 mt-2',
  };

  return (
    <div className={`fixed ${positionClasses[position]} z-50`}>      {/* Info Panel */}
      {isOpen && (
        <Card className={`absolute ${tooltipPositionClasses[position]} w-80 sm:w-96 p-4 bg-gray-900 border-gray-700 shadow-2xl animate-in fade-in slide-in-from-bottom-2 duration-200`}>
          <div className="flex items-start justify-between mb-3">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <HelpCircle className="w-4 h-4 text-trading-primary" />
              How Rankings Are Calculated
            </h3>
            <button
              onClick={() => setIsOpen(false)}
              className="text-gray-400 hover:text-white transition-colors"
              aria-label="Close info"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-3 text-xs text-gray-300">
            <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700/50">
              <h4 className="font-semibold text-trading-primary mb-2">Weekly Return Formula</h4>
              <div className="space-y-1 font-mono text-[10px]">
                <p>Return = (End Value - Start Value - Net Deposits) / Start Value + Net Deposits</p>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-start gap-2">
                <span className="text-trading-primary font-bold mt-0.5">1.</span>
                <div>
                  <p className="font-medium text-white">Start of Week (Monday 00:00 AM UAE)</p>
                  <p className="text-gray-400 mt-0.5">Your total account value = wallet balance + portfolio value.</p>
                </div>
              </div>

              <div className="flex items-start gap-2">
                <span className="text-trading-primary font-bold mt-0.5">2.</span>
                <div>
                  <p className="font-medium text-white">End of Week (Monday 11:59 PM UAE)</p>
                  <p className="text-gray-400 mt-0.5">Your new total account value is calculated.</p>
                </div>
              </div>

              <div className="flex items-start gap-2">
                <span className="text-trading-primary font-bold mt-0.5">3.</span>
                <div>
                  <p className="font-medium text-white">Deposits Are Excluded</p>
                  <p className="text-gray-400 mt-0.5">Any money you deposited during the week is subtracted to ensure fair ranking system.</p>
                </div>
              </div>

              <div className="flex items-start gap-2">
                <span className="text-trading-primary font-bold mt-0.5">4.</span>
                <div>
                  <p className="font-medium text-white">Ranked by Return %</p>
                  <p className="text-gray-400 mt-0.5">Users with highest returns are ranked at the top.</p>
                </div>
              </div>
            </div>

            <div className="bg-blue-500/10 rounded-lg p-2.5 border border-blue-500/20">
              <p className="text-blue-300 text-[11px]">
                <span className="font-semibold">💡 Example:</span> Start with $1,000, end with $1,150, deposit $50 → 
                Return = ($1,150 - $1,000 - $50) / $1,000 = <span className="font-bold text-green-400">10%</span>
              </p>
            </div>

            <div className="text-[10px] text-gray-500 pt-1 border-t border-gray-700/50">
              Rankings are calculated weekly from Monday 03:00 to Monday 02:59 and updated every Monday at 03:00 (UAE time).
            </div>
          </div>
        </Card>
      )}

      {/* Floating Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className="group relative flex items-center justify-center w-12 h-12 bg-trading-primary hover:bg-trading-primary/90 text-white rounded-full shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-110"
        aria-label="Leaderboard calculation info"
      >
        <HelpCircle className="w-6 h-6" />
          {/* Tooltip on hover (desktop only) */}
        {isHovered && !isOpen && (
          <div className={`hidden md:block absolute ${tooltipPositionClasses[position]} px-3 py-1.5 bg-gray-900 text-white text-xs rounded-lg shadow-lg whitespace-nowrap border border-gray-700 animate-in fade-in duration-150`}>
            How are rankings calculated?
            <div className={`absolute w-2 h-2 bg-gray-900 border-gray-700 transform rotate-45 ${
              position.includes('bottom') ? '-bottom-1 border-b border-r' : '-top-1 border-t border-l'
            } ${position.includes('right') ? 'right-4' : 'left-4'}`}></div>
          </div>
        )}
      </button>
    </div>
  );
};
