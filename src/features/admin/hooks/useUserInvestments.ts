// Hook for fetching user investment data
import { useState, useEffect } from 'react';
import { adminService } from '@/shared/lib/services/admin.service';
import type { UserInvestment } from '../types/admin.types';

export const useUserInvestments = () => {
  const [investments, setInvestments] = useState<UserInvestment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchInvestments = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await adminService.getUserInvestments();
      setInvestments(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch user investments');
      console.error('Error fetching user investments:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInvestments();
  }, []);

  return {
    investments,
    loading,
    error,
    refetch: fetchInvestments
  };
};

