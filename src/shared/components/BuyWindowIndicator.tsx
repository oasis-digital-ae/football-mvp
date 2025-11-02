import React, { useState, useEffect } from 'react';
import { buyWindowService } from '@/shared/lib/buy-window.service';

interface BuyWindowIndicatorProps {
  teamId: number;
  compact?: boolean;
  showCountdown?: boolean;
}

export const BuyWindowIndicator: React.FC<BuyWindowIndicatorProps> = ({ 
  teamId, 
  compact = false, 
  showCountdown = true 
}) => {
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [timeLeft, setTimeLeft] = useState<string>('');

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const result = await buyWindowService.getBuyWindowDisplayInfo(teamId);
        setStatus(result);
      } catch (error) {
        console.error('Error fetching buy window status:', error);
        setStatus({ isOpen: false, message: 'Unable to check trading status' });
      } finally {
        setLoading(false);
      }
    };

    fetchStatus();
    
    // Refresh every 30 seconds
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, [teamId]);

  useEffect(() => {
    if (!status || !showCountdown) return;

    const updateDisplay = () => {
      if (status.isOpen && status.nextAction) {
        // Extract time from nextAction (e.g., "Closes at 12/25/2024, 2:30:00 PM")
        const timeMatch = status.nextAction.match(/(\d{1,2}\/\d{1,2}\/\d{4}, \d{1,2}:\d{2}:\d{2} [AP]M)/);
        if (timeMatch) {
          const closeTime = new Date(timeMatch[1]);
          
          // Format as "until Oct 26, 2:30 PM"
          const formatted = closeTime.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
          });
          setTimeLeft(`until ${formatted}`);
        }
      } else if (!status.isOpen && status.nextAction) {
        // Extract match time from nextAction
        const timeMatch = status.nextAction.match(/(\d{1,2}\/\d{1,2}\/\d{4}, \d{1,2}:\d{2}:\d{2} [AP]M)/);
        if (timeMatch) {
          const matchTime = new Date(timeMatch[1]);
          
          // Format as "until Oct 26, 2:30 PM"
          const formatted = matchTime.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
          });
          setTimeLeft(`reopens ${formatted}`);
        }
      }
    };

    updateDisplay();
    const interval = setInterval(updateDisplay, 60000); // Update every minute instead of every second
    return () => clearInterval(interval);
  }, [status, showCountdown]);

  if (loading) {
    return (
      <div className={`flex items-center gap-2 ${compact ? 'text-xs' : 'text-sm'}`}>
        <div className="w-2 h-2 bg-gray-500 rounded-full animate-pulse" />
        <span className="text-gray-400">Checking...</span>
      </div>
    );
  }

  if (!status) return null;

  const textSize = compact ? 'text-xs' : 'text-sm';

  return (
    <div className={`flex items-center gap-1.5 ${textSize}`}>
      {/* Status Icon */}
      <div className="flex items-center justify-center">
        {status.isOpen ? (
          <svg className="w-3 h-3 text-green-500" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
        ) : (
          <svg className="w-3 h-3 text-red-500" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
        )}
      </div>
      
      {/* Status Text */}
      <span className={status.isOpen ? 'text-green-500 font-medium' : 'text-red-500 font-medium'}>
        {status.isOpen ? 'Open' : 'Closed'}
      </span>
      
      {/* Time Display */}
      {showCountdown && timeLeft && (
        <span className={`${status.isOpen ? 'text-green-400' : 'text-red-400'}`}>
          {timeLeft}
        </span>
      )}
    </div>
  );
};

export default BuyWindowIndicator;

