# Football MVP - Complete Product Requirements Document (PRD)
## Premier League Club Shares Trading Platform

---

## 1. PRODUCT OVERVIEW

### 1.1 Vision
A real-time trading platform where users can buy and sell shares in Premier League football clubs. Market values fluctuate based on match results, creating a dynamic investment marketplace.

### 1.2 Core Value Proposition
- **Live Trading**: Buy/sell shares in Premier League clubs
- **Match-Driven Market**: Market caps automatically adjust based on match results
- **Real-Time Updates**: Live market data and trading activity
- **Portfolio Management**: Track investments and performance
- **Transparent Ledger**: Complete transaction history and audit trail

### 1.3 Target Users
- **Primary**: Football fans and sports investors
- **Secondary**: Fantasy sports enthusiasts
- **Admin**: Platform administrators managing teams, matches, and system operations

---

## 2. CORE FEATURES

### 2.1 User Authentication & Profile Management

#### 2.1.1 Authentication
- **Sign Up**: Email/password registration via Supabase Auth
- **Sign In**: Email/password login
- **Session Management**: Persistent sessions with automatic token refresh
- **Profile Creation**: Automatic profile creation on first login
- **Profile Fields**:
  - Username (unique, required)
  - Full name (optional)
  - Avatar URL (optional)
  - Email (from auth)
  - Created/updated timestamps

#### 2.1.2 Wallet System
- **Virtual Wallet**: In-app currency balance (stored in profiles table)
- **Deposit**: Stripe integration for real money deposits
  - Minimum deposit: $10.00 USD
  - Payment methods: Credit/debit cards via Stripe
  - Payment Intent creation via Netlify function
  - Webhook handling for payment confirmation
- **Balance Display**: Real-time wallet balance in navigation
- **Transaction History**: All deposits tracked in audit log

### 2.2 Trading Features

#### 2.2.1 Club Marketplace (Club Values Page)
- **Team Listings**: All 20 Premier League clubs displayed
- **Market Data Display**:
  - Current share price (NAV - Net Asset Value)
  - Market capitalization
  - Available shares
  - Total shares outstanding
  - Price change indicators (up/down arrows)
  - Matchday percentage change
  - Lifetime percentage change
- **Sorting Options**:
  - By name (A-Z, Z-A)
  - By price (high-low, low-high)
  - By change percentage (high-low, low-high)
  - By market cap (high-low, low-high)
- **Buy Window Indicators**:
  - Visual status (open/closed)
  - Countdown timer to next window close
  - Reason for closure (match in progress, buy window closed)
- **Team Details**:
  - Expandable slide-down panel
  - Team logo and information
  - Price chart (historical)
  - Recent orders/trades
  - Match history
  - Performance metrics

#### 2.2.2 Share Purchase Flow
1. **Select Team**: Click "Buy" button on team card
2. **Purchase Modal**:
   - Current share price display
   - Share quantity input (1 to max available)
   - Total cost calculation (price × quantity)
   - Wallet balance check
   - Buy window status check
   - Validation:
     - Sufficient wallet balance
     - Buy window is open
     - Valid share quantity
     - Team is tradeable
3. **Confirmation**: Review purchase details
4. **Execution**:
   - Atomic transaction via database RPC function
   - Wallet balance deduction
   - Position creation/update
   - Order record creation
   - Ledger entry creation
   - Market cap recalculation
   - Share price update (price impact calculation)
5. **Success Feedback**: Toast notification and portfolio refresh

#### 2.2.3 Share Sale Flow
1. **Portfolio View**: Navigate to Portfolio page
2. **Select Position**: Click on team position
3. **Sell Modal**:
   - Current share price
   - Current holdings display
   - Quantity to sell input (1 to current holdings)
   - Total proceeds calculation
   - Validation:
     - Sufficient shares owned
     - Valid quantity
4. **Confirmation**: Review sale details
5. **Execution**:
   - Atomic transaction via database RPC function
   - Wallet balance credit
   - Position update (or deletion if all sold)
   - Order record creation
   - Ledger entry creation
   - Market cap recalculation
   - Share price update (price impact calculation)
6. **Success Feedback**: Toast notification and portfolio refresh

#### 2.2.4 Buy Window System
- **Trading Restrictions**:
  - Trading closes 30 minutes before match kickoff
  - Trading remains closed during match (live/in-play)
  - Trading reopens after match completion
  - Applies to both home and away teams
- **Status Calculation**:
  - Checks upcoming fixtures for team
  - Checks for live matches
  - Calculates time until buy window closes
  - Handles match delays and extra time
- **Visual Indicators**:
  - Green badge: Trading open
  - Red badge: Trading closed
  - Countdown timer: Time until next window close
  - Reason message: Why trading is closed

