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

## 🚀 Database Migrations

All database migrations are located in the `supabase/migrations/` directory and should be run in chronological order (by filename timestamp). The Supabase CLI will automatically apply these migrations when you run:

```bash
supabase db push
```

Or you can apply them manually through the Supabase Dashboard SQL Editor.

## 📖 Usage

### Initial Setup
1. Ensure all migrations in `supabase/migrations/` are applied to your database
2. The migrations include all necessary schema, functions, triggers, and RLS policies
3. See `COMPLETE_SCHEMA.md` for detailed schema documentation

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