// Realtime Market Hook
// React hook for live market updates and price changes

import { useEffect, useState } from 'react';
import { realtimeService } from '../lib/services/realtime.service';
import { RealtimeChannel } from '@supabase/supabase-js';
import { logger } from '../lib/logger';

interface MarketUpdate {
  team: any;
  timestamp: Date;
}

export const useRealtimeMarket = () => {
  const [lastUpdate, setLastUpdate] = useState<MarketUpdate | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    let channel: RealtimeChannel;

    const setupSubscription = async () => {
      try {
        channel = realtimeService.subscribeToMarketUpdates((team) => {
          setLastUpdate({ team, timestamp: new Date() });
          setIsConnected(true);
          logger.debug('Market update received:', team.name);
        });

        // Set connected after a short delay to ensure subscription is active
        setTimeout(() => setIsConnected(true), 1000);
      } catch (error) {
        logger.error('Error setting up market subscription:', error);
        setIsConnected(false);
      }
    };

    setupSubscription();

    return () => {
      if (channel) {
        realtimeService.unsubscribe(channel);
        setIsConnected(false);
      }
    };
  }, []);

  return { 
    lastUpdate, 
    isConnected,
    hasUpdates: lastUpdate !== null
  };
};
