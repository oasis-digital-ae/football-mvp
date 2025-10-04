-- Remove is_latest constraint and consolidate positions
-- This will simplify the positions table to have one record per user-team combination

-- 1. First, let's see what we're working with
SELECT 
    'Before Cleanup' as status,
    user_id,
    team_id,
    COUNT(*) as position_count,
    SUM(quantity) as total_quantity,
    SUM(total_invested) as total_invested
FROM positions 
GROUP BY user_id, team_id
ORDER BY position_count DESC;

-- 2. Create a consolidated positions table
CREATE TABLE positions_consolidated AS
SELECT 
    user_id,
    team_id,
    SUM(quantity) as quantity,
    SUM(total_invested) as total_invested,
    MIN(created_at) as first_purchase_at,
    MAX(updated_at) as last_updated_at
FROM positions
GROUP BY user_id, team_id;

-- 3. Drop the old positions table
DROP TABLE positions CASCADE;

-- 4. Rename the consolidated table
ALTER TABLE positions_consolidated RENAME TO positions;

-- 5. Add primary key and constraints
ALTER TABLE positions ADD COLUMN id SERIAL PRIMARY KEY;
ALTER TABLE positions ADD COLUMN created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE positions ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- 6. Add unique constraint for user-team combination (no is_latest needed)
ALTER TABLE positions ADD CONSTRAINT positions_user_team_unique UNIQUE (user_id, team_id);

-- 7. Add foreign key constraints
ALTER TABLE positions ADD CONSTRAINT positions_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE positions ADD CONSTRAINT positions_team_id_fkey FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE;

-- 8. Add check constraints
ALTER TABLE positions ADD CONSTRAINT valid_quantities CHECK (quantity > 0);
ALTER TABLE positions ADD CONSTRAINT valid_investments CHECK (total_invested >= 0);

-- 9. Enable RLS and add policies
ALTER TABLE positions ENABLE ROW LEVEL SECURITY;

-- 10. Add RLS policies
-- Policy for users to see their own positions
CREATE POLICY "Users can view their own positions" ON positions
    FOR SELECT USING (auth.uid() = user_id);

-- Policy for users to insert their own positions
CREATE POLICY "Users can insert their own positions" ON positions
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Policy for users to update their own positions
CREATE POLICY "Users can update their own positions" ON positions
    FOR UPDATE USING (auth.uid() = user_id);

-- Policy for users to delete their own positions
CREATE POLICY "Users can delete their own positions" ON positions
    FOR DELETE USING (auth.uid() = user_id);

-- 11. Verify the result
SELECT 
    'After Cleanup' as status,
    user_id,
    team_id,
    quantity,
    total_invested,
    created_at,
    updated_at
FROM positions 
ORDER BY user_id, team_id;
