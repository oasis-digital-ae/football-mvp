// Realtime Orders Hook
// React hook for live order feed and trading activity

import { useEffect, useState } from 'react';
import { realtimeService } from '../lib/services/realtime.service';
import { RealtimeChannel } from '@supabase/supabase-js';
import { logger } from '../lib/logger';

interface OrderFeedItem {
  order: any;
  timestamp: Date;
}

export const useRealtimeOrders = () => {
  const [recentOrders, setRecentOrders] = useState<OrderFeedItem[]>([]);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    let channel: RealtimeChannel;

    const setupSubscription = async () => {
      try {
        channel = realtimeService.subscribeToOrderFeed((order) => {
          const newOrderItem: OrderFeedItem = {
            order,
            timestamp: new Date()
          };
          
          setRecentOrders(prev => [newOrderItem, ...prev].slice(0, 20)); // Keep last 20 orders
          setIsConnected(true);
          logger.debug('New order received:', order.id);
        });

        // Set connected after a short delay to ensure subscription is active
        setTimeout(() => setIsConnected(true), 1000);
      } catch (error) {
        logger.error('Error setting up order subscription:', error);
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

  const clearOrders = () => {
    setRecentOrders([]);
  };

  return { 
    recentOrders, 
    isConnected,
    hasOrders: recentOrders.length > 0,
    clearOrders
  };
};