### 2.3 Portfolio Management

#### 2.3.1 Portfolio Page
- **Overview KPIs**:
  - Total Invested: Sum of all purchase costs
  - Total Market Value: Current value of all holdings
  - Total Profit/Loss: Market value - invested amount
  - Portfolio Percentage: Allocation per team
- **Position List**:
  - Team logo and name
  - Current share price
  - Quantity owned
  - Average purchase price
  - Total invested
  - Current value
  - Profit/loss (absolute and percentage)
  - Price change indicators
- **Actions**:
  - View transaction history (per team)
  - Sell shares
  - View team details

#### 2.3.2 Transaction History
- **Per-Team History**:
  - All buy/sell orders for specific team
  - Order details:
    - Date/time
    - Order type (BUY/SELL)
    - Quantity
    - Price per share
    - Total amount
    - Status (FILLED/CANCELLED)
- **Complete History**:
  - All transactions across all teams
  - Filterable by:
    - Team
    - Order type
    - Date range
    - Status

### 2.4 Match Results & Standings

#### 2.4.1 Match Results Page
- **Fixture List**:
  - Matchday grouping
  - Home vs Away teams
  - Match status (scheduled/closed/applied/postponed)
  - Scores (when available)
  - Match date/time
  - Buy window status
- **Match Details**:
  - Full score
  - Market cap snapshots (before match)
  - Transfer amounts (market cap movement)
  - Impact on share prices

#### 2.4.2 Standings Page
- **League Table**:
  - Team position
  - Points
  - Wins/Draws/Losses
  - Goals for/against
  - Goal difference
- **Market Correlation**:
  - Link between league position and market cap
  - Performance trends

### 2.5 Team Details & Analytics

#### 2.5.1 Team Details Modal/Slide-Down
- **Basic Information**:
  - Team logo
  - Full name
  - Short name
- **Market Data**:
  - Current market cap
  - Share price (NAV)
  - Shares outstanding
  - Available shares
  - Launch price
  - Initial market cap
- **Price Chart**:
  - Historical share price over time
  - Interactive chart (Recharts)
  - Time range selector
  - Key events marked (matches, trades)
- **Recent Orders**:
  - Last 10 trades for this team
  - Buy/sell indicators
  - Timestamps
- **Match History**:
  - Recent fixtures
  - Results
  - Market cap impact
- **Performance Metrics**:
  - Matchday change
  - Lifetime change
  - Win/loss record

### 2.6 Season Simulation (Admin Only)

#### 2.6.1 Simulation Features
- **Match Result Simulation**:
  - Simulate match outcomes
  - Preview market cap impact
  - Test different scenarios
- **Season Reset**:
  - Reset all market caps to initial values
  - Clear match results
  - Reset positions (optional)
- **Bulk Operations**:
  - Apply multiple match results
  - Batch market cap updates

---

## 3. ADMIN FEATURES

### 3.1 Admin Dashboard

#### 3.1.1 Dashboard Overview
- **System Stats**:
  - Total users
  - Total trades
  - Total volume
  - Active positions
  - System health indicators
- **Recent Activity**:
  - Latest trades
  - User registrations
  - System events
- **Quick Actions**:
  - Sync teams from API
  - Sync fixtures from API
  - Process pending matches
  - Reset marketplace

#### 3.1.2 Users Management
- **User List**:
  - User profiles
  - Registration date
  - Wallet balance
  - Total invested
  - Portfolio value
  - Admin status
- **User Actions**:
  - View user details
  - View user portfolio
  - View transaction history
  - Grant/revoke admin access
  - Reset user wallet (with audit)

#### 3.1.3 Teams Management
- **Team List**:
  - All teams with current market data
  - Market cap
  - Share price
  - Shares outstanding
  - Tradeable status
- **Team Actions**:
  - Update market cap (manual adjustment)
  - Update share price
  - Toggle tradeable status
  - Sync from Football API
  - View team timeline/history

#### 3.1.4 Matches Management
- **Fixture List**:
  - All fixtures with status
  - Match results
  - Market cap snapshots
  - Transfer amounts
- **Match Actions**:
  - Sync fixtures from API
  - Update match results manually
  - Process match results (apply market cap transfers)
  - View match details
  - Reschedule/postpone matches

#### 3.1.5 Trading Activity
- **Trade History Table**:
  - All orders (buy/sell)
  - User information
  - Team information
  - Timestamps
  - Amounts
- **Filters**:
  - By user
  - By team
  - By order type
  - By date range
  - By status
- **Export**: CSV export capability

#### 3.1.6 Financial Overview
- **Market Metrics**:
  - Total market cap (all teams)
  - Average share price
  - Total shares outstanding
  - Cash in system (user wallets)
