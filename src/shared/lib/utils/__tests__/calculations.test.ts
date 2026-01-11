import { describe, it, expect } from 'vitest';
import {
  calculateSharePrice,
  calculatePercentChange,
  calculateProfitLoss,
  calculateTotalValue,
  calculateAverageCost,
  calculatePortfolioPercentage,
  calculateSharePriceImpact,
} from '../calculations';

describe('Calculation Utilities', () => {
  describe('calculateSharePrice', () => {
    it('should calculate share price correctly', () => {
      expect(calculateSharePrice(5000, 1000)).toBe(5.00);
      expect(calculateSharePrice(10000, 1000)).toBe(10.00);
      expect(calculateSharePrice(20000, 1000)).toBe(20.00);
    });

    it('should return default value when totalShares is 0', () => {
      expect(calculateSharePrice(5000, 0)).toBe(20.00);
      expect(calculateSharePrice(5000, 0, 15.00)).toBe(15.00);
    });

    it('should handle decimal values correctly', () => {
      expect(calculateSharePrice(1234.56, 1000)).toBe(1.23);
      expect(calculateSharePrice(9999.99, 1000)).toBe(10.00);
    });
  });

  describe('calculatePercentChange', () => {
    it('should calculate positive percent change', () => {
      expect(calculatePercentChange(25, 20)).toBe(25.00);
      expect(calculatePercentChange(110, 100)).toBe(10.00);
    });

    it('should calculate negative percent change', () => {
      expect(calculatePercentChange(15, 20)).toBe(-25.00);
      expect(calculatePercentChange(90, 100)).toBe(-10.00);
    });

    it('should return 0 when previous value is 0 or negative', () => {
      expect(calculatePercentChange(100, 0)).toBe(0);
      expect(calculatePercentChange(100, -10)).toBe(0);
    });

    it('should handle zero change', () => {
      expect(calculatePercentChange(20, 20)).toBe(0);
    });
  });

  describe('calculateProfitLoss', () => {
    it('should calculate profit correctly', () => {
      expect(calculateProfitLoss(25, 20)).toBe(5.00);
      expect(calculateProfitLoss(30, 20)).toBe(10.00);
    });

    it('should calculate loss correctly', () => {
      expect(calculateProfitLoss(15, 20)).toBe(-5.00);
      expect(calculateProfitLoss(10, 20)).toBe(-10.00);
    });

    it('should handle zero change', () => {
      expect(calculateProfitLoss(20, 20)).toBe(0);
    });
  });

  describe('calculateTotalValue', () => {
    it('should calculate total value correctly', () => {
      expect(calculateTotalValue(20, 10)).toBe(200.00);
      expect(calculateTotalValue(5.50, 100)).toBe(550.00);
    });

    it('should handle zero quantity', () => {
      expect(calculateTotalValue(20, 0)).toBe(0);
    });

    it('should handle decimal prices', () => {
      expect(calculateTotalValue(19.99, 5)).toBe(99.95);
    });
  });

  describe('calculateAverageCost', () => {
    it('should calculate average cost correctly', () => {
      expect(calculateAverageCost(200, 10)).toBe(20.00);
      expect(calculateAverageCost(550, 100)).toBe(5.50);
    });

    it('should return 0 when quantity is 0', () => {
      expect(calculateAverageCost(200, 0)).toBe(0);
    });
  });

  describe('calculatePortfolioPercentage', () => {
    it('should calculate portfolio percentage correctly', () => {
      expect(calculatePortfolioPercentage(200, 1000)).toBe(20.00);
      expect(calculatePortfolioPercentage(500, 1000)).toBe(50.00);
    });

    it('should return 0 when total value is 0', () => {
      expect(calculatePortfolioPercentage(200, 0)).toBe(0);
    });
  });

  describe('calculateSharePriceImpact', () => {
    it('should calculate share price impact correctly', () => {
      // Market cap increases from 5000 to 5500, share price should increase by 0.50
      expect(calculateSharePriceImpact(5500, 5000, 1000)).toBe(0.50);
      
      // Market cap decreases from 5000 to 4500, share price should decrease by 0.50
      expect(calculateSharePriceImpact(4500, 5000, 1000)).toBe(-0.50);
    });

    it('should use default totalShares of 1000', () => {
      expect(calculateSharePriceImpact(5500, 5000)).toBe(0.50);
    });
  });
});
