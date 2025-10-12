// Hook for fetching and filtering trade history
import { useState, useEffect, useCallback } from 'react';
import { adminService } from '@/shared/lib/services/admin.service';
import type { TradeHistoryEntry, TradeHistoryFilters } from '../types/admin.types';

export const useTradeHistory = (initialFilters?: TradeHistoryFilters) => {
  const [trades, setTrades] = useState<TradeHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<TradeHistoryFilters>(initialFilters || {});

  const fetchTrades = useCallback(async (currentFilters: TradeHistoryFilters) => {
    try {
      setLoading(true);
      setError(null);
      const data = await adminService.getTradeHistory(currentFilters);
      setTrades(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch trade history');
      console.error('Error fetching trade history:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const updateFilters = useCallback((newFilters: TradeHistoryFilters) => {
    setFilters(newFilters);
    fetchTrades(newFilters);
  }, [fetchTrades]);

  const clearFilters = useCallback(() => {
    const emptyFilters: TradeHistoryFilters = {};
    setFilters(emptyFilters);
    fetchTrades(emptyFilters);
  }, [fetchTrades]);

  useEffect(() => {
    fetchTrades(filters);
  }, [fetchTrades, filters]);

  return {
    trades,
    loading,
    error,
    filters,
    updateFilters,
    clearFilters,
    refetch: () => fetchTrades(filters)
  };
};

