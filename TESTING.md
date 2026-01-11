# Testing Guide

This document describes the testing setup and strategy for the Football MVP application.

## Test Framework

The project uses **Vitest** as the test runner, configured in `vite.config.ts`. Tests are written using Vitest's built-in test API and React Testing Library for component tests.

## Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm test -- --watch

# Run tests with UI
npm test:ui

# Run tests with coverage
npm test:coverage

# Run tests once (CI mode)
npm test:run
```

## Test Structure

```
src/
├── test/
│   └── setup.ts                    # Test configuration and mocks
├── shared/
│   └── lib/
│       ├── utils/
│       │   └── __tests__/
│       │       └── calculations.test.ts      # Unit tests for calculation utilities
│       └── services/
│           └── __tests__/
│               ├── market.service.test.ts           # Market service tests
│               ├── match-calculations.test.ts        # Match result calculation tests
│               └── trading-integration.test.ts        # Trading integration tests
```

## Test Coverage

### Unit Tests

1. **Calculation Utilities** (`calculations.test.ts`)
   - Share price calculations
   - Percent change calculations
   - Profit/loss calculations
   - Total value calculations
   - Portfolio percentage calculations

2. **Market Service** (`market.service.test.ts`)
   - Share price calculations
   - Market data generation
   - Purchase validation
   - Price formatting

3. **Match Calculations** (`match-calculations.test.ts`)
   - Win/loss transfer calculations
   - Market cap conservation
   - Minimum market cap enforcement
   - Share price impact calculations
   - Draw scenarios

### Integration Tests

1. **Trading Integration** (`trading-integration.test.ts`)
   - Share purchase calculations
   - Share sale calculations
   - Portfolio value calculations
   - Market cap impact on share price
   - Trading validation

## Match Result Calculation Rules

The following rules are tested and verified:

1. **Winner receives 10% of loser's market cap**
   - Transfer amount = loser_market_cap × 0.10
   - Winner's new cap = winner_cap + transfer_amount
   - Loser's new cap = max(loser_cap - transfer_amount, $10)

2. **Draw results in no transfer**
   - Both teams keep their market caps unchanged

3. **Minimum market cap enforcement**
   - Teams cannot go below $10 market cap
   - If transfer would cause cap to drop below $10, it's capped at $10

4. **Share price calculation**
   - Share price = market_cap / 1000 (fixed shares model)
   - All prices rounded to 2 decimal places

5. **Market cap conservation**
   - Total market cap before and after matches should be conserved
   - Exception: When minimum cap constraint is applied

## Writing New Tests

### Example: Unit Test

```typescript
import { describe, it, expect } from 'vitest';
import { calculateSharePrice } from '../calculations';

describe('calculateSharePrice', () => {
  it('should calculate share price correctly', () => {
    expect(calculateSharePrice(5000, 1000)).toBe(5.00);
  });
});
```

### Example: Integration Test

```typescript
import { describe, it, expect } from 'vitest';
import { marketService } from '../market.service';

describe('Trading Flow', () => {
  it('should handle complete purchase flow', () => {
    const validation = marketService.validateSharePurchase(10, 5.00, 10000);
    expect(validation.valid).toBe(true);
  });
});
```

## Test Best Practices

1. **Isolation**: Each test should be independent and not rely on other tests
2. **Descriptive Names**: Test names should clearly describe what is being tested
3. **Arrange-Act-Assert**: Structure tests with clear sections
4. **Edge Cases**: Test boundary conditions and error cases
5. **Floating Point**: Use `toBeCloseTo()` for floating point comparisons

## Continuous Integration

Tests should be run:
- Before committing code
- In CI/CD pipeline
- Before deploying to production

## Coverage Goals

- **Unit Tests**: > 80% coverage for calculation utilities
- **Integration Tests**: Cover all critical user flows
- **Match Calculations**: 100% coverage (critical business logic)

## Known Issues

- Number formatting may vary by locale (handled in tests)
- Floating point precision issues (use `toBeCloseTo()`)

## End-to-End (E2E) Testing

The project includes comprehensive E2E tests using **Playwright** to catch runtime errors and prevent data drift.

### Running E2E Tests

```bash
# Run all E2E tests
npm run test:e2e

# Run with UI (interactive)
npm run test:e2e:ui

# Run in headed mode (see browser)
npm run test:e2e:headed

# Debug tests
npm run test:e2e:debug
```

### E2E Test Coverage

Located in `e2e/` directory:

1. **auth.spec.ts** - Authentication flows
   - Sign in form validation
   - Invalid credentials handling
   - Network error handling
   - Form navigation

2. **trading.spec.ts** - Trading flows
   - Purchase cost calculations
   - Wallet balance validation
   - Buy window status
   - Portfolio updates

3. **match-calculations.spec.ts** - Match calculations
   - Market cap display
   - Share price calculations (market_cap / 1000)
   - Market cap conservation
   - Match result display

4. **data-drift.spec.ts** - Data drift detection
   - Share price consistency across all teams
   - Minimum market cap enforcement ($10)
   - Total market cap validation
   - Portfolio calculation consistency
   - Detection of calculation errors (NaN, Infinity)

5. **error-handling.spec.ts** - Error handling
   - API error handling
   - Network timeout handling
   - Invalid input handling
   - XSS prevention
   - Rapid click handling
   - Console error detection
   - Real-time update errors

### Data Drift Detection

The E2E tests specifically check for:
- ✅ Share price = market_cap / 1000 (fixed shares model)
- ✅ Minimum market cap of $10 enforced
- ✅ No NaN or Infinity values displayed
- ✅ Consistent calculations across all teams
- ✅ Portfolio values calculated correctly

See `e2e/README.md` for detailed documentation.

## Future Test Additions

- [ ] Component tests for React components
- [ ] API integration tests
- [ ] Database function tests
- [ ] Performance tests
