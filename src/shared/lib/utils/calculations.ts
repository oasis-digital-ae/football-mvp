/**
 * Centralized Calculation Utilities
 * 
 * All financial calculations should use these functions to ensure consistency
 * across the entire application. All values are rounded to 2 decimal places
 * to prevent floating-point precision issues.
 */

/**
 * Round a number to 2 decimal places
 */
export const roundToTwoDecimals = (value: number): number => {
  return Math.round(value * 100) / 100;
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
  marketCap: number,
  totalShares: number,
  defaultValue: number = 20.00
): number => {
  if (totalShares <= 0) {
    return roundToTwoDecimals(defaultValue);
  }
  return roundToTwoDecimals(marketCap / totalShares);
};

/**
 * Calculate percent change from one value to another
 * 
 * @param currentValue - Current value
 * @param previousValue - Previous/base value (e.g., launch price, purchase price)
 * @returns Percent change rounded to 2 decimal places
 */
export const calculatePercentChange = (
  currentValue: number,
  previousValue: number
): number => {
  if (previousValue <= 0) {
    return 0;
  }
  const change = ((currentValue - previousValue) / previousValue) * 100;
  return roundToTwoDecimals(change);
};

/**
 * Calculate profit/loss (absolute value difference)
 * 
 * @param currentValue - Current value
 * @param previousValue - Previous/base value (e.g., launch price, purchase price)
 * @returns Profit/loss rounded to 2 decimal places
 */
export const calculateProfitLoss = (
  currentValue: number,
  previousValue: number
): number => {
  return roundToTwoDecimals(currentValue - previousValue);
};

/**
 * Calculate total value (price * quantity)
 * 
 * @param pricePerUnit - Price per unit
 * @param quantity - Quantity
 * @returns Total value rounded to 2 decimal places
 */
export const calculateTotalValue = (
  pricePerUnit: number,
  quantity: number
): number => {
  return roundToTwoDecimals(pricePerUnit * quantity);
};

/**
 * Calculate average cost basis
 * 
 * @param totalInvested - Total amount invested
 * @param quantity - Quantity of shares
 * @returns Average cost per share rounded to 2 decimal places
 */
export const calculateAverageCost = (
  totalInvested: number,
  quantity: number
): number => {
  if (quantity <= 0) {
    return 0;
  }
  return roundToTwoDecimals(totalInvested / quantity);
};

/**
 * Calculate portfolio percentage (portion of total)
 * 
 * @param itemValue - Value of the item
 * @param totalValue - Total portfolio value
 * @returns Percentage rounded to 2 decimal places
 */
export const calculatePortfolioPercentage = (
  itemValue: number,
  totalValue: number
): number => {
  if (totalValue <= 0) {
    return 0;
  }
  return roundToTwoDecimals((itemValue / totalValue) * 100);
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
  marketCapAfter: number,
  marketCapBefore: number,
  totalShares: number = 1000
): number => {
  const priceAfter = calculateSharePrice(marketCapAfter, totalShares);
  const priceBefore = calculateSharePrice(marketCapBefore, totalShares);
  return calculateProfitLoss(priceAfter, priceBefore);
};

