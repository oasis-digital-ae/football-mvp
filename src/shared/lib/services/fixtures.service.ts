// Fixtures service - handles all fixture-related database operations
import { supabase } from '../supabase';
import { logger } from '../logger';
import { sanitizeInput } from '../sanitization';

export interface DatabaseFixture {
  id: number;
  home_team_id: number;
  away_team_id: number;
  kickoff_at: string;
  buy_close_at: string;
  snapshot_home_cap?: number;
  snapshot_away_cap?: number;
  result: 'home_win' | 'away_win' | 'draw' | 'pending';
  status: 'scheduled' | 'closed' | 'applied' | 'postponed';
  home_score?: number;
  away_score?: number;
  matchday?: number;
  season?: number;
  created_at: string;
}

export const fixturesService = {
  async getAll(): Promise<DatabaseFixture[]> {
    const { data, error } = await supabase
      .from('fixtures')
      .select(`
        *,
        home_team:teams!fixtures_home_team_id_fkey(name, external_id),
        away_team:teams!fixtures_away_team_id_fkey(name, external_id)
      `)
      .order('kickoff_at', { ascending: true });
    
    if (error) throw error;
    return data || [];
  },

  async getUpcoming(): Promise<DatabaseFixture[]> {
    const { data, error } = await supabase
      .from('fixtures')
      .select(`
        *,
        home_team:teams!fixtures_home_team_id_fkey(name, external_id),
        away_team:teams!fixtures_away_team_id_fkey(name, external_id)
      `)
      .gte('kickoff_at', new Date().toISOString())
      .order('kickoff_at', { ascending: true });
    
    if (error) throw error;
    return data || [];
  },

  async create(fixture: Omit<DatabaseFixture, 'id' | 'created_at'>): Promise<DatabaseFixture> {
    const { data, error } = await supabase
      .from('fixtures')
      .insert(fixture)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },

  async updateResult(id: string, result: DatabaseFixture['result']): Promise<void> {
    const { error } = await supabase
      .from('fixtures')
      .update({ result })
      .eq('id', id);
    
    if (error) throw error;
  },

  async getFixturesNeedingSnapshot(): Promise<DatabaseFixture[]> {
    const now = new Date();
    const { data, error } = await supabase
      .from('fixtures')
      .select(`
        *,
        home_team:teams!fixtures_home_team_id_fkey(name, external_id),
        away_team:teams!fixtures_away_team_id_fkey(name, external_id)
      `)
      .eq('status', 'scheduled')
      .lte('kickoff_at', now.toISOString())
      .is('snapshot_home_cap', null);
    
    if (error) throw error;
    return data || [];
  },

  async getFixturesNeedingProcessing(): Promise<DatabaseFixture[]> {
    const { data, error } = await supabase
      .from('fixtures')
      .select(`
        *,
        home_team:teams!fixtures_home_team_id_fkey(name, external_id),
        away_team:teams!fixtures_away_team_id_fkey(name, external_id)
      `)
      .eq('status', 'applied')
      .neq('result', 'pending')
      .not('snapshot_home_cap', 'is', null)
      .not('snapshot_away_cap', 'is', null);
    
    if (error) throw error;
    return data || [];
  },

  async markFixtureAsClosed(id: string): Promise<void> {
    const { error } = await supabase
      .from('fixtures')
      .update({ status: 'closed' })
      .eq('id', id);
    
    if (error) throw error;
  },

  async markFixtureAsApplied(id: string): Promise<void> {
    const { error } = await supabase
      .from('fixtures')
      .update({ status: 'applied' })
      .eq('id', id);
    
    if (error) throw error;
  },

  async clearAllFixtures(): Promise<void> {
    // First get all fixture IDs
    const { data: fixtures, error: fetchError } = await supabase
      .from('fixtures')
      .select('id');
    
    if (fetchError) throw fetchError;
    
    if (!fixtures || fixtures.length === 0) {
      logger.info('No fixtures found to delete');
      return;
    }
    
    // Delete each fixture individually
    const fixtureIds = fixtures.map(fixture => fixture.id);
    const { error } = await supabase
      .from('fixtures')
      .delete()
      .in('id', fixtureIds);
    
    if (error) throw error;
    logger.info(`Cleared ${fixtures.length} fixtures from database`);
  },

  async resetFixtureForSimulation(id: string): Promise<void> {
    const { error } = await supabase
      .from('fixtures')
      .update({ 
        status: 'scheduled',
        result: 'pending',
        snapshot_home_cap: null,
        snapshot_away_cap: null
      })
      .eq('id', id);
    
    if (error) throw error;
  },

  async createMockCompletedMatches(): Promise<void> {
    try {
      // Get existing fixtures
      const { data: fixtures, error: fixturesError } = await supabase
        .from('fixtures')
        .select('id, home_team_id, away_team_id, kickoff_at')
        .eq('status', 'scheduled')
        .limit(10);

      if (fixturesError) throw fixturesError;
      if (!fixtures || fixtures.length === 0) throw new Error('No scheduled fixtures found');

      // Create mock results for first 10 fixtures
      const mockResults = [
        { home: 2, away: 1, result: 'home_win' },
        { home: 1, away: 3, result: 'away_win' },
        { home: 0, away: 0, result: 'draw' },
        { home: 3, away: 2, result: 'home_win' },
        { home: 1, away: 1, result: 'draw' },
        { home: 2, away: 0, result: 'home_win' },
        { home: 0, away: 2, result: 'away_win' },
        { home: 4, away: 1, result: 'home_win' },
        { home: 1, away: 2, result: 'away_win' },
        { home: 2, away: 2, result: 'draw' },
      ];

      for (let i = 0; i < Math.min(fixtures.length, mockResults.length); i++) {
        const fixture = fixtures[i];
        const mock = mockResults[i];

        const { error: updateError } = await supabase
          .from('fixtures')
          .update({
            status: 'applied',
            result: mock.result,
            home_score: mock.home,
            away_score: mock.away,
          })
          .eq('id', fixture.id);

        if (updateError) {
          logger.error(`Error updating fixture ${fixture.id}:`, updateError);
        } else {
          logger.info(`✅ Created mock result for fixture ${fixture.id}: ${mock.home}-${mock.away} (${mock.result})`);
        }
      }

      logger.info(`✅ Created ${Math.min(fixtures.length, mockResults.length)} mock completed matches`);
    } catch (error) {
      logger.error('Error creating mock matches:', error);
      throw error;
    }
  }
};


