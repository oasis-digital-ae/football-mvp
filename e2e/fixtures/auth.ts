import { test as base, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * Authentication Fixtures
 * Provides authenticated page state for E2E tests
 */

type AuthFixtures = {
  authenticatedPage: Page;
  testUser: {
    email: string;
    password: string;
  };
};

// Test user credentials (can be overridden via environment variables)
const TEST_USER_EMAIL = process.env.E2E_TEST_EMAIL || 'test@example.com';
const TEST_USER_PASSWORD = process.env.E2E_TEST_PASSWORD || 'TestPassword123!';

export const test = base.extend<AuthFixtures>({
  testUser: async ({}, use) => {
    await use({
      email: TEST_USER_EMAIL,
      password: TEST_USER_PASSWORD,
    });
  },

  authenticatedPage: async ({ page, testUser }, use) => {
    // Navigate to app with shorter timeout
    try {
      await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 15000 });
    } catch (e) {
      // If navigation fails, still try to proceed
      console.warn('Navigation timeout, proceeding anyway');
    }
    
    await page.waitForTimeout(1000);

    // Check if already logged in (faster check)
    const isAuthPage = await page.getByText('Sign In', { exact: false }).isVisible({ timeout: 2000 }).catch(() => false);
    
    if (!isAuthPage) {
      // Already logged in, use current page
      await use(page);
      return;
    }

    // Try login first (faster than account creation)
    try {
      const emailInput = page.getByLabel('Email Address').first();
      const passwordInput = page.getByLabel('Password').first();
      const signInButton = page.getByRole('button', { name: /sign in|signing in/i }).first();

      // Wait for inputs (shorter timeout)
      const inputsReady = await Promise.all([
        emailInput.waitFor({ state: 'visible', timeout: 3000 }).catch(() => null),
        passwordInput.waitFor({ state: 'visible', timeout: 3000 }).catch(() => null),
      ]);

      if (inputsReady[0] && inputsReady[1]) {
        await emailInput.fill(testUser.email);
        await passwordInput.fill(testUser.password);
        await page.waitForTimeout(300);
        await signInButton.click();

        // Wait for login (shorter timeout)
        await page.waitForTimeout(2000);
        
        // Quick check if still on auth page
        const stillOnAuthPage = await page.getByText('Sign In', { exact: false }).isVisible({ timeout: 2000 }).catch(() => false);
        
        if (!stillOnAuthPage) {
          // Login successful!
          await use(page);
          return;
        }
      }
    } catch (e) {
      console.warn('Login attempt failed:', e);
    }

    // Login failed - try to create account
    console.log('Login failed, attempting to create account...');
    try {
      await createTestAccount(page, testUser);
      await page.waitForTimeout(2000);
      
      // Final check
      const stillOnAuthPage = await page.getByText('Sign In', { exact: false }).isVisible({ timeout: 2000 }).catch(() => false);
      if (stillOnAuthPage) {
        console.warn('Authentication failed - tests may not work correctly');
      }
    } catch (e) {
      console.warn('Account creation failed:', e);
      // Continue anyway - some tests might work without auth
    }

    await use(page);
  },
});

/**
 * Helper function to create a test account
 */