- **Trading Metrics**:
  - Daily/weekly/monthly volume
  - Average trade size
  - Most traded teams
  - Active traders

#### 3.1.7 Audit Log Viewer
- **System Audit Trail**:
  - All system actions
  - User actions
  - Admin actions
  - Database changes
- **Filtering**:
  - By user
  - By action type
  - By table
  - By date range
- **Details**:
  - Before/after values
  - IP address
  - User agent
  - Timestamp

#### 3.1.8 Market Cap Processing
- **Pending Matches**:
  - List of matches with results but unprocessed transfers
  - Manual processing trigger
  - Batch processing
- **Transfer History**:
  - All market cap transfers
  - Winner/loser teams
  - Transfer amounts
  - Match associations

---

## 4. TECHNICAL ARCHITECTURE

### 4.1 Frontend Stack

#### 4.1.1 Core Technologies
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite 5
- **Routing**: React Router DOM v6
- **State Management**: React Context API
- **Data Fetching**: TanStack Query (React Query)
- **UI Framework**: Tailwind CSS
- **Component Library**: Radix UI (headless components)
- **Charts**: Recharts
- **Forms**: React Hook Form + Zod validation
- **Icons**: Lucide React

#### 4.1.2 Key Libraries
- **Supabase Client**: `@supabase/supabase-js` v2
- **Stripe**: `@stripe/stripe-js` + `@stripe/react-stripe-js`
- **Date Handling**: `date-fns`
- **Decimal Math**: `decimal.js` (for financial calculations)
- **Toast Notifications**: Sonner + Radix Toast
- **Theme**: `next-themes` (dark/light mode)

### 4.2 Backend Stack

#### 4.2.1 Database
- **Platform**: Supabase (PostgreSQL 15+)
- **Features Used**:
  - PostgreSQL database
  - Row Level Security (RLS)
  - Real-time subscriptions
  - Database functions (RPC)
  - Triggers
  - Edge Functions (optional)

#### 4.2.2 Serverless Functions (Netlify)
- **Payment Intent Creation**: `create-payment-intent.ts`
  - Creates Stripe PaymentIntent
  - Validates minimum deposit ($10)
  - Returns client secret
- **Stripe Webhook**: `stripe-webhook.ts`
  - Handles payment confirmations
  - Updates user wallet balance
  - Creates audit log entries
- **Match Updates**: `update-matches.ts`
  - Scheduled function (runs every 30 minutes)
  - Syncs fixtures from Football API
  - Updates match statuses and scores
  - Captures market cap snapshots
  - Processes live matches
- **API Cache**: `football-api-cache.ts`
  - Rate limiting for Football API
  - Caching responses
  - Prevents API quota exhaustion

### 4.3 External APIs

#### 4.3.1 Football Data API v4
- **Base URL**: `https://api.football-data.org/v4`
- **Endpoints Used**:
  - `/competitions/PL/matches?season=2025` - Get all fixtures
  - `/matches/{id}` - Get match details
- **Rate Limiting**: 
  - Free tier: 10 requests/minute
  - Caching implemented to reduce calls
- **Data Synced**:
  - Fixtures (matches)
  - Match results
  - Team information

#### 4.3.2 Stripe API
- **Version**: 2024-06-20
- **Features Used**:
  - Payment Intents
  - Webhooks
  - Automatic payment methods
- **Payment Flow**:
  1. Frontend requests PaymentIntent
  2. Netlify function creates PaymentIntent
  3. Frontend uses Stripe Elements for payment
  4. Webhook confirms payment
  5. Wallet balance updated

### 4.4 Real-Time Features

#### 4.4.1 Supabase Realtime
- **Market Updates**: Team market cap changes
- **Order Updates**: New trades/orders
- **Presence**: User online status (optional)
- **Channels**:
  - `market_updates` - Team market data
  - `orders` - Trading activity
  - `fixtures` - Match updates

---

## 5. DATABASE SCHEMA

### 5.1 Core Tables

#### 5.1.1 `profiles`
- **Purpose**: User profiles and wallet balance
- **Key Fields**:
  - `id` (UUID, PK, FK to auth.users)
  - `username` (unique, required)
  - `full_name`, `avatar_url` (optional)
  - `wallet_balance` (numeric, default 0)
  - `created_at`, `updated_at`
- **RLS**: Users can view all, update own

