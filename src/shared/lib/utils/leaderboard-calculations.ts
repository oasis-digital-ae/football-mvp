/**
 * Centralized Weekly Leaderboard Calculations
 * 
 * This module provides calculation functions for weekly leaderboard metrics.
 * Uses Decimal.js for precision to ensure consistency between backend and frontend.
 * 
 * All calculations:
 * - Use Decimal internally for precision
 * - Return numbers rounded to appropriate decimal places
 * - Match the database schema expectations
 * 
 * Database schema (bigint stored as cents, but returned as numbers):
 * - start_wallet_value: bigint (cents)
 * - start_portfolio_value: bigint (cents)
 * - start_account_value: bigint (cents)
 * - end_wallet_value: bigint (cents)
 * - end_portfolio_value: bigint (cents)
 * - end_account_value: bigint (cents)
 * - deposits_week: bigint (cents)
 * - weekly_return: numeric(10, 6) (decimal fraction, NOT percentage)
 */

import { Decimal, toDecimal, roundForDisplay, fromCents, toCents } from './decimal';

/**
 * Convert cents to number (from database BIGINT values)
 * Convenience function that returns a number instead of Decimal
 * LOCAL UTILITY - Kept here to avoid touching decimal.ts
 * 
 * @param cents - Number of cents (BIGINT from database)
 * @returns Amount in dollars as number (rounded to 2 decimal places)
 */
function fromCentsToNumber(cents: number | string | null | undefined): number {
  return roundForDisplay(fromCents(cents));
}

/**
 * User wallet and portfolio data for leaderboard calculations
 */
export interface UserLeaderboardData {
  user_id: string;
  full_name?: string | null;
  
  // Start of week values (in dollars)
  start_wallet_value: number;
  start_portfolio_value: number;
  start_account_value: number;
  
  // End of week values (in dollars)
  end_wallet_value: number;
  end_portfolio_value: number;
  end_account_value: number;
  
  // Deposits during the week (in dollars)
  deposits_week: number;
}

/**
 * Calculated leaderboard entry
 */
export interface LeaderboardEntry extends UserLeaderboardData {
  weekly_return: number; // Decimal fraction (NOT percentage)
  rank: number;
}

/**
 * Calculate account value (wallet + portfolio)
 * 
 * @param walletValue - Wallet value in dollars
 * @param portfolioValue - Portfolio value in dollars
 * @returns Account value rounded to 2 decimal places
 */
export const calculateAccountValue = (
  walletValue: number | string | Decimal,
  portfolioValue: number | string | Decimal
): number => {
  const wallet = toDecimal(walletValue);
  const portfolio = toDecimal(portfolioValue);
  const accountValue = wallet.plus(portfolio);
  return roundForDisplay(accountValue);
};

/**
 * Calculate weekly return (ROI) for leaderboard
 * 
 * Formula: (End Account Value - Start Account Value - Deposits) / (Start Account Value + Deposits)
 * 
 * This formula accounts for deposits during the week:
 * - If deposits = 0: Simple ROI = (end - start) / start
 * - If deposits > 0: Adjusted ROI considering the added capital
 * 
 * Edge cases:
 * - If denominator (start + deposits) <= 0, return 0
 * - If user only deposited (no trading activity), return 0
 * - If user is new (start = 0, deposits > 0), calculate return on deposits
 * - Returns a decimal fraction (e.g., 0.0523 for 5.23%)
 * - Rounded to 6 decimal places to match DB schema: numeric(10, 6)
 * 
 * PRECISION GUARANTEE:
 * - Uses Decimal.js with 28 digits precision internally
 * - Rounds ONLY at the final step to 6 decimal places
 * - Ensures consistent rounding across all calculations
 * 
 * @param startAccountValue - Account value at start of week (dollars)
 * @param endAccountValue - Account value at end of week (dollars)
 * @param depositsWeek - Total deposits during the week (dollars)
 * @returns Weekly return as decimal fraction (NOT percentage), 6 decimal places
 */
export const calculateWeeklyReturn = (
  startAccountValue: number | string | Decimal,
  endAccountValue: number | string | Decimal,
  depositsWeek: number | string | Decimal
): number => {
  const startAccount = toDecimal(startAccountValue);
  const endAccount = toDecimal(endAccountValue);
  const deposits = toDecimal(depositsWeek);
  
  // Denominator: start account + deposits
  const denominator = startAccount.plus(deposits);
  
  // Edge case 1: No capital at all (new user, no deposits) OR denominator too small (numerical stability)
  if (denominator.lte(0) || denominator.abs().lt(0.01)) {
    return 0;
  }
  
  // Numerator: end account - start account - deposits
  const numerator = endAccount.minus(startAccount).minus(deposits);
  
  // Edge case 2: User only deposited, no trading (numerator = 0 exactly)
  // This ensures deposit-only weeks show 0% return, not counting deposits as gains
  if (numerator.abs().lt(0.01)) {
    return 0;
  }
  
  // Weekly return = numerator / denominator
  let weeklyReturn = numerator.dividedBy(denominator);
  
  // Safety check: Cap unrealistic returns (more than 1000% or less than -99%)
  // This prevents data corruption from breaking the leaderboard
  const minReturn = new Decimal(-0.99);
  const maxReturn = new Decimal(10);
  
  const originalReturn = weeklyReturn;
  if (weeklyReturn.lt(minReturn)) {
    weeklyReturn = minReturn;
  } else if (weeklyReturn.gt(maxReturn)) {
    weeklyReturn = maxReturn;
  }
  
  // Log if we had to cap the return
  if (!weeklyReturn.equals(originalReturn)) {
    console.warn(`⚠️ Capped extreme return: ${originalReturn.toFixed(4)} → ${weeklyReturn.toFixed(4)}`);
    console.warn(`  Start: ${startAccount.toFixed(2)}, End: ${endAccount.toFixed(2)}, Deposits: ${deposits.toFixed(2)}`);
  }
  
  // CRITICAL: Round to exactly 6 decimal places using HALF_UP rounding
  // This matches PostgreSQL numeric(10, 6) behavior
  return weeklyReturn.toDecimalPlaces(6, Decimal.ROUND_HALF_UP).toNumber();
};

