/**
 * Centralized Calculation Utilities
 * 
 * All financial calculations should use these functions to ensure consistency
 * across the entire application. All calculations use Decimal internally for
 * precision, then round to 2 decimal places for display.
 * 
 * Pattern:
 * - Internal: Use Decimal with full precision for accuracy
 * - Display: Round to 2 decimal places (matching backend)
 */

import { Decimal, toDecimal, roundForDisplay } from './decimal';

/**
 * Round a number to 2 decimal places
 * Uses Decimal internally for precision, returns number for compatibility
 */
export const roundToTwoDecimals = (value: number | string | Decimal): number => {
  return roundForDisplay(toDecimal(value));
};

/**
 * Calculate share price (NAV) from market cap and total shares
 * Fixed Shares Model: Uses total_shares (1000) as denominator
 * 
 * @param marketCap - Current market cap
 * @param totalShares - Total shares (fixed at 1000)
 * @param defaultValue - Default value if totalShares is 0 (default: 20.00)
 * @returns Share price rounded to 2 decimal places
 */
export const calculateSharePrice = (
  marketCap: number | string | Decimal,
  totalShares: number | string | Decimal,
  defaultValue: number | string | Decimal = 20.00
): number => {
  const shares = toDecimal(totalShares);
  if (shares.lte(0)) {
    return roundForDisplay(toDecimal(defaultValue));
  }
  const cap = toDecimal(marketCap);
  const price = cap.dividedBy(shares);
  return roundForDisplay(price);
};

/**
 * Calculate percent change from one value to another
 * 
 * @param currentValue - Current value
 * @param previousValue - Previous/base value (e.g., launch price, purchase price)
 * @returns Percent change rounded to 2 decimal places
 */
export const calculatePercentChange = (
  currentValue: number | string | Decimal,
  previousValue: number | string | Decimal
): number => {
  const prev = toDecimal(previousValue);
  if (prev.lte(0)) {
    return 0;
  }
  const current = toDecimal(currentValue);
  const change = current.minus(prev).dividedBy(prev).times(100);
  return roundForDisplay(change);
};

/**
 * Calculate profit/loss (absolute value difference)
 * 
 * @param currentValue - Current value
 * @param previousValue - Previous/base value (e.g., launch price, purchase price)
 * @returns Profit/loss rounded to 2 decimal places
 */
export const calculateProfitLoss = (
  currentValue: number | string | Decimal,
  previousValue: number | string | Decimal
): number => {
  const current = toDecimal(currentValue);
  const previous = toDecimal(previousValue);
  const difference = current.minus(previous);
  return roundForDisplay(difference);
};

/**
 * Calculate total value (price * quantity)
 * 
 * @param pricePerUnit - Price per unit
 * @param quantity - Quantity
 * @returns Total value rounded to 2 decimal places
 */
export const calculateTotalValue = (
  pricePerUnit: number | string | Decimal,
  quantity: number | string | Decimal
): number => {
  const price = toDecimal(pricePerUnit);
  const qty = toDecimal(quantity);
  const total = price.times(qty);
  return roundForDisplay(total);
};

/**
 * Calculate average cost basis
 * 
 * @param totalInvested - Total amount invested
 * @param quantity - Quantity of shares
 * @returns Average cost per share rounded to 2 decimal places
 */
export const calculateAverageCost = (
  totalInvested: number | string | Decimal,
  quantity: number | string | Decimal
): number => {
  const qty = toDecimal(quantity);
  if (qty.lte(0)) {
    return 0;
  }
  const invested = toDecimal(totalInvested);
  const avgCost = invested.dividedBy(qty);
  return roundForDisplay(avgCost);
};

/**
 * Calculate portfolio percentage (portion of total)
 * 
 * @param itemValue - Value of the item
 * @param totalValue - Total portfolio value
 * @returns Percentage rounded to 2 decimal places
 */
export const calculatePortfolioPercentage = (
  itemValue: number | string | Decimal,
  totalValue: number | string | Decimal
): number => {
  const total = toDecimal(totalValue);
  if (total.lte(0)) {
    return 0;
  }
  const item = toDecimal(itemValue);
  const percentage = item.dividedBy(total).times(100);
  return roundForDisplay(percentage);
};

/**
 * Calculate lifetime percent change from launch price
 * This is the standard calculation used throughout the app for "Gain/Loss"
 * 
 * @param currentPrice - Current share price
 * @param launchPrice - Launch price
 * @returns Percent change rounded to 2 decimal places
 */
export const calculateLifetimePercentChange = (
  currentPrice: number,
  launchPrice: number
): number => {
  return calculatePercentChange(currentPrice, launchPrice);
};

/**
 * Calculate matchday-to-matchday percent change
 * Used for calculating change between consecutive matchdays
 * 
 * @param priceAfterLastMatch - Price after the most recent match
 * @param priceAfterPreviousMatch - Price after the previous match
 * @returns Percent change rounded to 2 decimal places
 */
export const calculateMatchdayPercentChange = (
  priceAfterLastMatch: number,
  priceAfterPreviousMatch: number
): number => {
  return calculatePercentChange(priceAfterLastMatch, priceAfterPreviousMatch);
};

/**
 * Calculate price impact percent from market cap change
 * Used for displaying match result impacts
 * 
 * @param marketCapAfter - Market cap after the event
 * @param marketCapBefore - Market cap before the event
 * @returns Percent change rounded to 2 decimal places
 */
export const calculatePriceImpactPercent = (
  marketCapAfter: number,
  marketCapBefore: number
): number => {
  return calculatePercentChange(marketCapAfter, marketCapBefore);
};

/**
 * Calculate share price impact from market cap change
 * Converts market cap change to share price change
 * 
 * @param marketCapAfter - Market cap after the event
 * @param marketCapBefore - Market cap before the event
 * @param totalShares - Total shares (fixed at 1000)
 * @returns Share price change rounded to 2 decimal places
 */
export const calculateSharePriceImpact = (
  marketCapAfter: number | string | Decimal,
  marketCapBefore: number | string | Decimal,
  totalShares: number | string | Decimal = 1000
): number => {
  const priceAfter = toDecimal(marketCapAfter).dividedBy(toDecimal(totalShares));
  const priceBefore = toDecimal(marketCapBefore).dividedBy(toDecimal(totalShares));
  const impact = priceAfter.minus(priceBefore);
  return roundForDisplay(impact);
};