#### 5.1.2 `teams`
- **Purpose**: Premier League teams with market data
- **Key Fields**:
  - `id` (serial, PK)
  - `external_id` (unique, from Football API)
  - `name`, `short_name` (required)
  - `logo_url` (optional)
  - `market_cap` (numeric, default 100)
  - `initial_market_cap` (numeric, default 100)
  - `total_shares` (integer, default 5)
  - `shares_outstanding` (integer, default 5)
  - `available_shares` (integer, default 5)
  - `is_tradeable` (boolean, default true)
  - `launch_price` (numeric, default 20)
- **RLS**: Public read, service role write

#### 5.1.3 `fixtures`
- **Purpose**: Match fixtures and results
- **Key Fields**:
  - `id` (serial, PK)
  - `external_id` (unique, from Football API)
  - `home_team_id`, `away_team_id` (FK to teams)
  - `kickoff_at` (timestamp, required)
  - `buy_close_at` (timestamp, kickoff - 30 min)
  - `status` (scheduled/closed/applied/postponed)
  - `result` (home_win/away_win/draw/pending)
  - `home_score`, `away_score` (integers, default 0)
  - `matchday` (integer, required)
  - `season` (integer, default 2025)
  - `snapshot_home_cap`, `snapshot_away_cap` (numeric, nullable)
- **RLS**: Public read/write

#### 5.1.4 `orders`
- **Purpose**: User buy/sell orders
- **Key Fields**:
  - `id` (serial, PK)
  - `user_id` (UUID, FK to profiles)
  - `team_id` (integer, FK to teams)
  - `order_type` (BUY/SELL)
  - `quantity` (integer, > 0)
  - `price_per_share` (numeric, > 0)
  - `total_amount` (numeric, > 0)
  - `status` (PENDING/FILLED/CANCELLED)
  - `executed_at` (timestamp, nullable)
  - `created_at`, `updated_at`
- **RLS**: Users can view/insert/update own

#### 5.1.5 `positions`
- **Purpose**: User share holdings (simplified, one record per user-team)
- **Key Fields**:
  - `id` (serial, PK)
  - `user_id` (UUID, FK to profiles)
  - `team_id` (integer, FK to teams)
  - `quantity` (numeric, > 0)
  - `total_invested` (numeric, >= 0)
  - `first_purchase_at` (timestamp)
  - `last_updated_at` (timestamp)
  - `created_at`, `updated_at`
- **Unique Constraint**: `(user_id, team_id)`
- **RLS**: Users can view/insert/update/delete own

#### 5.1.6 `total_ledger`
- **Purpose**: Complete transaction history and market cap changes
- **Key Fields**:
  - `id` (serial, PK)
  - `team_id` (integer, FK to teams)
  - `ledger_type` (share_purchase/share_sale/match_win/match_loss/match_draw/initial_state/manual_adjustment)
  - `event_date` (timestamp, default now)
  - `market_cap_before`, `market_cap_after` (numeric)
  - `share_price_before`, `share_price_after` (numeric)
  - `shares_outstanding_before`, `shares_outstanding_after` (integer)
  - `shares_traded` (integer, default 0)
  - `amount_transferred` (numeric, default 0)
  - `price_impact` (numeric, default 0)
  - `trigger_event_type` (order/fixture/manual/initial)
  - `trigger_event_id` (integer, nullable)
  - `opponent_team_id` (integer, FK to teams, nullable)
  - `opponent_team_name` (text, nullable)
  - `match_result` (win/loss/draw, nullable)
  - `match_score` (text, nullable)
  - `is_home_match` (boolean, nullable)
  - `event_description` (text, nullable)
  - `notes` (text, nullable)
  - `created_by` (text, default 'system')
- **RLS**: Public read (no RLS)

#### 5.1.7 `transfers_ledger`
- **Purpose**: Market cap transfers from match results
- **Key Fields**:
  - `id` (serial, PK)
  - `fixture_id` (integer, FK to fixtures)
  - `winner_team_id` (integer, FK to teams)
  - `loser_team_id` (integer, FK to teams)
  - `transfer_amount` (numeric, > 0)
  - `is_latest` (boolean, default true)
  - `applied_at` (timestamp, default now)
  - `created_at`
- **RLS**: Public read/insert

#### 5.1.8 `audit_log`
- **Purpose**: System audit trail
- **Key Fields**:
  - `id` (serial, PK)
  - `user_id` (UUID, FK to profiles, nullable)
  - `table_name` (text, required)
  - `action` (text, required)
  - `record_id` (integer, nullable)
  - `old_values` (jsonb, nullable)
  - `new_values` (jsonb, nullable)
  - `ip_address` (inet, nullable)
  - `user_agent` (text, nullable)
  - `created_at` (timestamp, default now)
- **RLS**: Users can view own, service role all

### 5.2 Database Functions (RPC)

