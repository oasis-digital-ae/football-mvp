import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  toDecimal,
  fromDecimal,
  roundForDisplay,
  roundForStorage,
  toCents,
  fromCents,
  equals,
  sum,
  max,
  min,
  Decimal,
} from '../decimal';

describe('Decimal Utilities', () => {
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
  });

  describe('toDecimal', () => {
    it('should convert number to Decimal', () => {
      const result = toDecimal(123.45);
      expect(result.toNumber()).toBe(123.45);
    });

    it('should convert string to Decimal', () => {
      const result = toDecimal('123.45');
      expect(result.toNumber()).toBe(123.45);
    });

    it('should return Decimal instance as-is', () => {
      const input = new Decimal(123.45);
      const result = toDecimal(input);
      expect(result).toBe(input);
      expect(result.toNumber()).toBe(123.45);
    });

    it('should return default value for null', () => {
      const result = toDecimal(null);
      expect(result.toNumber()).toBe(0);
    });

    it('should return default value for undefined', () => {
      const result = toDecimal(undefined);
      expect(result.toNumber()).toBe(0);
    });

    it('should use custom default value', () => {
      const result = toDecimal(null, 100);
      expect(result.toNumber()).toBe(100);
    });

    it('should handle invalid input and return default', () => {
      const result = toDecimal('invalid');
      expect(result.toNumber()).toBe(0);
      expect(consoleWarnSpy).toHaveBeenCalled();
    });

    it('should handle empty string', () => {
      const result = toDecimal('');
      expect(result.toNumber()).toBe(0);
    });
  });

  describe('fromDecimal', () => {
    it('should convert Decimal to number with default 2 decimals', () => {
      const result = fromDecimal(new Decimal(123.456789));
      expect(result).toBe(123.46); // Rounded to 2 decimals
    });

    it('should convert Decimal to number with custom decimals', () => {
      const result = fromDecimal(new Decimal(123.456789), 4);
      expect(result).toBe(123.4568);
    });

    it('should handle number input', () => {
      const result = fromDecimal(123.456789);
      expect(result).toBe(123.46);
    });

    it('should handle string input', () => {
      const result = fromDecimal('123.456789');
      expect(result).toBe(123.46);
    });

    it('should return 0 for null', () => {
      const result = fromDecimal(null);
      expect(result).toBe(0);
    });

    it('should return 0 for undefined', () => {
      const result = fromDecimal(undefined);
      expect(result).toBe(0);
    });

    it('should round correctly', () => {
      expect(fromDecimal(123.455)).toBe(123.46); // Rounds up
      expect(fromDecimal(123.454)).toBe(123.45); // Rounds down
    });
  });

  describe('roundForDisplay', () => {
    it('should round to 2 decimal places', () => {
      expect(roundForDisplay(123.456789)).toBe(123.46);
      expect(roundForDisplay('123.456789')).toBe(123.46);
      expect(roundForDisplay(new Decimal(123.456789))).toBe(123.46);
    });

    it('should handle null/undefined', () => {
      expect(roundForDisplay(null)).toBe(0);
      expect(roundForDisplay(undefined)).toBe(0);
    });
  });

  describe('roundForStorage', () => {
    it('should round to 4 decimal places', () => {
      expect(roundForStorage(123.456789123)).toBe(123.4568);
      expect(roundForStorage('123.456789123')).toBe(123.4568);
      expect(roundForStorage(new Decimal(123.456789123))).toBe(123.4568);
    });

    it('should handle null/undefined', () => {
      expect(roundForStorage(null)).toBe(0);
      expect(roundForStorage(undefined)).toBe(0);
    });
  });

  describe('toCents', () => {
    it('should convert dollars to cents', () => {
      expect(toCents(10.50)).toBe(1050);
      expect(toCents(123.45)).toBe(12345);
    });

    it('should round to nearest cent', () => {
      expect(toCents(10.555)).toBe(1056); // Rounds up
      expect(toCents(10.554)).toBe(1055); // Rounds down
    });

    it('should handle string input', () => {
      expect(toCents('10.50')).toBe(1050);
    });

    it('should handle Decimal input', () => {
      expect(toCents(new Decimal(10.50))).toBe(1050);
    });

    it('should handle null/undefined', () => {
      expect(toCents(null)).toBe(0);
      expect(toCents(undefined)).toBe(0);
    });

    it('should handle zero', () => {
      expect(toCents(0)).toBe(0);
    });

    it('should handle negative values', () => {
      expect(toCents(-10.50)).toBe(-1050);
    });
  });

  describe('fromCents', () => {
    it('should convert cents to Decimal dollars', () => {
      const result = fromCents(1050);
      expect(result.toNumber()).toBe(10.50);
    });

    it('should handle string input', () => {
      const result = fromCents('1050');
      expect(result.toNumber()).toBe(10.50);
    });

    it('should handle null/undefined', () => {
      const result1 = fromCents(null);
      expect(result1.toNumber()).toBe(0);
      
      const result2 = fromCents(undefined);
      expect(result2.toNumber()).toBe(0);
    });

    it('should handle zero', () => {
      const result = fromCents(0);
      expect(result.toNumber()).toBe(0);
    });

    it('should handle large values', () => {
      const result = fromCents(123456789);
      expect(result.toNumber()).toBe(1234567.89);
    });
  });

  describe('equals', () => {
    it('should return true for equal values', () => {
      expect(equals(10.50, 10.50)).toBe(true);
      expect(equals(10.50, '10.50')).toBe(true);
      expect(equals(new Decimal(10.50), 10.50)).toBe(true);
    });

    it('should return false for different values', () => {
      expect(equals(10.50, 10.51)).toBe(false);
    });

    it('should return true within tolerance', () => {
      expect(equals(10.50, 10.5001, 0.001)).toBe(true);
      expect(equals(10.50, 10.5002, 0.0001)).toBe(false); // 0.0002 > 0.0001
    });

    it('should use default tolerance', () => {
      expect(equals(10.50, 10.50001)).toBe(true); // Within 0.0001 tolerance
      expect(equals(10.50, 10.5002)).toBe(false); // Outside 0.0001 tolerance (0.0002 > 0.0001)
    });
  });

  describe('sum', () => {
    it('should sum array of numbers', () => {
      const result = sum([10, 20, 30]);
      expect(result.toNumber()).toBe(60);
    });

    it('should sum array of strings', () => {
      const result = sum(['10.50', '20.25', '30.75']);
      expect(result.toNumber()).toBe(61.50);
    });

    it('should sum array of Decimals', () => {
      const result = sum([new Decimal(10), new Decimal(20), new Decimal(30)]);
      expect(result.toNumber()).toBe(60);
    });

    it('should handle mixed types', () => {
      const result = sum([10, '20.50', new Decimal(30)]);
      expect(result.toNumber()).toBe(60.50);
    });

    it('should handle null/undefined values', () => {
      const result = sum([10, null, 20, undefined, 30]);
      expect(result.toNumber()).toBe(60);
    });

    it('should return 0 for empty array', () => {
      const result = sum([]);
      expect(result.toNumber()).toBe(0);
    });

    it('should handle decimal precision', () => {
      const result = sum([0.1, 0.2, 0.3]);
      expect(result.toNumber()).toBeCloseTo(0.6, 10);
    });
  });

  describe('max', () => {
    it('should return maximum value from numbers', () => {
      const result = max([10, 30, 20]);
      expect(result.toNumber()).toBe(30);
    });

    it('should return maximum value from strings', () => {
      const result = max(['10.50', '30.75', '20.25']);
      expect(result.toNumber()).toBe(30.75);
    });

    it('should return maximum value from Decimals', () => {
      const result = max([new Decimal(10), new Decimal(30), new Decimal(20)]);
      expect(result.toNumber()).toBe(30);
    });

    it('should handle mixed types', () => {
      const result = max([10, '30.50', new Decimal(20)]);
      expect(result.toNumber()).toBe(30.50);
    });

    it('should handle null/undefined values', () => {
      const result = max([10, null, 30, undefined, 20]);
      expect(result.toNumber()).toBe(30);
    });

    it('should return 0 for empty array', () => {
      const result = max([]);
      expect(result.toNumber()).toBe(0);
    });

    it('should handle negative values', () => {
      const result = max([-10, -30, -20]);
      expect(result.toNumber()).toBe(-10);
    });
  });

  describe('min', () => {
    it('should return minimum value from numbers', () => {
      const result = min([10, 30, 20]);
      expect(result.toNumber()).toBe(10);
    });

    it('should return minimum value from strings', () => {
      const result = min(['10.50', '30.75', '20.25']);
      expect(result.toNumber()).toBe(10.50);
    });

    it('should return minimum value from Decimals', () => {
      const result = min([new Decimal(10), new Decimal(30), new Decimal(20)]);
      expect(result.toNumber()).toBe(10);
    });

    it('should handle mixed types', () => {
      const result = min([10, '5.50', new Decimal(20)]);
      expect(result.toNumber()).toBe(5.50);
    });

    it('should handle null/undefined values', () => {
      // null/undefined are converted to 0, so min should be 0
      const result = min([10, null, 5, undefined, 20]);
      expect(result.toNumber()).toBe(0); // null/undefined become 0, which is minimum
    });

    it('should return 0 for empty array', () => {
      const result = min([]);
      expect(result.toNumber()).toBe(0);
    });

    it('should handle negative values', () => {
      const result = min([-10, -30, -20]);
      expect(result.toNumber()).toBe(-30);
    });
  });
});