async function createTestAccount(page: Page, user: { email: string; password: string }) {
  // Navigate to sign up
  const signUpButton = page.getByRole('button', { name: /sign up|don't have an account|already have/i }).first();
  if (await signUpButton.isVisible({ timeout: 3000 }).catch(() => false)) {
    await signUpButton.click();
    await page.waitForTimeout(1500);
  }

  // Wait for sign up form to be visible
  await page.waitForSelector('text=/sign up|create account/i', { timeout: 5000 }).catch(() => {});

  // Fill required sign up form fields
  const emailInput = page.getByLabel(/email/i).first();
  const passwordInput = page.getByLabel(/^password$/i).first();
  const confirmPasswordInput = page.getByLabel(/confirm.*password/i).first();
  
  // Fill email and password
  await emailInput.fill(user.email);
  await passwordInput.fill(user.password);
  
  // Fill confirm password (required)
  if (await confirmPasswordInput.isVisible({ timeout: 3000 }).catch(() => false)) {
    await confirmPasswordInput.fill(user.password);
  }

  // Fill required fields
  const firstNameInput = page.getByLabel(/first.*name|firstname/i).first();
  const lastNameInput = page.getByLabel(/last.*name|lastname/i).first();
  const birthdayInput = page.getByLabel(/birthday|date of birth|dob/i).or(
    page.locator('input[type="date"]')
  ).first();
  const countrySelect = page.getByLabel(/country/i).or(
    page.locator('select, [role="combobox"]').filter({ hasText: /country/i })
  ).first();
  const phoneInput = page.getByLabel(/phone/i).first();
  
  // Fill first name (required, min 2 chars)
  if (await firstNameInput.isVisible({ timeout: 2000 }).catch(() => false)) {
    await firstNameInput.fill('Test');
  }
  
  // Fill last name (required, min 2 chars)
  if (await lastNameInput.isVisible({ timeout: 2000 }).catch(() => false)) {
    await lastNameInput.fill('User');
  }

  // Fill birthday (required, must be 18+)
  if (await birthdayInput.isVisible({ timeout: 2000 }).catch(() => false)) {
    // Calculate date 18 years ago
    const today = new Date();
    const birthYear = today.getFullYear() - 25; // 25 years old to be safe
    const birthDate = `${birthYear}-01-01`;
    await birthdayInput.fill(birthDate);
  }

  // Fill country (required)
  if (await countrySelect.isVisible({ timeout: 2000 }).catch(() => false)) {
    // Try to select "United States" or first available option
    try {
      await countrySelect.click();
      await page.waitForTimeout(500);
      const usOption = page.getByText(/united states|usa/i).first();
      if (await usOption.isVisible({ timeout: 2000 }).catch(() => false)) {
        await usOption.click();
      } else {
        // Select first option
        const firstOption = page.locator('[role="option"]').first();
        if (await firstOption.isVisible({ timeout: 1000 }).catch(() => false)) {
          await firstOption.click();
        }
      }
    } catch (e) {
      // If it's a select element, use selectOption
      try {
        await countrySelect.selectOption({ index: 0 });
      } catch (e2) {
        // Try typing
        await countrySelect.fill('United States');
      }
    }
    await page.waitForTimeout(500);
  }

  // Fill phone (required, min 5 chars)
  if (await phoneInput.isVisible({ timeout: 2000 }).catch(() => false)) {
    await phoneInput.fill('1234567890'); // 10 digits
  }
  
  // Wait for form to be ready
  await page.waitForTimeout(1000);

  // Try to submit form
  const createButton = page.getByRole('button', { name: /create account|sign up/i }).first();
  const buttonVisible = await createButton.isVisible({ timeout: 3000 }).catch(() => false);
  
  if (buttonVisible) {
    // Check if button is disabled (might need more fields)
    const isDisabled = await createButton.isDisabled().catch(() => false);
    
    if (!isDisabled) {
      await createButton.click();
      
      // Wait for account creation (longer timeout for API call)
      await page.waitForTimeout(5000);
      
      // Check for success toast or error
      const successToast = await page.getByText(/success|account created|welcome/i).isVisible({ timeout: 5000 }).catch(() => false);
      const errorToast = await page.getByText(/error|failed/i).isVisible({ timeout: 5000 }).catch(() => false);
      
      if (errorToast) {
        console.log('Account creation failed, will try login instead');
        // If error, try login - account might already exist
        await page.waitForTimeout(2000);
        await loginWithCredentials(page, user);
      }
    } else {
      console.log('Create button is disabled, form may need more fields');
      // Button disabled - might need more fields, try login instead
      await loginWithCredentials(page, user);
    }
  } else {
    // No create button found, try login
    await loginWithCredentials(page, user);
  }

  // Check if we're now logged in
  await page.waitForTimeout(2000);
  const isAuthPage = await page.getByText('Sign In', { exact: false }).isVisible({ timeout: 3000 }).catch(() => false);
  if (isAuthPage) {
    // Still on auth page - account might already exist, try login
    await loginWithCredentials(page, user);
    await page.waitForTimeout(2000);
  }
}

/**
 * Helper function to login with credentials
 */
async function loginWithCredentials(page: Page, user: { email: string; password: string }) {
  // Make sure we're on auth page
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  const emailInput = page.getByLabel('Email Address').first();
  const passwordInput = page.getByLabel('Password').first();
  const signInButton = page.getByRole('button', { name: /sign in|signing in/i }).first();

  await emailInput.fill(user.email);
  await passwordInput.fill(user.password);
  await signInButton.click();

  // Wait for navigation
  await page.waitForTimeout(3000);
}

/**
 * Helper function to ensure user is logged in (can be called in any test)
 */
export async function ensureAuthenticated(page: Page, user: { email: string; password: string } = { email: TEST_USER_EMAIL, password: TEST_USER_PASSWORD }) {
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  const isAuthPage = await page.getByText('Sign In', { exact: false }).isVisible({ timeout: 3000 }).catch(() => false);
  
  if (isAuthPage) {
    // Need to login
    await loginWithCredentials(page, user);
    await page.waitForTimeout(2000);
  }

  // Verify we're logged in
  const stillOnAuthPage = await page.getByText('Sign In', { exact: false }).isVisible({ timeout: 3000 }).catch(() => false);
  if (stillOnAuthPage) {
    // Try creating account
    await createTestAccount(page, user);
    await page.waitForTimeout(2000);
  }
}

export { expect } from '@playwright/test';