#### 5.2.1 Trading Functions
- `process_share_purchase_atomic` - Atomic share purchase
  - Validates buy window
  - Checks wallet balance
  - Updates positions
  - Creates order
  - Creates ledger entry
  - Updates market cap
  - Calculates price impact
- `process_share_sale_atomic` - Atomic share sale
  - Validates holdings
  - Updates positions
  - Creates order
  - Creates ledger entry
  - Updates market cap
  - Calculates price impact
- `add_position_atomic` - Atomic position management
- `add_position_with_history` - Position with history

#### 5.2.2 Match Processing Functions
- `fixture_result_trigger` - Trigger function for match results
  - Processes match results
  - Calculates market cap transfers
  - Updates team market caps
  - Creates ledger entries
- `create_ledger_entry` - Ledger entry creation
- `create_team_snapshot` - Team snapshot creation

#### 5.2.3 Query Functions
- `get_user_portfolio` - User portfolio data
- `get_team_timeline` - Team timeline data
- `get_team_complete_timeline` - Complete team timeline
- `get_team_state_at_time` - Team state at specific time
- `get_team_state_history` - Team state history
- `is_team_tradeable` - Team tradeability check

#### 5.2.4 Admin Functions
- `reset_marketplace_complete` - Complete marketplace reset
- `clear_season_data` - Season data cleanup
- `create_or_update_profile_atomic` - Profile creation

### 5.3 Database Triggers

#### 5.3.1 Automated Triggers
- `fixture_result_trigger` - ON fixtures (AFTER UPDATE)
  - Processes match results
  - Applies market cap transfers
- `update_fixtures_updated_at` - ON fixtures (BEFORE UPDATE)
- `update_orders_updated_at` - ON orders (BEFORE UPDATE)
- `update_profiles_updated_at` - ON profiles (BEFORE UPDATE)
- `update_teams_updated_at` - ON teams (BEFORE UPDATE)
- `trigger_team_snapshot_on_market_cap_change` - Market cap snapshots

### 5.4 Row Level Security (RLS)

#### 5.4.1 RLS Policies (25 total)
- **profiles**: Users can view all, insert/update own
- **teams**: Public read, service role write
- **fixtures**: Public read/write
- **orders**: Users can view/insert/update own
- **positions**: Users can view/insert/update/delete own
- **total_ledger**: Public read (no RLS)
- **transfers_ledger**: Public read/insert
- **audit_log**: Users can view own, service role all

---

## 6. USER FLOWS

### 6.1 New User Registration Flow

1. **Landing**: User visits application
2. **Authentication Check**: Not authenticated → Auth page
3. **Sign Up**:
   - Enter email and password
   - Submit form
   - Supabase creates auth user
   - Profile automatically created
   - Initial wallet balance: $0
4. **First Login**: Redirected to Marketplace
5. **Onboarding** (optional):
   - View tutorial
   - Make first deposit
   - Browse teams

### 6.2 Deposit Flow

1. **Navigate**: Click "Deposit" in navigation
2. **Deposit Modal**:
   - Enter amount (minimum $10)
   - Click "Deposit"
3. **Stripe Payment**:
   - PaymentIntent created via Netlify function
   - Stripe Elements form displayed
   - Enter card details
   - Submit payment
4. **Webhook Processing**:
   - Stripe webhook received
   - Payment confirmed
   - Wallet balance updated
   - Audit log entry created
5. **Success**: Toast notification, balance refreshed

### 6.3 Purchase Flow

1. **Browse Marketplace**: View Club Values page
2. **Select Team**: Click "Buy" on team card
3. **Purchase Modal**:
   - Enter share quantity
   - View total cost
   - Check buy window status
   - Click "Confirm Purchase"
4. **Validation**:
   - Sufficient wallet balance
   - Buy window is open
   - Valid quantity
   - Team is tradeable
5. **Execution**:
   - Atomic database transaction
   - Wallet balance deducted
   - Position created/updated
   - Order created
   - Ledger entry created
   - Market cap updated
   - Share price recalculated
6. **Success**:
   - Toast notification
   - Portfolio refresh
   - Market data refresh

### 6.4 Sale Flow

1. **Navigate**: Go to Portfolio page
2. **Select Position**: Click on team position
3. **Sell Modal**:
   - Enter quantity to sell
   - View total proceeds
   - Click "Confirm Sale"
4. **Validation**:
   - Sufficient shares owned
   - Valid quantity
5. **Execution**:
   - Atomic database transaction
   - Wallet balance credited
   - Position updated (or deleted)
   - Order created
   - Ledger entry created
   - Market cap updated
   - Share price recalculated
6. **Success**:
   - Toast notification
   - Portfolio refresh
   - Market data refresh

### 6.5 Match Result Processing Flow

