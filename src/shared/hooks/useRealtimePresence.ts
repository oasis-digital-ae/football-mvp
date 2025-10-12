// Realtime Presence Hook
// React hook for tracking active users on different pages

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '@/features/auth/contexts/AuthContext';
import { logger } from '../lib/logger';

interface PresenceUser {
  user_id: string;
  username: string;
  online_at: string;
}

export const useRealtimePresence = (page: string) => {
  const [activeUsers, setActiveUsers] = useState(0);
  const [activeUserList, setActiveUserList] = useState<PresenceUser[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const { user, profile } = useAuth();

  useEffect(() => {
    if (!user || !profile) {
      setIsConnected(false);
      return;
    }

    const channel = supabase.channel(`presence-${page}`, {
      config: { presence: { key: user.id } }
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const users = Object.values(state).flat() as PresenceUser[];
        setActiveUsers(users.length);
        setActiveUserList(users);
        setIsConnected(true);
        logger.debug('Presence sync:', { page, activeUsers: users.length });
      })
      .on('presence', { event: 'join' }, ({ key, newPresences }) => {
        logger.debug('User joined:', { page, key, newPresences });
      })
      .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
        logger.debug('User left:', { page, key, leftPresences });
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({
            user_id: user.id,
            username: profile.username || user.email || 'Anonymous',
            online_at: new Date().toISOString()
          });
          setIsConnected(true);
          logger.debug('Presence tracking started:', { page, userId: user.id });
        }
      });

    return () => {
      supabase.removeChannel(channel);
      setIsConnected(false);
      setActiveUsers(0);
      setActiveUserList([]);
    };
  }, [user, profile, page]);

  return { 
    activeUsers, 
    activeUserList,
    isConnected,
    hasActiveUsers: activeUsers > 0
  };
};
