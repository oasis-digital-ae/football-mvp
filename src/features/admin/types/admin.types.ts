// Admin panel type definitions
import type { DatabaseOrder, DatabasePosition } from '@/shared/lib/services/types';

// System statistics for admin dashboard
export interface SystemStats {
  totalCashInjected: number;
  totalActiveUsers: number;
  totalTradesExecuted: number;
  averageTradeSize: number;
  marketCapOverview: TeamMarketCapOverview[];
  lastUpdated: string;
}

export interface TeamMarketCapOverview {
  teamId: number;
  teamName: string;
  currentMarketCap: number;
  totalInvestments: number;
  sharePrice: number;
  sharesOutstanding: number;
}

// Individual purchase record (one row per order)
export interface UserInvestment {
  userId: string;
  username: string;
  fullName?: string;
  totalInvested: number;
  numberOfTeams: number;
  largestPosition: {
    teamName: string;
    amount: number;
  };
  firstInvestmentDate: string;
  lastActivityDate: string;
  totalPortfolioValue: number;
  profitLoss: number;
  // Additional fields for individual purchases
  orderId?: number;
  orderType?: 'BUY' | 'SELL';
  shares?: number;
  pricePerShare?: number;
  teamName?: string;
  executedAt?: string;
  marketCapBefore?: number;
  marketCapAfter?: number;
  sharesOutstandingBefore?: number;
  sharesOutstandingAfter?: number;
  currentSharePrice?: number;
}

// Trade history with filters
export interface TradeHistoryFilters {
  dateRange?: {
    start: string;
    end: string;
  };
  userId?: string;
  teamId?: number;
  orderType?: 'BUY' | 'SELL' | 'ALL';
  minAmount?: number;
  maxAmount?: number;
  status?: 'PENDING' | 'FILLED' | 'CANCELLED' | 'ALL';
}

export interface TradeHistoryEntry extends DatabaseOrder {
  username: string;
  teamName: string;
  marketCapBefore?: number;
  marketCapAfter?: number;
}

// Timeline events for public order history
export interface TimelineEvent {
  type: 'fixture' | 'order';
  timestamp: Date;
  data: FixtureEvent | OrderEvent;
}

export interface FixtureEvent {
  id: number;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  result: 'home_win' | 'away_win' | 'draw';
  marketCapBefore: number;
  marketCapAfter: number;
  marketCapChange: number;
  marketCapChangePercent: number;
}

export interface OrderEvent {
  id: number;
  username: string;
  teamName: string;
  orderType: 'BUY' | 'SELL';
  quantity: number;
  pricePerShare: number;
  totalAmount: number;
  marketCapBefore?: number;
  marketCapAfter?: number;
}

// Admin panel state
export interface AdminPanelState {
  systemStats: SystemStats | null;
  userInvestments: UserInvestment[];
  tradeHistory: TradeHistoryEntry[];
  isLoading: boolean;
  error: string | null;
  lastRefresh: Date | null;
}

// Export filters for CSV
export interface ExportOptions {
  format: 'csv' | 'json';
  includeUserDetails: boolean;
  includeMarketCapData: boolean;
  dateRange?: {
    start: string;
    end: string;
  };
}

// Audit log entry for admin actions
export interface AdminAuditLog {
  id: number;
  adminUserId: string;
  action: 'dashboard_viewed' | 'data_exported' | 'filters_applied' | 'user_data_accessed';
  details: Record<string, any>;
  timestamp: string;
  ipAddress?: string;
  userAgent?: string;
}

