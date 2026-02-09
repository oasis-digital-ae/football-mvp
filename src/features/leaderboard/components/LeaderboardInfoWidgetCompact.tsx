import React, { useState } from 'react';
import { HelpCircle } from 'lucide-react';

/**
 * COMPACT VERSION: Smaller, tooltip-only version
 * Use this if the client finds the full widget too intrusive
 */
export const LeaderboardInfoWidgetCompact: React.FC = () => {
  const [isHovered, setIsHovered] = useState(false);
  return (
    <div className="fixed bottom-20 md:bottom-6 right-6 z-50">
      <button
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onClick={() => setIsHovered(!isHovered)}
        className="group relative flex items-center justify-center w-10 h-10 bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white rounded-full shadow-md hover:shadow-lg transition-all duration-200 border border-gray-700"
        aria-label="Leaderboard calculation info"
      >
        <HelpCircle className="w-5 h-5" />
        
        {/* Compact Tooltip */}
        {isHovered && (
          <div className="absolute bottom-full right-0 mb-2 w-64 p-3 bg-gray-900 text-white text-xs rounded-lg shadow-xl border border-gray-700 animate-in fade-in duration-200">
            <p className="font-semibold mb-1.5 text-trading-primary">Weekly Ranking Formula:</p>
            <p className="font-mono text-[10px] mb-2 text-gray-300">
              Return = (End - Start - Deposits) / Start
            </p>
            <p className="text-gray-400 leading-relaxed">
              Rankings based on your % return from Monday to Monday, excluding any deposits you made.
            </p>
            <div className="absolute w-2 h-2 bg-gray-900 border-gray-700 transform rotate-45 -bottom-1 right-4 border-b border-r"></div>
          </div>
        )}
      </button>
    </div>
  );
};
