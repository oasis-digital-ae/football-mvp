# Complete Database Schema - Football MVP

## Overview
This document contains the complete database schema for the Football MVP application, including tables, constraints, RLS policies, functions, triggers, and indexes.

---

## Tables (11 total)

### Core Tables
- `audit_log` - System audit trail
- `fixtures` - Match fixtures and results
- `orders` - User buy/sell orders
- `positions` - User holdings (simplified, one record per user-team)
- `profiles` - User profiles and authentication
- `teams` - Football teams with market cap and share data
- `total_ledger` - Complete transaction history
- `transfers_ledger` - Match result transfers between teams

### Additional Tables
- `current_team_states` - Current team state snapshots
- `team_market_data` - Team market data view
- `team_performance_summary` - Team performance analytics

---

## Table Structures

### audit_log
```
user_agent (text), table_name (text, NOT NULL), old_values (jsonb), new_values (jsonb), 
ip_address (inet), action (text, NOT NULL), created_at (timestamp with time zone, DEFAULT now()), 
id (integer, NOT NULL, DEFAULT nextval('audit_log_id_seq'::regclass)), user_id (uuid), record_id (integer)
```

### fixtures
```
snapshot_home_cap (numeric), snapshot_away_cap (numeric), buy_close_at (timestamp with time zone, NOT NULL), 
kickoff_at (timestamp with time zone, NOT NULL), updated_at (timestamp with time zone, DEFAULT now()), 
created_at (timestamp with time zone, DEFAULT now()), away_score (integer, DEFAULT 0), 
home_score (integer, DEFAULT 0), matchday (integer, NOT NULL), away_team_id (integer), 
home_team_id (integer), result (text, DEFAULT 'pending'::text), status (text, NOT NULL, DEFAULT 'SCHEDULED'::text), 
id (integer, NOT NULL, DEFAULT nextval('fixtures_id_seq'::regclass)), external_id (integer, NOT NULL), season (integer)
```

### orders
```
quantity (integer, NOT NULL), order_type (text, NOT NULL), id (integer, NOT NULL, DEFAULT nextval('orders_id_seq'::regclass)), 
user_id (uuid), team_id (integer), price_per_share (numeric, NOT NULL), total_amount (numeric, NOT NULL), 
executed_at (timestamp with time zone), created_at (timestamp with time zone, DEFAULT now()), 
updated_at (timestamp with time zone, DEFAULT now()), status (text, NOT NULL, DEFAULT 'PENDING'::text)
```

### positions
```
user_id (uuid), id (integer, NOT NULL, DEFAULT nextval('positions_id_seq'::regclass)), 
last_updated_at (timestamp with time zone), first_purchase_at (timestamp with time zone), 
total_invested (numeric), quantity (numeric), team_id (integer), 
updated_at (timestamp with time zone, DEFAULT now()), created_at (timestamp with time zone, DEFAULT now())
```

### profiles
```
updated_at (timestamp with time zone, DEFAULT now()), created_at (timestamp with time zone, DEFAULT now()), 
id (uuid, NOT NULL), full_name (text), avatar_url (text), username (text, NOT NULL)
```

### teams
```
created_at (timestamp with time zone, DEFAULT now()), launch_price (numeric, DEFAULT 20.00), 
id (integer, NOT NULL, DEFAULT nextval('teams_id_seq'::regclass)), external_id (integer, NOT NULL), 
initial_market_cap (numeric, DEFAULT 100.00), market_cap (numeric, DEFAULT 100.00), 
total_shares (integer, DEFAULT 5), short_name (text, NOT NULL), logo_url (text), name (text, NOT NULL), 
available_shares (integer, DEFAULT 5), shares_outstanding (integer, DEFAULT 5), 
is_tradeable (boolean, DEFAULT true), updated_at (timestamp with time zone, DEFAULT now())
```

### total_ledger
```
share_price_before (numeric, NOT NULL), created_at (timestamp with time zone, DEFAULT now()), 
share_price_after (numeric, NOT NULL), notes (text), shares_traded (integer, NOT NULL, DEFAULT 0), 
shares_outstanding_after (integer, NOT NULL), shares_outstanding_before (integer, NOT NULL), 
market_cap_after (numeric, NOT NULL), market_cap_before (numeric, NOT NULL), 
price_impact (numeric, NOT NULL, DEFAULT 0), amount_transferred (numeric, NOT NULL, DEFAULT 0), 
is_home_match (boolean), opponent_team_id (integer), ledger_type (text, NOT NULL), 
trigger_event_id (integer), event_description (text), event_date (timestamp with time zone, NOT NULL, DEFAULT now()), 
trigger_event_type (text), opponent_team_name (text), match_result (text), match_score (text), 
id (integer, NOT NULL, DEFAULT nextval('total_ledger_id_seq'::regclass)), team_id (integer, NOT NULL), 
created_by (text, DEFAULT 'system'::text)
```

### transfers_ledger
```
applied_at (timestamp with time zone, DEFAULT now()), transfer_amount (numeric, NOT NULL), 
loser_team_id (integer, NOT NULL), winner_team_id (integer, NOT NULL), fixture_id (integer, NOT NULL), 
created_at (timestamp with time zone, DEFAULT now()), id (integer, NOT NULL, DEFAULT nextval('transfers_ledger_id_seq'::regclass)), 
is_latest (boolean, DEFAULT true)
```

