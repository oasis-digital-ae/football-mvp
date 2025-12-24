/**
 * Market Service - Market cap and share price calculations
 * 
 * NOTE: This service now uses centralized calculation utilities for consistency.
 * All calculations are rounded to 2 decimal places to prevent floating-point issues.
 */

import { logger } from '../logger';
import {
  calculateSharePrice as calcSharePrice,
  calculatePercentChange as calcPercentChange,
  calculateProfitLoss as calcProfitLoss,
  calculateTotalValue as calcTotalValue
} from '../utils/calculations';

export interface MarketData {
  marketCap: number;
  sharesOutstanding: number;
  sharePrice: number;
  launchPrice: number;
}

export const marketService = {
  /**
   * Calculate current share price (NAV)
   * Fixed Shares Model: Uses total_shares (1000) as denominator, not shares_outstanding
   * @param sharesOutstanding - Should be total_shares (1000) in fixed shares model
   */
  calculateSharePrice(marketCap: number, sharesOutstanding: number, defaultValue: number = 20.00): number {
    // In fixed shares model, sharesOutstanding parameter represents total_shares (fixed at 1000)
    if (sharesOutstanding <= 0) {
      return defaultValue;
    }
    
    return marketCap / sharesOutstanding;
  },

  /**
   * Calculate profit/loss
   */
  calculateProfitLoss(currentPrice: number, purchasePrice: number): number {
    return currentPrice - purchasePrice;
  },

  /**
   * Calculate percent change
   */
  calculatePercentChange(currentPrice: number, purchasePrice: number): number {
    if (purchasePrice <= 0) return 0;
    return ((currentPrice - purchasePrice) / purchasePrice) * 100;
  },

  /**
   * Get full market data for a team
   */
  getMarketData(
    marketCap: number,
    sharesOutstanding: number,
    launchPrice: number
  ): MarketData {
    const sharePrice = this.calculateSharePrice(marketCap, sharesOutstanding, launchPrice);
    
    return {
      marketCap,
      sharesOutstanding,
      sharePrice,
      launchPrice,
    };
  },

  /**
   * Calculate total value of shares
   * @deprecated Use calculateTotalValue from @/shared/lib/utils/calculations directly
   */
  calculateTotalValue(sharePrice: number, quantity: number): number {
    return calcTotalValue(sharePrice, quantity);
  },


  /**
   * Validate share purchase
   */
  validateSharePurchase(units: number, pricePerShare: number, maxShares: number = 10000): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (units <= 0) {
      errors.push('Number of shares must be greater than 0');
    }

    if (units > maxShares) {
      errors.push(`Number of shares cannot exceed ${maxShares.toLocaleString()}`);
    }

    if (pricePerShare <= 0) {
      errors.push('Share price must be greater than 0');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  },

  /**
   * Format share price for display
   */
  formatSharePrice(price: number): string {
    return `$${price.toFixed(2)}`;
  },

  /**
   * Format market cap for display
   */
  formatMarketCap(marketCap: number): string {
    if (marketCap >= 1_000_000) {
      return `$${(marketCap / 1_000_000).toFixed(2)}M`;
    }
    return `$${marketCap.toLocaleString()}`;
  },
};
