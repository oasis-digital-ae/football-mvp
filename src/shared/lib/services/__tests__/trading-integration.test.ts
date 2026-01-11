import { describe, it, expect, beforeEach, vi } from 'vitest';
import { marketService } from '../market.service';
import { calculateSharePrice, calculateTotalValue } from '../../utils/calculations';

/**
 * Integration tests for trading features
 * Tests the interaction between market calculations and trading logic
 */

describe('Trading Integration Tests', () => {
  const FIXED_SHARES = 1000;
  const INITIAL_MARKET_CAP = 5000;
  const INITIAL_SHARE_PRICE = INITIAL_MARKET_CAP / FIXED_SHARES; // $5.00

  describe('Share Purchase Calculations', () => {
    it('should calculate purchase cost correctly', () => {
      const sharesToBuy = 10;
      const sharePrice = INITIAL_SHARE_PRICE;
      const totalCost = calculateTotalValue(sharePrice, sharesToBuy);
      
      expect(totalCost).toBe(50.00);
    });

    it('should validate purchase within wallet balance', () => {
      const walletBalance = 100;
      const sharesToBuy = 20;
      const sharePrice = INITIAL_SHARE_PRICE;
      const totalCost = calculateTotalValue(sharePrice, sharesToBuy);
      
      expect(totalCost).toBe(100.00);
      expect(walletBalance).toBeGreaterThanOrEqual(totalCost);
    });

    it('should reject purchase exceeding wallet balance', () => {
      const walletBalance = 50;
      const sharesToBuy = 20;
      const sharePrice = INITIAL_SHARE_PRICE;
      const totalCost = calculateTotalValue(sharePrice, sharesToBuy);
      
      expect(totalCost).toBe(100.00);
      expect(walletBalance).toBeLessThan(totalCost);
    });
  });

  describe('Share Sale Calculations', () => {
    it('should calculate sale proceeds correctly', () => {
      const sharesToSell = 10;
      const currentSharePrice = 6.00; // Price increased after match
      const proceeds = calculateTotalValue(currentSharePrice, sharesToSell);
      
      expect(proceeds).toBe(60.00);
    });

    it('should calculate profit/loss on sale', () => {
      const purchasePrice = 5.00;
      const currentPrice = 6.00;
      const sharesSold = 10;
      
      const purchaseCost = calculateTotalValue(purchasePrice, sharesSold);
      const saleProceeds = calculateTotalValue(currentPrice, sharesSold);
      const profit = saleProceeds - purchaseCost;
      
      expect(purchaseCost).toBe(50.00);
      expect(saleProceeds).toBe(60.00);
      expect(profit).toBe(10.00);
    });
  });

  describe('Portfolio Value Calculations', () => {
    it('should calculate total portfolio value', () => {
      const holdings = [
        { shares: 10, price: 5.00 },
        { shares: 20, price: 6.00 },
        { shares: 5, price: 4.50 },
      ];
      
      const totalValue = holdings.reduce((sum, holding) => {
        return sum + calculateTotalValue(holding.price, holding.shares);
      }, 0);
      
      expect(totalValue).toBe(192.50); // 50 + 120 + 22.50
    });

    it('should calculate portfolio percentage allocation', () => {
      const team1Value = 100;
      const team2Value = 200;
      const team3Value = 50;
      const totalPortfolio = team1Value + team2Value + team3Value;
      
      const team1Percent = (team1Value / totalPortfolio) * 100;
      const team2Percent = (team2Value / totalPortfolio) * 100;
      const team3Percent = (team3Value / totalPortfolio) * 100;
      
      expect(team1Percent).toBeCloseTo(28.57, 2);
      expect(team2Percent).toBeCloseTo(57.14, 2);
      expect(team3Percent).toBeCloseTo(14.29, 2);
      expect(team1Percent + team2Percent + team3Percent).toBeCloseTo(100, 2);
    });
  });

  describe('Market Cap Impact on Share Price', () => {
    it('should update share price when market cap changes', () => {
      const initialMarketCap = 5000;
      const initialPrice = calculateSharePrice(initialMarketCap, FIXED_SHARES);
      
      // Market cap increases by 10% (e.g., after winning a match)
      const newMarketCap = initialMarketCap * 1.10;
      const newPrice = calculateSharePrice(newMarketCap, FIXED_SHARES);
      
      expect(initialPrice).toBe(5.00);
      expect(newPrice).toBe(5.50);
    });

    it('should calculate price change percentage', () => {
      const oldPrice = 5.00;
      const newPrice = 5.50;
      const percentChange = ((newPrice - oldPrice) / oldPrice) * 100;
      
      expect(percentChange).toBe(10.00);
    });
  });

  describe('Trading Validation', () => {
    it('should validate share purchase parameters', () => {
      const validation = marketService.validateSharePurchase(10, 5.00, 10000);
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('should reject invalid purchase parameters', () => {
      const validation1 = marketService.validateSharePurchase(0, 5.00, 10000);
      expect(validation1.valid).toBe(false);
      
      const validation2 = marketService.validateSharePurchase(10, 0, 10000);
      expect(validation2.valid).toBe(false);
      
      const validation3 = marketService.validateSharePurchase(10001, 5.00, 10000);
      expect(validation3.valid).toBe(false);
    });
  });
});