/**
 * Calculate and rank leaderboard entries
 * 
 * @param userData - Array of user data with start/end values and deposits
 * @returns Sorted and ranked leaderboard entries (highest return = rank 1)
 */
export const calculateLeaderboard = (
  userData: UserLeaderboardData[]
): LeaderboardEntry[] => {
  // Calculate weekly return for each user
  const entriesWithReturns = userData.map(user => ({
    ...user,
    weekly_return: calculateWeeklyReturn(
      user.start_account_value,
      user.end_account_value,
      user.deposits_week
    )
  }));
  
  // Sort by weekly return (descending - highest return first)
  const sortedEntries = [...entriesWithReturns].sort((a, b) => {
    return b.weekly_return - a.weekly_return;
  });
  
  // Assign ranks (1 = highest return)
  const rankedEntries: LeaderboardEntry[] = sortedEntries.map((entry, index) => ({
    ...entry,
    rank: index + 1
  }));
  
  return rankedEntries;
};

/**
 * Convert leaderboard entry to database format (bigint cents for storage)
 * 
 * @param entry - Leaderboard entry with values in dollars
 * @returns Entry with values converted to cents (for bigint storage)
 */
export const toLeaderboardDbFormat = (
  entry: LeaderboardEntry
): Record<string, any> => {
  return {
    user_id: entry.user_id,
    rank: entry.rank,
    start_wallet_value: toCents(entry.start_wallet_value),
    start_portfolio_value: toCents(entry.start_portfolio_value),
    start_account_value: toCents(entry.start_account_value),
    end_wallet_value: toCents(entry.end_wallet_value),
    end_portfolio_value: toCents(entry.end_portfolio_value),
    end_account_value: toCents(entry.end_account_value),
    deposits_week: toCents(entry.deposits_week),
    weekly_return: entry.weekly_return // Keep as decimal fraction
  };
};

/**
 * Convert database format to leaderboard entry (cents to dollars)
 * 
 * @param dbEntry - Entry from database with cents values
 * @returns Entry with values converted to dollars
 */
export const fromLeaderboardDbFormat = (
  dbEntry: Record<string, any>
): LeaderboardEntry => {
  return {
    user_id: dbEntry.user_id,
    full_name: dbEntry.full_name,
    rank: dbEntry.rank,
    start_wallet_value: fromCentsToNumber(dbEntry.start_wallet_value),
    start_portfolio_value: fromCentsToNumber(dbEntry.start_portfolio_value),
    start_account_value: fromCentsToNumber(dbEntry.start_account_value),
    end_wallet_value: fromCentsToNumber(dbEntry.end_wallet_value),
    end_portfolio_value: fromCentsToNumber(dbEntry.end_portfolio_value),
    end_account_value: fromCentsToNumber(dbEntry.end_account_value),
    deposits_week: fromCentsToNumber(dbEntry.deposits_week),
    weekly_return: dbEntry.weekly_return // Already decimal fraction
  };
};

/**
 * Validate leaderboard calculation results
 * Checks for common issues like NaN, Infinity, negative account values
 * 
 * @param entries - Leaderboard entries to validate
 * @returns Array of validation error messages (empty if valid)
 */
export const validateLeaderboardEntries = (
  entries: LeaderboardEntry[]
): string[] => {
  const errors: string[] = [];
  
  entries.forEach((entry, index) => {
    // Check for NaN or Infinity
    const values = [
      entry.start_wallet_value,
      entry.start_portfolio_value,
      entry.start_account_value,
      entry.end_wallet_value,
      entry.end_portfolio_value,
      entry.end_account_value,
      entry.deposits_week,
      entry.weekly_return
    ];
    
    if (values.some(v => !isFinite(v))) {
      errors.push(`Entry ${index + 1} (user ${entry.user_id}): Contains NaN or Infinity`);
    }
    
    // Check for negative account values
    if (entry.end_account_value < 0) {
      errors.push(`Entry ${index + 1} (user ${entry.user_id}): Negative end account value`);
    }
    
    // Warning for unrealistic returns (>1000% or <-99%) - these should have been capped
    // Only error if they're REALLY extreme (beyond our caps)
    if (entry.weekly_return > 10) {
      errors.push(`Entry ${index + 1} (user ${entry.user_id}): Return exceeds cap ${(entry.weekly_return * 100).toFixed(2)}%`);
    }
    if (entry.weekly_return < -0.99) {
      errors.push(`Entry ${index + 1} (user ${entry.user_id}): Return below minimum ${(entry.weekly_return * 100).toFixed(2)}%`);
    }
  });
  
  return errors;
};
