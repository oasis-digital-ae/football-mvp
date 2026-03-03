import { useMemo } from 'react';

/**
 * Centralized Net Worth calculation hook
 * This ensures consistent Net Worth and P&L calculations across the entire platform
 * 
 * Net Worth Formula: Portfolio Value + Wallet Balance - Credit Balance
 * P&L Formula: Net Worth - Total Deposits (actual cash only)
 * P&L Percentage: (P&L / (Total Deposits + Credit Balance)) * 100
 */
export interface NetWorthData {
  // Core Values
  netWorth: number;
  portfolioValue: number;
  walletBalance: number;
  creditBalance: number;
  totalDeposits: number;
  
  // Calculated Values
  totalDepositsWithCredit: number;
  pnl: number;
  pnlPercentage: string;
  
  // Status Flags
  isProfit: boolean;
  isLoss: boolean;
  isBreakEven: boolean;
}

interface UseNetWorthParams {
  portfolioValue?: number;
  walletBalance?: number;
  creditBalance?: number;
  totalDeposits?: number;
}

export const useNetWorth = ({
  portfolioValue = 0,
  walletBalance = 0,
  creditBalance = 0,
  totalDeposits = 0,
}: UseNetWorthParams = {}): NetWorthData => {
  return useMemo(() => {
    // Net Worth = Portfolio + Wallet - Credit (credit is a liability)
    const netWorth = walletBalance + portfolioValue - creditBalance;
    
    // Total deposited includes both cash deposits AND credit (for percentage calculation)
    const totalDepositsWithCredit = totalDeposits + creditBalance;
    
    // P&L = Net Worth - Actual Cash Deposited (NOT including credit)
    const pnl = netWorth - totalDeposits;
    
    // Status flags
    const isProfit = pnl > 0;
    const isLoss = pnl < 0;
    const isBreakEven = pnl === 0;
    
    // Use totalDepositsWithCredit for percentage calculation (credit + actual deposits)
    const pnlPercentage = totalDepositsWithCredit !== 0 
      ? ((pnl / totalDepositsWithCredit) * 100).toFixed(2) 
      : '0.00';
    
    return {
      netWorth,
      portfolioValue,
      walletBalance,
      creditBalance,
      totalDeposits,
      totalDepositsWithCredit,
      pnl,
      pnlPercentage,
      isProfit,
      isLoss,
      isBreakEven,
    };
  }, [portfolioValue, walletBalance, creditBalance, totalDeposits]);
};

/**
 * Calculate Net Worth for admin panel or other contexts where you have raw values
 * This is a pure function version that doesn't use React hooks
 */
export const calculateNetWorth = (
  portfolioValue: number = 0,
  walletBalance: number = 0,
  creditBalance: number = 0,
  totalDeposits: number = 0
): NetWorthData => {
  // Net Worth = Portfolio + Wallet - Credit (credit is a liability)
  const netWorth = walletBalance + portfolioValue - creditBalance;
  
  // Total deposited includes both cash deposits AND credit (for percentage calculation)
  const totalDepositsWithCredit = totalDeposits + creditBalance;
  
  // P&L = Net Worth - Actual Cash Deposited (NOT including credit)
  const pnl = netWorth - totalDeposits;
  
  // Status flags
  const isProfit = pnl > 0;
  const isLoss = pnl < 0;
  const isBreakEven = pnl === 0;
  
  // Use totalDepositsWithCredit for percentage calculation (credit + actual deposits)
  const pnlPercentage = totalDepositsWithCredit !== 0 
    ? ((pnl / totalDepositsWithCredit) * 100).toFixed(2) 
    : '0.00';
  
  return {
    netWorth,
    portfolioValue,
    walletBalance,
    creditBalance,
    totalDeposits,
    totalDepositsWithCredit,
    pnl,
    pnlPercentage,
    isProfit,
    isLoss,
    isBreakEven,
  };
};
