# E2E Test Authentication Setup

## Overview

The E2E tests now include **automatic authentication** that handles login and account creation automatically.

## How It Works

### Authentication Fixture

All tests use the `authenticatedPage` fixture from `e2e/fixtures/auth.ts` which:

1. **Checks if already logged in** - If you're already authenticated, uses that session
2. **Attempts login** - Tries to log in with test credentials
3. **Creates account if needed** - If login fails, automatically creates a test account
4. **Provides authenticated page** - All tests get a logged-in page automatically

### Test Credentials

**Default credentials:**
- Email: `test@example.com`
- Password: `TestPassword123!`

**Customize via environment variables:**
```bash
# Windows PowerShell
$env:E2E_TEST_EMAIL="your-email@example.com"
$env:E2E_TEST_PASSWORD="YourPassword123!"

# Linux/Mac
export E2E_TEST_EMAIL="your-email@example.com"
export E2E_TEST_PASSWORD="YourPassword123!"
```

## Setup Steps

### Option 1: Automatic (Recommended)

The tests will automatically create an account if one doesn't exist. Just run:

```bash
npm run test:e2e:ui
```

### Option 2: Manual Setup

1. **Start the dev server:**
   ```bash
   npm run dev
   ```

2. **Manually create test account:**
   - Go to `http://localhost:5173`
   - Click "Sign Up"
   - Use email: `test@example.com`
   - Use password: `TestPassword123!`
   - Fill in required fields (first name, last name, etc.)
   - Submit form

3. **Run tests:**
   ```bash
   npm run test:e2e:ui
   ```

## Using Authentication in Tests

### Method 1: Use `authenticatedPage` fixture (Recommended)

```typescript
import { test, expect } from './fixtures/auth';

test('my test', async ({ authenticatedPage }) => {
  // authenticatedPage is already logged in
  const page = authenticatedPage;
  
  // Your test code here - no need to login!
  await page.getByText('Club Values').click();
});
```

### Method 2: Use `ensureAuthenticated` helper

```typescript
import { ensureAuthenticated } from './fixtures/auth';

test('my test', async ({ page }) => {
  await ensureAuthenticated(page);
  // Now page is logged in
});
```

### Method 3: Access test credentials

```typescript
import { test, expect } from './fixtures/auth';

test('my test', async ({ page, testUser }) => {
  // testUser.email and testUser.password available
  console.log(testUser.email); // 'test@example.com'
});
```

## Test Files Using Authentication

All these test files now use automatic authentication:

- ✅ `trading.spec.ts` - Trading flows
- ✅ `match-calculations.spec.ts` - Match calculations
- ✅ `data-drift.spec.ts` - Data consistency
- ✅ `complete-workflow.spec.ts` - Full user journey
- ✅ `auth-workflow.spec.ts` - Auth flow tests

## Troubleshooting

### Tests fail to authenticate

1. **Check Supabase connection:**
   - Ensure Supabase URL and keys are set in `.env`
   - Verify Supabase is accessible

2. **Check email confirmation:**
   - If email confirmation is required, you may need to disable it for testing
   - Or manually confirm the test email

3. **Check test credentials:**
   ```bash
   # Verify credentials
   echo $E2E_TEST_EMAIL
   ```

4. **Manually create account:**
   - Go to app and create account manually
   - Then run tests (they'll use existing account)

### Account creation fails

The signup form may require additional fields. The fixture handles:
- ✅ Email (required)
- ✅ Password (required)
- ✅ Confirm Password (required)
- ✅ First Name (optional, filled with "Test")
- ✅ Last Name (optional, filled with "User")

If other fields are required, update `createTestAccount` in `e2e/fixtures/auth.ts`.

### Tests timeout during login

- Increase timeout in `playwright.config.ts`
- Check network connectivity
- Verify dev server is running

## Best Practices

1. **Use `authenticatedPage` fixture** - Simplest and most reliable
2. **Don't hardcode credentials** - Use `testUser` fixture
3. **Handle both states** - Some tests work with/without auth
4. **Check for auth state** - Use `isAuthPage` check if needed

## Example: Complete Test

```typescript
import { test, expect } from './fixtures/auth';

test('should buy shares', async ({ authenticatedPage }) => {
  const page = authenticatedPage;
  
  // Already logged in - no need to authenticate!
  
  // Wait for teams to load
  await page.waitForSelector('text=/Arsenal|Manchester/i', { timeout: 15000 });
  
  // Click buy button
  const buyButton = page.getByRole('button', { name: /buy/i }).first();
  await buyButton.click();
  
  // Fill purchase form
  const quantityInput = page.getByLabel(/quantity|shares/i).first();
  await quantityInput.fill('10');
  
  // Confirm purchase
  const confirmButton = page.getByRole('button', { name: /purchase|confirm/i }).first();
  await confirmButton.click();
  
  // Verify success
  await expect(page.getByText(/success|purchased/i)).toBeVisible({ timeout: 10000 });
});
```

## Summary

✅ **Automatic authentication** - Tests handle login automatically  
✅ **Account creation** - Creates test account if needed  
✅ **Session reuse** - Uses existing session if available  
✅ **Flexible** - Works with or without existing account  
✅ **Easy to use** - Just use `authenticatedPage` fixture  

No more manual login steps needed! 🎉
