// Enhanced type definitions for database operations
import type { DatabaseTeam, DatabasePosition, DatabaseOrder } from '../lib/database';

// Extended database types with joined data
export interface DatabasePositionWithTeam extends DatabasePosition {
  team: {
    name: string;
    market_cap: number;
    shares_outstanding: number; // Keep for backward compatibility
    total_shares?: number; // Fixed at 1000
    available_shares?: number; // Platform inventory
  };
}

export interface DatabaseOrderWithTeam extends DatabaseOrder {
  team: {
    name: string;
  };
}

// Type-safe portfolio calculation result
export interface PortfolioCalculation {
  clubId: string;
  clubName: string;
  units: number;
  purchasePrice: number;
  currentPrice: number;
  totalValue: number;
  profitLoss: number;
}

// Type-safe team data for market operations
export interface TeamMarketData {
  id: number;
  name: string;
  market_cap: number;
  shares_outstanding: number; // Keep for backward compatibility
  total_shares?: number; // Fixed at 1000
  available_shares?: number; // Platform inventory
  external_id?: string;
}

// Type-safe fixture data
export interface FixtureData {
  id: number;
  home_team_id: number;
  away_team_id: number;
  kickoff_at: string;
  buy_close_at: string;
  result: 'home_win' | 'away_win' | 'draw' | 'pending';
  status: 'scheduled' | 'live' | 'closed' | 'applied' | 'postponed'; // 'closed' kept for backward compatibility
}

// Type-safe user profile data
export interface UserProfile {
  id: string;
  username?: string;
  first_name?: string;
  last_name?: string;
  full_name?: string; // Kept for backward compatibility
  birthday?: string;
  country?: string;
  phone?: string;
  created_at: string;
}

// Type-safe API response wrappers
export interface ApiResponse<T> {
  data: T;
  error: null;
}

export interface ApiError {
  data: null;
  error: {
    message: string;
    code?: string;
  };
}

// Type-safe environment configuration
export interface EnvironmentConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  appEnv: 'development' | 'production' | 'test';
  debugMode: boolean;
}

// Type-safe logging levels
export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3
}

// Type-safe form validation
export interface ValidationResult {
  isValid: boolean;
  errors: Record<string, string>;
}

// Type-safe purchase request
export interface PurchaseRequest {
  clubId: string;
  units: number;
  pricePerShare: number;
  totalCost: number;
}

// Type-safe market cap update
export interface MarketCapUpdate {
  teamId: number;
  oldMarketCap: number;
  newMarketCap: number;
  changeAmount: number;
  reason: 'purchase' | 'match_result' | 'manual_adjustment';
}
