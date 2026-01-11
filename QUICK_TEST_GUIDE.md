# Quick Test Guide

## 🚀 Quick Start

### 1. Unit & Integration Tests (Vitest)

```bash
# Run all tests in watch mode (recommended for development)
npm test

# Run tests once (for CI/CD)
npm run test:run

# Run with coverage report
npm run test:coverage
```

**What it tests:**
- ✅ Calculation utilities (share price, profit/loss, etc.)
- ✅ Market service functions
- ✅ Match result calculations
- ✅ Trading integration logic
- ✅ Decimal utilities (100% coverage!)

**Current Status:**
- ✅ 111 tests passing
- ✅ 95.49% code coverage

---

### 2. End-to-End Tests (Playwright)

**First Time Setup:**
```bash
# Install Playwright browsers (one-time)
npx playwright install chromium
```

**Run E2E Tests:**
```bash
# Run all E2E tests (headless)
npm run test:e2e

# Run with interactive UI (RECOMMENDED - best for debugging)
npm run test:e2e:ui

# Run with visible browser
npm run test:e2e:headed
```

**What it tests:**
- ✅ Authentication flows
- ✅ Trading flows (buy/sell)
- ✅ Match calculations
- ✅ Data drift detection
- ✅ Error handling
- ✅ Runtime errors

**View Results:**
```bash
# Open HTML report in browser
npx playwright show-report
```

---

## 📊 Test Results Location

### Unit Tests
- Results shown in terminal
- Coverage report: `coverage/` directory
- Watch mode: Auto-reruns on file changes

### E2E Tests
- HTML Report: `playwright-report/index.html`
- Screenshots: `test-results/` (on failures)
- Videos: `test-results/` (on failures)

---

## 🎯 Recommended Workflow

### During Development
```bash
# Terminal 1: Start dev server
npm run dev

# Terminal 2: Run unit tests in watch mode
npm test
```

### Before Committing
```bash
# Run unit tests once
npm run test:run

# Run E2E tests
npm run test:e2e:ui
```

### Check Coverage
```bash
npm run test:coverage
```

---

## 🔍 What Gets Tested

### Unit Tests (111 tests)
- ✅ Share price calculations
- ✅ Market cap calculations
- ✅ Match result processing (10% transfer rule)
- ✅ Trading validation
- ✅ Decimal utilities (100% coverage)
- ✅ Portfolio calculations

### E2E Tests (30+ tests)
- ✅ User authentication
- ✅ Buying/selling shares
- ✅ Market cap display
- ✅ Share price = market_cap / 1000 (data drift detection)
- ✅ Error handling
- ✅ Runtime error detection

---

## 🐛 Troubleshooting

### E2E tests fail to start
```bash
# Make sure dev server can start
npm run dev

# Install browsers if needed
npx playwright install chromium
```

### Tests timeout
- Check if dev server is running
- Increase timeout in `playwright.config.ts` if needed

### Coverage not updating
- Make sure you're running `npm run test:coverage`
- Check `coverage/` directory for HTML report

---

## 📝 Quick Commands Cheat Sheet

| Command | What it does |
|---------|-------------|
| `npm test` | Run unit tests (watch mode) |
| `npm run test:run` | Run unit tests once |
| `npm run test:coverage` | Run with coverage |
| `npm run test:e2e` | Run all E2E tests |
| `npm run test:e2e:ui` | Run E2E with UI (best) |
| `npx playwright show-report` | View E2E HTML report |

---

## ✅ Current Test Status

- **Unit Tests**: ✅ 111 passing (95.49% coverage)
- **E2E Tests**: ✅ Ready to run
- **All Critical Logic**: ✅ Fully tested

---

For more details, see:
- `TESTING.md` - Complete testing documentation
- `HOW_TO_RUN_TESTS.md` - Detailed run guide
- `e2e/README.md` - E2E specific docs
