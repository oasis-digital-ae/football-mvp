# End-to-End (E2E) Testing

This directory contains end-to-end tests using Playwright to test the full application stack.

## 🔐 Authentication Setup

The tests now include **automatic authentication** via fixtures. Tests will automatically:
1. Check if you're logged in
2. If not, attempt to log in with test credentials
3. If login fails, attempt to create a test account
4. Use the authenticated session for all tests

### Test Credentials

Default test credentials (can be overridden via environment variables):
- **Email**: `test@example.com` (or `E2E_TEST_EMAIL`)
- **Password**: `TestPassword123!` (or `E2E_TEST_PASSWORD`)

### Environment Variables

You can set custom test credentials:

```bash
# Windows PowerShell
$env:E2E_TEST_EMAIL="your-test@example.com"
$env:E2E_TEST_PASSWORD="YourPassword123!"

# Linux/Mac
export E2E_TEST_EMAIL="your-test@example.com"
export E2E_TEST_PASSWORD="YourPassword123!"
```

## 🚀 Running Tests

### Quick Start

```bash
# Run all E2E tests (with automatic authentication)
npm run test:e2e

# Run with interactive UI (RECOMMENDED)
npm run test:e2e:ui

# Run in headed mode (see browser)
npm run test:e2e:headed
```

### First Time Setup

1. **Create a test account** (or use existing credentials):
   - The tests will automatically create an account if login fails
   - Or manually create: `test@example.com` / `TestPassword123!`

2. **Run tests**:
   ```bash
   npm run test:e2e:ui
   ```

## 📁 Test Files

- **`fixtures/auth.ts`** - Authentication fixtures and helpers
- **`auth.spec.ts`** - Authentication flow tests
- **`auth-workflow.spec.ts`** - Complete login/signup workflow
- **`trading.spec.ts`** - Trading flows (buy/sell, portfolio)
- **`match-calculations.spec.ts`** - Match result calculations
- **`data-drift.spec.ts`** - Data consistency and drift detection
- **`error-handling.spec.ts`** - Error handling and runtime errors
- **`complete-workflow.spec.ts`** - Full end-to-end user journey

## 🎯 What Gets Tested

### Authentication
- ✅ Sign up flow
- ✅ Login flow
- ✅ Session persistence
- ✅ Form validation
- ✅ Error handling

### Trading
- ✅ View club values
- ✅ Purchase shares (with cost calculation)
- ✅ Wallet balance validation
- ✅ Buy window status
- ✅ Portfolio navigation

### Match Calculations
- ✅ Market cap display
- ✅ Share price = market_cap / 1000
- ✅ Market cap conservation
- ✅ Match result display

### Data Drift Detection
- ✅ Share price consistency
- ✅ Minimum market cap ($10)
- ✅ Total market cap validation
- ✅ No NaN/Infinity values
- ✅ Portfolio calculations

### Complete Workflow
- ✅ Full user journey
- ✅ Navigation between pages
- ✅ Data consistency across pages

## 🔧 Using Authentication Fixtures

### Option 1: Use `authenticatedPage` fixture (Recommended)

```typescript
import { test, expect } from './fixtures/auth';

test('my test', async ({ authenticatedPage }) => {
  // authenticatedPage is already logged in
  const page = authenticatedPage;
  // Your test code here
});
```

### Option 2: Use `ensureAuthenticated` helper

```typescript
import { ensureAuthenticated } from './fixtures/auth';

test('my test', async ({ page }) => {
  await ensureAuthenticated(page);
  // Now page is logged in
});
```

### Option 3: Manual login in test

```typescript
import { test, expect } from './fixtures/auth';

test('my test', async ({ page, testUser }) => {
  await page.goto('/');
  // Login manually using testUser.email and testUser.password
});
```

## 📊 Test Results

- **HTML Report**: `playwright-report/index.html`
- **Screenshots**: `test-results/` (on failures)
- **Videos**: `test-results/` (on failures)

View report:
```bash
npx playwright show-report
```

## 🐛 Troubleshooting

### Tests fail to authenticate

1. **Check test credentials**:
   ```bash
   # Verify credentials are correct
   echo $E2E_TEST_EMAIL
   ```

2. **Manually create test account**:
   - Go to the app
   - Sign up with test credentials
   - Then run tests

3. **Check Supabase connection**:
   - Ensure Supabase is accessible
   - Check environment variables

### Tests timeout

- Increase timeout in `playwright.config.ts`
- Check if dev server is running
- Verify network connectivity

### Tests skip unexpectedly

- Some tests skip if certain UI elements don't exist
- This is intentional - tests adapt to available features
- Check test output for skip reasons

## 💡 Best Practices

1. **Use `authenticatedPage` fixture** for tests requiring auth
2. **Use `test.skip()`** when features aren't available
3. **Add waits** for dynamic content
4. **Use flexible selectors** (`.first()`, `.or()`)
5. **Handle both authenticated and unauthenticated states**

## 📝 Notes

- Tests automatically handle authentication
- Tests skip gracefully if features aren't available
- Tests verify data consistency and prevent drift
- All tests run in Chromium, Firefox, and WebKit

For more details, see `TESTING.md` and `COMPLETE_TESTING_SETUP.md`.
