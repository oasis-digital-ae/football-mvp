# Database Schema & Scripts

This directory contains essential SQL scripts for managing the Football MVP database schema and operations.

## 📋 Complete Schema Documentation

- **`COMPLETE_SCHEMA.md`** - Complete database schema with tables, constraints, RLS policies, functions, triggers, and indexes

## 🗄️ Current Database Schema

The application uses the following main tables:

### Core Tables
- **`profiles`** - User profiles and authentication
- **`teams`** - Football teams with market cap and share data
- **`fixtures`** - Match fixtures and results
- **`orders`** - User buy/sell orders
- **`positions`** - User holdings (simplified, one record per user-team)
- **`total_ledger`** - Complete transaction history
- **`transfers_ledger`** - Match result transfers between teams
- **`audit_log`** - System audit trail

### Key Features
- **Simplified Positions**: One record per user-team combination (no `is_latest` constraint)
- **Complete Transaction History**: All changes tracked in `total_ledger`
- **Match-based Transfers**: Automatic market cap transfers on match results
- **Row Level Security**: User data isolation

## 🚀 Essential Scripts

### Setup & Migration
- **`remove_is_latest_constraint.sql`** - Migrates positions table to simplified structure
- **`add_missing_premier_league_teams.sql`** - Adds Premier League teams

### Reset & Cleanup
- **`reset_marketplace_complete.sql`** - Resets all marketplace data
- **`reset_database_complete.sql`** - Complete database reset
- **`reset_teams_only.sql`** - Reset only team data
- **`reset_fixtures_for_simulation.sql`** - Reset fixtures for testing

### Performance & Optimization
- **`performance_indexes.sql`** - Database performance indexes
- **`advanced_performance_optimizations.sql`** - Advanced optimizations

### CORS & Configuration
- **`universal_cors_setup.sql`** - CORS configuration
- **`netlify_cors_setup.sql`** - Netlify-specific CORS
- **`local_cors_setup.sql`** - Local development CORS

### Utilities
- **`check_email_config.sql`** - Email configuration check

## 🧹 Cleanup Summary

**Removed 30+ unnecessary files:**
- ❌ All schema export scripts (replaced by `COMPLETE_SCHEMA.md`)
- ❌ All fix/legacy scripts (no longer needed)
- ❌ All debug scripts (development completed)
- ❌ All migration scripts (migrations completed)
- ❌ All documentation markdown files (consolidated)
- ❌ All snapshot system scripts (deprecated)

## 📖 Usage

### Initial Setup
1. Run `remove_is_latest_constraint.sql` to migrate to simplified positions
2. Run `add_missing_premier_league_teams.sql` to add teams
3. Run `performance_indexes.sql` for optimization

### Reset Data
- Use `reset_marketplace_complete.sql` for marketplace reset
- Use `reset_database_complete.sql` for complete reset

### CORS Setup
- Use `universal_cors_setup.sql` for production
- Use `netlify_cors_setup.sql` for Netlify deployment
- Use `local_cors_setup.sql` for local development

## 🎯 Schema Benefits

### Positions Table (Simplified)
```sql
CREATE TABLE positions (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES profiles(id),
  team_id INTEGER REFERENCES teams(id),
  quantity NUMERIC CHECK (quantity > 0),
  total_invested NUMERIC CHECK (total_invested >= 0),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, team_id)
);
```

### Key Benefits
- **No constraint violations**: Simple unique constraint
- **Better performance**: One record per user-team
- **Complete history**: Orders table provides transaction history
- **Easier maintenance**: No complex aggregation logic
- **Clean codebase**: Removed 30+ unnecessary files