---

## Constraints

### Primary Keys
- `audit_log_pkey` - audit_log
- `fixtures_pkey` - fixtures
- `orders_pkey` - orders
- `positions_pkey` - positions
- `profiles_pkey` - profiles
- `teams_pkey` - teams
- `total_ledger_pkey` - total_ledger
- `transfers_ledger_pkey` - transfers_ledger

### Foreign Keys
- `audit_log_user_id_fkey` - audit_log.user_id → profiles.id
- `fixtures_away_team_id_fkey` - fixtures.away_team_id → teams.id
- `fixtures_home_team_id_fkey` - fixtures.home_team_id → teams.id
- `orders_user_id_fkey` - orders.user_id → profiles.id
- `orders_team_id_fkey` - orders.team_id → teams.id
- `positions_user_id_fkey` - positions.user_id → profiles.id
- `positions_team_id_fkey` - positions.team_id → teams.id
- `profiles_id_fkey` - profiles.id → auth.users.id
- `total_ledger_opponent_team_id_fkey` - total_ledger.opponent_team_id → teams.id
- `total_ledger_team_id_fkey` - total_ledger.team_id → teams.id
- `transfers_ledger_fixture_id_fkey` - transfers_ledger.fixture_id → fixtures.id
- `transfers_ledger_loser_team_id_fkey` - transfers_ledger.loser_team_id → teams.id
- `transfers_ledger_winner_team_id_fkey` - transfers_ledger.winner_team_id → teams.id

### Unique Constraints
- `fixtures_external_id_key` - fixtures.external_id
- `positions_user_team_unique` - positions(user_id, team_id) ⭐ **Simplified constraint**
- `profiles_username_key` - profiles.username
- `teams_external_id_key` - teams.external_id

### Check Constraints
- `orders_order_type_check` - order_type IN ('BUY', 'SELL')
- `orders_price_per_share_check` - price_per_share > 0
- `orders_quantity_check` - quantity > 0
- `orders_status_check` - status IN ('PENDING', 'FILLED', 'CANCELLED')
- `orders_total_amount_check` - total_amount > 0
- `fixtures_result_check` - result IN ('home_win', 'away_win', 'draw', 'pending')
- `total_ledger_ledger_type_check` - ledger_type IN ('share_purchase', 'share_sale', 'match_win', 'match_loss', 'match_draw', 'initial_state', 'manual_adjustment')
- `total_ledger_match_result_check` - match_result IN ('win', 'loss', 'draw')
- `total_ledger_trigger_event_type_check` - trigger_event_type IN ('order', 'fixture', 'manual', 'initial')
- `valid_quantities` - positions.quantity > 0
- `valid_investments` - positions.total_invested >= 0
- `valid_market_caps` - total_ledger market cap validation
- `valid_share_counts` - total_ledger share count validation
- `valid_share_prices` - total_ledger share price validation

---

## Row Level Security (RLS)

### RLS Status
- ✅ `audit_log` - RLS Enabled
- ✅ `fixtures` - RLS Enabled
- ✅ `orders` - RLS Enabled
- ✅ `positions` - RLS Enabled
- ✅ `profiles` - RLS Enabled
- ✅ `teams` - RLS Enabled
- ❌ `total_ledger` - RLS Disabled (public read access)
- ✅ `transfers_ledger` - RLS Enabled

### RLS Policies (25 total)

#### audit_log
- `Service role can manage all audit logs` - FOR ALL
- `Users can view own audit logs` - FOR SELECT

#### fixtures
- `Anyone can insert fixtures` - FOR INSERT
- `Anyone can update fixtures` - FOR UPDATE
- `Anyone can view fixtures` - FOR SELECT
- `Service role can manage fixtures` - FOR ALL

#### orders
- `Service role can manage all orders` - FOR ALL
- `Users can insert own orders` - FOR INSERT
- `Users can update own orders` - FOR UPDATE
- `Users can view own orders` - FOR SELECT

#### positions
- `Users can delete their own positions` - FOR DELETE
- `Users can insert their own positions` - FOR INSERT
- `Users can update their own positions` - FOR UPDATE
- `Users can view their own positions` - FOR SELECT

#### profiles
- `Users can insert own profile` - FOR INSERT
- `Users can update own profile` - FOR UPDATE
- `Users can view all profiles` - FOR SELECT

#### teams
- `Anyone can insert teams` - FOR INSERT
- `Anyone can update teams` - FOR UPDATE
- `Anyone can view teams` - FOR SELECT
- `Service role can manage teams` - FOR ALL

#### transfers_ledger
- `Anyone can insert match transfers` - FOR INSERT
- `Anyone can view match transfers` - FOR SELECT
- `Service role can manage all transfers` - FOR ALL

---

## Functions (19 total)