1. **Scheduled Sync**: Netlify function runs every 30 minutes
2. **Fetch Fixtures**: Get fixtures from Football API
3. **Update Statuses**:
   - Check match status (SCHEDULED/LIVE/FINISHED)
   - Update fixture status
   - Update scores
4. **Snapshot Capture**: 30 minutes before kickoff
   - Capture market cap snapshots
   - Store in fixture record
5. **Buy Window Closure**: 30 minutes before kickoff
   - Trading closes for both teams
   - Visual indicators update
6. **Match Completion**:
   - Match status: FINISHED
   - Result determined (home_win/away_win/draw)
   - Database trigger fires
7. **Market Cap Transfer**:
   - Calculate transfer amount (10% of loser's market cap)
   - Transfer to winner
   - Update both team market caps
   - Create ledger entries
   - Update share prices
8. **Trading Reopens**: After match completion

---

## 7. SECURITY & COMPLIANCE

### 7.1 Authentication & Authorization

#### 7.1.1 Authentication
- **Provider**: Supabase Auth
- **Methods**: Email/password
- **Session Management**: JWT tokens with refresh
- **Password Policy**: Enforced by Supabase

#### 7.1.2 Authorization
- **Row Level Security**: All tables protected
- **User Isolation**: Users can only access own data
- **Admin Access**: Role-based admin check
- **Service Role**: Server-side operations only

### 7.2 Data Security

#### 7.2.1 Database Security
- **RLS Policies**: 25 policies across 8 tables
- **Encryption**: Supabase handles encryption at rest
- **Backups**: Automatic Supabase backups
- **Audit Trail**: All changes logged

#### 7.2.2 API Security
- **Environment Variables**: No hardcoded secrets
- **API Keys**: Stored in Netlify environment variables
- **Rate Limiting**: Football API rate limiting via caching
- **Input Validation**: All inputs validated and sanitized

#### 7.2.3 Payment Security
- **Stripe Integration**: PCI-compliant payment processing
- **Webhook Verification**: Stripe webhook signature verification
- **Idempotency**: PaymentIntent idempotency keys
- **No Card Storage**: Cards never stored on platform

### 7.3 Security Headers

#### 7.3.1 Netlify Headers
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- `Strict-Transport-Security: max-age=31536000; includeSubDomains`
- `Content-Security-Policy`: Comprehensive CSP

### 7.4 Input Validation & Sanitization

#### 7.4.1 Validation
- **Forms**: React Hook Form + Zod schemas
- **API Inputs**: Server-side validation
- **Database Constraints**: Check constraints on all tables
- **Type Safety**: TypeScript throughout

#### 7.4.2 Sanitization
- **User Inputs**: All inputs sanitized before processing
- **SQL Injection**: Parameterized queries only
- **XSS Prevention**: CSP headers + input sanitization

---

## 8. DEPLOYMENT & INFRASTRUCTURE

### 8.1 Hosting

#### 8.1.1 Frontend
- **Platform**: Netlify
- **Build**: Vite production build
- **Deployment**: Git-based auto-deploy
- **CDN**: Netlify CDN
- **HTTPS**: Automatic SSL certificates

#### 8.1.2 Backend
- **Database**: Supabase (managed PostgreSQL)
- **Functions**: Netlify Functions (serverless)
- **Scheduled Tasks**: Netlify Scheduled Functions
- **Webhooks**: Netlify Functions

### 8.2 Environment Variables

#### 8.2.1 Required Variables
```bash
# Supabase
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=xxx
SUPABASE_SERVICE_ROLE_KEY=xxx

# Football API
VITE_FOOTBALL_API_KEY=xxx

# Stripe
STRIPE_SECRET_KEY_LIVE=sk_live_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx

# Application
VITE_APP_ENV=production
VITE_DEBUG_MODE=false
```

### 8.3 Scheduled Functions

#### 8.3.1 Match Updates
- **Function**: `update-matches.ts`
- **Schedule**: Every 30 minutes (`*/30 * * * *`)
- **Purpose**:
  - Sync fixtures from Football API
  - Update match statuses
  - Capture market cap snapshots
  - Process live matches

### 8.4 Monitoring & Logging

#### 8.4.1 Logging
- **Frontend**: Console logging (development only)
- **Backend**: Netlify function logs
- **Database**: Supabase logs
- **Audit Trail**: Database audit_log table

#### 8.4.2 Monitoring
- **Netlify**: Function execution logs
- **Supabase**: Database performance metrics
- **Stripe**: Payment webhook logs
- **Football API**: Rate limit monitoring

---

## 9. BUSINESS LOGIC

### 9.1 Market Cap Calculation

#### 9.1.1 Initial Market Cap
- **Default**: 100.00 per team
- **Configurable**: Can be set per team
- **Launch Price**: Default $20.00 per share
- **Total Shares**: Default 5 shares per team

#### 9.1.2 Share Price (NAV)
- **Formula**: `Market Cap / Shares Outstanding`
- **Updates**: After every trade
- **Price Impact**: Larger trades affect price more

#### 9.1.3 Price Impact Calculation
- **Buy Impact**: Increases share price
- **Sell Impact**: Decreases share price
- **Formula**: Based on trade size relative to outstanding shares

### 9.2 Match Result Impact

#### 9.2.1 Market Cap Transfer
- **Winner**: Gains 10% of loser's market cap
- **Loser**: Loses 10% of own market cap
- **Draw**: No transfer (both teams keep market cap)
- **Snapshot**: Market caps captured 30 min before kickoff

#### 9.2.2 Transfer Calculation
- **Transfer Amount**: `loser_market_cap * 0.10`
- **Winner New Cap**: `winner_market_cap + transfer_amount`
- **Loser New Cap**: `loser_market_cap - transfer_amount`
- **Share Price Update**: Automatic after transfer

### 9.3 Trading Rules

#### 9.3.1 Buy Window Rules
- **Closes**: 30 minutes before match kickoff
- **Reopens**: After match completion
- **Applies To**: Both home and away teams
- **During Match**: Trading closed (live/in-play)

#### 9.3.2 Order Execution Rules
- **Minimum**: 1 share
- **Maximum**: Available shares (or user's choice)
- **Validation**:
  - Sufficient wallet balance (buy)
  - Sufficient shares owned (sell)
  - Buy window is open
  - Team is tradeable

### 9.4 Wallet Management

#### 9.4.1 Deposits
- **Minimum**: $10.00 USD
- **Currency**: USD only
- **Processing**: Stripe PaymentIntent
- **Confirmation**: Webhook-based
- **Balance Update**: Atomic database update

#### 9.4.2 Withdrawals
- **Not Implemented**: Current version is deposit-only
- **Future**: Withdrawal functionality planned

---

## 10. UI/UX FEATURES

### 10.1 Design System

#### 10.1.1 Theme
- **Default**: Dark theme
- **Toggle**: Light/dark mode support
- **Colors**: Custom Tailwind palette
- **Typography**: System fonts

#### 10.1.2 Components
- **Radix UI**: Headless components
- **Custom Components**: Built on Radix primitives
- **Icons**: Lucide React
- **Charts**: Recharts

### 10.2 Responsive Design

#### 10.2.1 Breakpoints
- **Mobile**: < 640px
- **Tablet**: 640px - 1024px
- **Desktop**: > 1024px

#### 10.2.2 Mobile Optimizations
- **Navigation**: Bottom navigation on mobile
- **Tables**: Scrollable tables
- **Charts**: Responsive chart sizing
- **Modals**: Full-screen on mobile

### 10.3 User Feedback

#### 10.3.1 Notifications
- **Toast Messages**: Success/error notifications
- **Loading States**: Spinners and skeletons
- **Error Boundaries**: Graceful error handling
- **Empty States**: Helpful empty state messages

#### 10.3.2 Real-Time Updates
- **Market Updates**: Toast on price changes
- **Trade Notifications**: Toast on new trades
- **Live Indicators**: Visual indicators for live data

---

## 11. TESTING & QUALITY ASSURANCE

### 11.1 Testing Strategy

#### 11.1.1 Unit Tests
- **Status**: Test infrastructure in place
- **Framework**: Vitest
- **Coverage**: Planned for critical functions

#### 11.1.2 Integration Tests
- **Database Functions**: Test RPC functions
- **API Integration**: Test external API calls
- **Payment Flow**: Test Stripe integration

#### 11.1.3 E2E Tests
- **Status**: Not yet implemented
- **Planned**: User flows testing

### 11.2 Code Quality

#### 11.2.1 Linting
- **Tool**: ESLint
- **Config**: Custom ESLint config
- **Auto-fix**: Available via npm script

#### 11.2.2 Type Safety
- **Language**: TypeScript
- **Strict Mode**: Enabled
- **Type Checking**: Separate npm script

---

## 12. FUTURE ENHANCEMENTS

### 12.1 Planned Features

#### 12.1.1 Withdrawals
- **Withdrawal Requests**: User-initiated withdrawals
- **Processing**: Admin approval workflow
- **Bank Transfer**: Stripe Connect integration

#### 12.1.2 Social Features
- **User Profiles**: Public profiles
- **Leaderboards**: Top traders
- **Social Trading**: Follow other traders
- **Comments**: Discussion threads

#### 12.1.3 Advanced Trading
- **Limit Orders**: Set price targets
- **Stop Loss**: Automatic sell triggers
- **Portfolio Analytics**: Advanced metrics
- **Trading Strategies**: Strategy builder

#### 12.1.4 Mobile App
- **Native Apps**: iOS and Android
- **Push Notifications**: Price alerts
- **Offline Mode**: Cached data

### 12.2 Scalability Improvements

#### 12.2.1 Performance
- **Caching**: Redis for frequently accessed data
- **CDN**: Enhanced CDN for static assets
- **Database Optimization**: Query optimization
- **Real-Time Scaling**: Supabase real-time scaling

#### 12.2.2 Features
- **Multiple Leagues**: Expand beyond Premier League
- **International Markets**: Multi-currency support
- **Derivatives**: Options and futures
- **NFT Integration**: Team NFT ownership

---

## 13. APPENDIX

### 13.1 File Structure

```
football-mvp/
├── src/
│   ├── app/                    # App entry point
│   ├── components/            # Reusable components
│   ├── config/                # Configuration files
│   │   └── database/         # Database docs
│   ├── features/             # Feature modules
│   │   ├── admin/           # Admin features
│   │   ├── auth/            # Authentication
│   │   ├── layout/          # App layout
│   │   └── trading/         # Trading features
│   ├── pages/               # Page components
│   └── shared/              # Shared utilities
│       ├── components/     # Shared UI components
│       ├── lib/            # Utility libraries
│       └── types/          # TypeScript types
├── netlify/
│   └── functions/          # Netlify serverless functions
├── supabase/
│   ├── migrations/         # Database migrations
│   └── functions/          # Edge functions (optional)
├── public/                 # Static assets
└── dist/                   # Build output
```

### 13.2 Key Services

#### 13.2.1 Frontend Services
- `supabase.ts` - Supabase client
- `database.ts` - Database service layer
- `football-api.ts` - Football API service
- `buy-window.service.ts` - Buy window logic
- `formatters.ts` - Data formatting utilities
- `calculations.ts` - Financial calculations
- `validation.ts` - Input validation
- `sanitization.ts` - Input sanitization

#### 13.2.2 Admin Services
- `admin.service.ts` - Admin operations
- `realtime.service.ts` - Real-time subscriptions
- `positions.service.ts` - Position management
- `orders.service.ts` - Order management

### 13.3 Database Migrations

#### 13.3.1 Migration Files
- **Location**: `supabase/migrations/`
- **Count**: 94 migration files
- **Order**: Chronological (timestamp-based)
- **Application**: Via Supabase CLI or dashboard

### 13.4 API Rate Limits

#### 13.4.1 Football Data API
- **Free Tier**: 10 requests/minute
- **Caching**: Implemented to reduce calls
- **Scheduled Sync**: Every 30 minutes

#### 13.4.2 Supabase
- **Free Tier**: 500MB database, 2GB bandwidth
- **Real-Time**: 200 concurrent connections
- **Functions**: 500K invocations/month

---

## 14. SUCCESS METRICS

### 14.1 User Metrics
- **User Registrations**: Daily/weekly/monthly
- **Active Users**: DAU/WAU/MAU
- **User Retention**: Day 1, 7, 30 retention
- **Average Session Duration**: Time spent on platform

### 14.2 Trading Metrics
- **Total Trades**: Daily/weekly/monthly volume
- **Average Trade Size**: Mean trade value
- **Most Traded Teams**: Top teams by volume
- **Active Traders**: Users making trades

### 14.3 Financial Metrics
- **Total Deposits**: Cumulative deposits
- **Average Deposit**: Mean deposit amount
- **Total Market Cap**: Sum of all team market caps
- **Platform Revenue**: Transaction fees (if applicable)

### 14.4 Technical Metrics
- **API Response Times**: Average response time
- **Error Rates**: Error percentage
- **Uptime**: Platform availability
- **Function Execution**: Netlify function performance

---

## 15. SUPPORT & DOCUMENTATION

### 15.1 User Documentation
- **README.md**: Setup and deployment guide
- **Database Schema**: Complete schema documentation
- **API Documentation**: External API integration guides

### 15.2 Developer Documentation
- **Code Comments**: Inline documentation
- **Type Definitions**: TypeScript types
- **Architecture Docs**: System architecture overview

### 15.3 Deployment Documentation
- **DEPLOYMENT.md**: Deployment guide
- **DEPLOYMENT_CHECKLIST.md**: Pre-deployment checklist
- **SECURITY_CHECKLIST.md**: Security checklist
- **NETLIFY_CRON_SETUP_GUIDE.md**: Scheduled functions guide

---

**Document Version**: 1.0  
**Last Updated**: 2025-01-27  
**Status**: Production Ready



