# How to Run Tests

Quick reference guide for running all tests in the Football MVP application.

## Prerequisites

Make sure you have:
- Node.js 18+ installed
- Dependencies installed: `npm install`
- Dev server can start (for E2E tests)

## Unit & Integration Tests (Vitest)

### Run all unit tests
```bash
npm test
```
Runs tests in watch mode - tests re-run when files change.

### Run tests once (CI mode)
```bash
npm test:run
```
Runs all tests once and exits. Use this in CI/CD pipelines.

### Run tests with UI
```bash
npm test:ui
```
Opens an interactive UI in your browser to view and run tests.

### Run tests with coverage
```bash
npm test:coverage
```
Shows code coverage report after running tests.

### Run specific test file
```bash
npx vitest run src/shared/lib/utils/__tests__/calculations.test.ts
```

## End-to-End Tests (Playwright)

### First Time Setup
```bash
# Install Playwright browsers (one-time setup)
npx playwright install chromium
```

### Run all E2E tests
```bash
npm run test:e2e
```
- Automatically starts dev server
- Runs all E2E tests
- Closes dev server when done

### Run E2E tests with UI (Recommended)
```bash
npm run test:e2e:ui
```
Opens Playwright UI for interactive test running and debugging.

### Run E2E tests in headed mode (see browser)
```bash
npm run test:e2e:headed
```
Runs tests with visible browser window - useful for debugging.

### Debug E2E tests
```bash
npm run test:e2e:debug
```
Opens Playwright Inspector to step through tests.

### Run specific E2E test file
```bash
npx playwright test e2e/auth.spec.ts
```

### Run specific test by name
```bash
npx playwright test -g "should display auth page"
```

## Quick Start Examples

### Run everything (unit + E2E)
```bash
# Terminal 1: Start dev server
npm run dev

# Terminal 2: Run unit tests
npm test:run

# Terminal 3: Run E2E tests
npm run test:e2e
```

### Development workflow
```bash
# 1. Start dev server
npm run dev

# 2. In another terminal, run unit tests in watch mode
npm test

# 3. When ready, run E2E tests
npm run test:e2e:ui
```

## Test Results

### Unit Tests
- Results shown in terminal
- Coverage report: `coverage/` directory
- Watch mode: Tests re-run automatically

### E2E Tests
- Results shown in terminal
- HTML report: `playwright-report/index.html` (open in browser)
- Screenshots: `test-results/` (on failures)
- Videos: `test-results/` (on failures)

### View E2E HTML Report
```bash
npx playwright show-report
```

## Common Issues

### E2E tests fail to start
```bash
# Make sure dev server can start
npm run dev

# If port 5173 is busy, change it in vite.config.ts
```

### Playwright browsers not installed
```bash
npx playwright install --with-deps chromium
```

### Tests timeout
- Increase timeout in `playwright.config.ts`
- Check if dev server is running
- Check network connectivity

## CI/CD Usage

### GitHub Actions Example
```yaml
- name: Run unit tests
  run: npm run test:run

- name: Install Playwright
  run: npx playwright install --with-deps chromium

- name: Run E2E tests
  run: npm run test:e2e
  env:
    CI: true
```

## Quick Commands Cheat Sheet

| Command | What it does |
|---------|-------------|
| `npm test` | Run unit tests (watch mode) |
| `npm test:run` | Run unit tests once |
| `npm test:coverage` | Run with coverage |
| `npm run test:e2e` | Run all E2E tests |
| `npm run test:e2e:ui` | Run E2E with UI |
| `npm run test:e2e:headed` | Run E2E with visible browser |
| `npx playwright show-report` | View E2E HTML report |

## Need Help?

- Check `TESTING.md` for detailed testing guide
- Check `e2e/README.md` for E2E specific docs
- Check `COMPLETE_TESTING_SETUP.md` for full overview