### Core Functions
- `add_position_atomic` - Atomic position management
- `add_position_with_history` - Position management with history
- `clear_season_data` - Season data cleanup
- `create_ledger_entry` - Ledger entry creation
- `create_team_snapshot` - Team snapshot creation
- `fixture_result_trigger` - Match result processing
- `get_team_complete_timeline` - Complete team timeline
- `get_team_state_at_time` - Team state at specific time
- `get_team_state_history` - Team state history
- `get_team_timeline` - Team timeline data
- `get_user_portfolio` - User portfolio data
- `is_team_tradeable` - Team tradeability check
- `reset_marketplace_complete` - Complete marketplace reset
- `total_ledger_trigger` - Total ledger trigger function
- `trigger_team_snapshot_on_market_cap_change` - Market cap change snapshots
- `truncate_profiles_table` - Profiles table cleanup
- `update_updated_at_column` - Timestamp update utility

---

## Triggers (5 total)

### Automated Triggers
- `fixture_result_trigger` - ON fixtures (AFTER UPDATE) - Processes match results
- `update_fixtures_updated_at` - ON fixtures (BEFORE UPDATE) - Updates timestamps
- `update_orders_updated_at` - ON orders (BEFORE UPDATE) - Updates timestamps
- `update_profiles_updated_at` - ON profiles (BEFORE UPDATE) - Updates timestamps
- `update_teams_updated_at` - ON teams (BEFORE UPDATE) - Updates timestamps

---

## Indexes (40+ total)

### Primary Key Indexes (UNIQUE)
- `audit_log_pkey` - audit_log
- `fixtures_pkey` - fixtures
- `orders_pkey` - orders
- `positions_pkey` - positions
- `profiles_pkey` - profiles
- `teams_pkey` - teams
- `total_ledger_pkey` - total_ledger
- `transfers_ledger_pkey` - transfers_ledger

### Unique Constraint Indexes
- `fixtures_external_id_key` - fixtures
- `positions_user_team_unique` - positions ⭐ **Simplified constraint index**
- `profiles_username_key` - profiles
- `teams_external_id_key` - teams

### Performance Indexes

#### audit_log
- `idx_audit_log_action` - Action lookups
- `idx_audit_log_user_id` - User-based queries

#### fixtures
- `idx_fixtures_applied` - Applied fixtures
- `idx_fixtures_external_id` - External ID lookups
- `idx_fixtures_kickoff_status` - Kickoff and status
- `idx_fixtures_matchday` - Matchday queries
- `idx_fixtures_scheduled` - Scheduled fixtures
- `idx_fixtures_status` - Status queries
- `idx_fixtures_team_results` - Team results
- `idx_fixtures_team_status` - Team status

#### orders
- `idx_orders_pending` - Pending orders
- `idx_orders_status` - Status queries
- `idx_orders_team_id` - Team-based queries
- `idx_orders_team_status` - Team and status
- `idx_orders_user_id` - User-based queries
- `idx_orders_user_status` - User and status

#### profiles
- `idx_profiles_username` - Username lookups

#### teams
- `idx_teams_external_id` - External ID lookups
- `idx_teams_market_cap_calc` - Market cap calculations
- `idx_teams_market_data` - Market data queries
- `idx_teams_name` - Name lookups
- `idx_teams_name_lower` - Case-insensitive name lookups

#### total_ledger
- `idx_total_ledger_event_date` - Event date queries
- `idx_total_ledger_ledger_type` - Ledger type queries
- `idx_total_ledger_team_date` - Team and date queries
- `idx_total_ledger_team_id` - Team-based queries
- `idx_total_ledger_trigger_event` - Trigger event queries

#### transfers_ledger
- `idx_transfers_applied_at` - Applied date queries
- `idx_transfers_fixture_id` - Fixture-based queries
- `idx_transfers_loser_team_id` - Loser team queries
- `idx_transfers_team_applied` - Team and applied date
- `idx_transfers_winner_team_id` - Winner team queries

---

## Key Features

### ✅ Simplified Positions Table
- **One record per user-team combination**
- **No `is_latest` constraint issues**
- **Unique constraint**: `positions_user_team_unique`
- **Direct updates** instead of complex aggregation

### ✅ Comprehensive Security
- **25 RLS policies** for data access control
- **User isolation** for personal data
- **Public access** for shared data (teams, fixtures)
- **Service role** for system operations

### ✅ Performance Optimization
- **40+ indexes** for all major query patterns
- **Composite indexes** for complex queries
- **Unique constraints** properly indexed

### ✅ Business Logic Automation
- **19 custom functions** for business operations
- **5 triggers** for automated processes
- **Match result processing** automation
- **Timestamp management** automation

### ✅ Data Integrity
- **Comprehensive constraints** for data validation
- **Foreign key relationships** maintained
- **Check constraints** for business rules
- **Referential integrity** enforced

---

## Schema Evolution

This schema represents the **simplified, production-ready** version after removing the problematic `is_latest` constraint from the positions table. The database now provides:

- **Better performance** with simplified position management
- **No constraint violations** with direct updates
- **Complete transaction history** via orders table
- **Robust security** with comprehensive RLS policies
- **Automated processes** with triggers and functions
- **Optimized queries** with extensive indexing

---

*Generated from complete database schema export*
*Last updated: $(date)*
