// Hook for fetching timeline events (orders and fixtures)
import { useState, useEffect, useCallback } from 'react';
import { adminService } from '@/shared/lib/services/admin.service';
import type { TimelineEvent } from '../types/admin.types';

export const useTimelineEvents = (teamId?: number) => {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEvents = useCallback(async (currentTeamId?: number) => {
    if (!currentTeamId) {
      setEvents([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const data = await adminService.getOrdersAndFixturesTimeline(currentTeamId);
      setEvents(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch timeline events');
      console.error('Error fetching timeline events:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEvents(teamId);
  }, [fetchEvents, teamId]);

  return {
    events,
    loading,
    error,
    refetch: () => fetchEvents(teamId)
  };
};

