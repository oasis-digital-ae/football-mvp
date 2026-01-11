import { describe, it, expect } from 'vitest';
import { marketService } from '../market.service';

describe('Market Service', () => {
  describe('calculateSharePrice', () => {
    it('should calculate share price using fixed shares model', () => {
      expect(marketService.calculateSharePrice(5000, 1000)).toBe(5.00);
      expect(marketService.calculateSharePrice(10000, 1000)).toBe(10.00);
      expect(marketService.calculateSharePrice(20000, 1000)).toBe(20.00);
    });

    it('should return default value when sharesOutstanding is 0', () => {
      expect(marketService.calculateSharePrice(5000, 0)).toBe(20.00);
      expect(marketService.calculateSharePrice(5000, 0, 15.00)).toBe(15.00);
    });
  });

  describe('calculateProfitLoss', () => {
    it('should calculate profit correctly', () => {
      expect(marketService.calculateProfitLoss(25, 20)).toBe(5);
      expect(marketService.calculateProfitLoss(30, 20)).toBe(10);
    });

    it('should calculate loss correctly', () => {
      expect(marketService.calculateProfitLoss(15, 20)).toBe(-5);
    });
  });

  describe('calculatePercentChange', () => {
    it('should calculate percent change correctly', () => {
      expect(marketService.calculatePercentChange(25, 20)).toBe(25);
      expect(marketService.calculatePercentChange(110, 100)).toBe(10);
    });

    it('should return 0 when purchase price is 0', () => {
      expect(marketService.calculatePercentChange(100, 0)).toBe(0);
    });
  });

  describe('getMarketData', () => {
    it('should return complete market data', () => {
      const data = marketService.getMarketData(10000, 1000, 20);
      
      expect(data.marketCap).toBe(10000);
      expect(data.sharesOutstanding).toBe(1000);
      expect(data.sharePrice).toBe(10.00);
      expect(data.launchPrice).toBe(20);
    });
  });

  describe('validateSharePurchase', () => {
    it('should validate valid purchase', () => {
      const result = marketService.validateSharePurchase(10, 20, 10000);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject zero shares', () => {
      const result = marketService.validateSharePurchase(0, 20, 10000);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Number of shares must be greater than 0');
    });

    it('should reject shares exceeding max', () => {
      const result = marketService.validateSharePurchase(10001, 20, 10000);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Number of shares cannot exceed 10,000');
    });

    it('should reject zero or negative price', () => {
      const result = marketService.validateSharePurchase(10, 0, 10000);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Share price must be greater than 0');
    });
  });

  describe('formatSharePrice', () => {
    it('should format share price correctly', () => {
      expect(marketService.formatSharePrice(20)).toBe('$20.00');
      expect(marketService.formatSharePrice(19.99)).toBe('$19.99');
      expect(marketService.formatSharePrice(5.5)).toBe('$5.50');
    });
  });

  describe('formatMarketCap', () => {
    it('should format small market cap correctly', () => {
      const formatted5000 = marketService.formatMarketCap(5000);
      expect(formatted5000).toMatch(/\$[\d,]+\.00/); // Matches $ followed by digits/commas and .00
      expect(parseFloat(formatted5000.replace(/[$,]/g, ''))).toBe(5000);
      
      // Note: toLocaleString may format differently based on locale (e.g., 999,999 vs 9,99,999)
      const formatted999999 = marketService.formatMarketCap(999999);
      expect(formatted999999).toMatch(/\$[\d,]+\.00/); // Matches $ followed by digits/commas and .00
      expect(parseFloat(formatted999999.replace(/[$,]/g, ''))).toBe(999999);
    });

    it('should format large market cap in millions', () => {
      expect(marketService.formatMarketCap(1000000)).toBe('$1.00M');
      expect(marketService.formatMarketCap(2500000)).toBe('$2.50M');
    });
  });
});
