// Realtime Service for Supabase Subscriptions
// Central service for all realtime subscriptions in the trading platform

import { supabase } from '../supabase';
import { RealtimeChannel } from '@supabase/supabase-js';
import { logger } from '../logger';

export const realtimeService = {
  /**
   * Subscribe to team market cap updates
   * Triggers when any team's market cap or shares change
   */
  subscribeToMarketUpdates(callback: (team: any) => void): RealtimeChannel {
    const channel = supabase
      .channel('market-updates')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'teams' },
        (payload) => {
          logger.debug('Team updated:', payload.new);
          callback(payload.new);
        }
      )
      .subscribe();

    logger.info('Subscribed to market updates');
    return channel;
  },

  /**
   * Subscribe to new orders (trade feed)
   * Shows live trading activity across all users
   */
  subscribeToOrderFeed(callback: (order: any) => void): RealtimeChannel {
    const channel = supabase
      .channel('order-feed')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'orders', filter: 'status=eq.FILLED' },
        (payload) => {
          logger.debug('New filled order:', payload.new);
          callback(payload.new);
        }
      )
      .subscribe();

    logger.info('Subscribed to order feed');
    return channel;
  },

  /**
   * Subscribe to user's portfolio changes
   * Real-time updates for user's positions and investments
   */
  subscribeToPortfolio(userId: string, callback: (position: any) => void): RealtimeChannel {
    const channel = supabase
      .channel(`portfolio-${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'positions', filter: `user_id=eq.${userId}` },
        (payload) => {
          logger.debug('Portfolio updated:', payload);
          callback(payload.new || payload.old);
        }
      )
      .subscribe();

    logger.info('Subscribed to portfolio updates for user:', userId);
    return channel;
  },

  /**
   * Subscribe to match results
   * Triggers when match results are processed and applied
   */
  subscribeToMatchResults(callback: (fixture: any) => void): RealtimeChannel {
    const channel = supabase
      .channel('match-results')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'fixtures', filter: 'status=eq.applied' },
        (payload) => {
          logger.debug('Match result applied:', payload.new);
          callback(payload.new);
        }
      )
      .subscribe();

    logger.info('Subscribed to match results');
    return channel;
  },

  /**
   * Subscribe to audit log entries
   * For admin dashboard real-time activity monitoring
   */
  subscribeToAuditLog(callback: (auditEntry: any) => void): RealtimeChannel {
    const channel = supabase
      .channel('audit-log')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'audit_log' },
        (payload) => {
          logger.debug('New audit log entry:', payload.new);
          callback(payload.new);
        }
      )
      .subscribe();

    logger.info('Subscribed to audit log');
    return channel;
  },

  /**
   * Subscribe to system-wide activity
   * Combines multiple events for admin monitoring
   */
  subscribeToSystemActivity(callback: (activity: any) => void): RealtimeChannel {
    const channel = supabase
      .channel('system-activity')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'orders' },
        (payload) => {
          callback({
            type: 'order',
            data: payload.new,
            timestamp: new Date()
          });
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'teams' },
        (payload) => {
          callback({
            type: 'market_update',
            data: payload.new,
            timestamp: new Date()
          });
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'audit_log' },
        (payload) => {
          callback({
            type: 'audit',
            data: payload.new,
            timestamp: new Date()
          });
        }
      )
      .subscribe();

    logger.info('Subscribed to system activity');
    return channel;
  },

  /**
   * Unsubscribe from a channel
   */
  async unsubscribe(channel: RealtimeChannel): Promise<void> {
    try {
      await supabase.removeChannel(channel);
      logger.info('Unsubscribed from channel');
    } catch (error) {
      logger.error('Error unsubscribing from channel:', error);
    }
  },

  /**
   * Unsubscribe from multiple channels
   */
  async unsubscribeAll(channels: RealtimeChannel[]): Promise<void> {
    try {
      await Promise.all(channels.map(channel => supabase.removeChannel(channel)));
      logger.info('Unsubscribed from all channels');
    } catch (error) {
      logger.error('Error unsubscribing from channels:', error);
    }
  }
};
