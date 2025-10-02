// Teams service - handles all team-related database operations
import { supabase } from '../supabase';
import { logger } from '../logger';
import { sanitizeInput } from '../sanitization';

export interface DatabaseTeam {
  id: number;
  name: string;
  short_name: string;
  external_id?: number;
  logo_url?: string;
  launch_price: number;
  initial_market_cap: number;
  market_cap: number;
  shares_outstanding: number;
  is_latest?: boolean;
  created_at: string;
  updated_at: string;
}

export const teamsService = {
  async getAll(): Promise<DatabaseTeam[]> {
    const { data, error } = await supabase
      .from('teams')
      .select('*')
      .order('market_cap', { ascending: false });
    
    if (error) throw error;
    return data || [];
  },

  async getById(id: number): Promise<DatabaseTeam | null> {
    const { data, error } = await supabase
      .from('teams')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error) throw error;
    return data;
  },

  async updateMarketCap(id: number, newMarketCap: number): Promise<void> {
    const { error } = await supabase
      .from('teams')
      .update({ 
        market_cap: newMarketCap,
        updated_at: new Date().toISOString()
      })
      .eq('id', id);
    
    if (error) throw error;
  },

  async updateById(id: number, updates: Partial<DatabaseTeam>): Promise<void> {
    // Sanitize string inputs
    const sanitizedUpdates = { ...updates };
    if (updates.name) {
      sanitizedUpdates.name = sanitizeInput(updates.name, 'team');
    }
    if (updates.short_name) {
      sanitizedUpdates.short_name = sanitizeInput(updates.short_name, 'text');
    }
    if (updates.logo_url) {
      sanitizedUpdates.logo_url = sanitizeInput(updates.logo_url, 'url');
    }

    const { error } = await supabase
      .from('teams')
      .update({ 
        ...sanitizedUpdates,
        updated_at: new Date().toISOString()
      })
      .eq('id', id);
    
    if (error) throw error;
  },

  async create(team: Omit<DatabaseTeam, 'id' | 'created_at' | 'updated_at'>): Promise<DatabaseTeam> {
    // Sanitize inputs
    const sanitizedTeam = {
      ...team,
      name: sanitizeInput(team.name, 'team'),
      short_name: sanitizeInput(team.short_name, 'text'),
      logo_url: team.logo_url ? sanitizeInput(team.logo_url, 'url') : undefined
    };

    const { data, error } = await supabase
      .from('teams')
      .insert({
        ...sanitizedTeam,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },

  async getByExternalId(externalId: string): Promise<DatabaseTeam | null> {
    const { data, error } = await supabase
      .from('teams')
      .select('*')
      .eq('external_id', externalId)
      .maybeSingle();
    
    if (error) throw error;
    return data;
  },

  async captureMarketCapSnapshot(fixtureId: number): Promise<void> {
    const { data: fixture, error: fixtureError } = await supabase
      .from('fixtures')
      .select('home_team_id, away_team_id')
      .eq('id', fixtureId)
      .single();

    if (fixtureError) {
      throw new Error(`Error getting fixture: ${fixtureError.message}`);
    }

    // Get current market caps for both teams
    const { data: teams, error: teamsError } = await supabase
      .from('teams')
      .select('id, market_cap')
      .in('id', [fixture.home_team_id, fixture.away_team_id]);

    if (teamsError) {
      throw new Error(`Error getting teams: ${teamsError.message}`);
    }

    const homeTeam = teams.find(t => t.id === fixture.home_team_id);
    const awayTeam = teams.find(t => t.id === fixture.away_team_id);

    if (!homeTeam || !awayTeam) {
      throw new Error('Could not find teams for fixture');
    }

    // Update fixture with snapshot data
    const { error: updateError } = await supabase
      .from('fixtures')
      .update({
        snapshot_home_cap: homeTeam.market_cap,
        snapshot_away_cap: awayTeam.market_cap
      })
      .eq('id', fixtureId);

    if (updateError) {
      throw new Error(`Error capturing snapshot: ${updateError.message}`);
    }

    logger.debug(`Captured market cap snapshot for fixture ${fixtureId}: Home=${homeTeam.market_cap}, Away=${awayTeam.market_cap}`);
  },

  async resetToCleanState(): Promise<void> {
    // Get all teams
    const { data: teams, error: fetchError } = await supabase
      .from('teams')
      .select('id');
    
    if (fetchError) throw fetchError;
    
    if (!teams || teams.length === 0) {
      logger.info('No teams found to update');
      return;
    }
    
    // Get all user positions to calculate investments per team
    const { data: positions, error: positionsError } = await supabase
      .from('positions')
      .select('team_id, quantity, total_invested')
      .order('created_at', { ascending: false }); // Get latest positions by timestamp
    
    if (positionsError) throw positionsError;
    
    // Calculate investments per team (filter to latest positions only)
    const teamInvestments = new Map<string, { totalInvestment: number; totalShares: number }>();
    const latestPositions = new Map<string, any>();
    
    if (positions) {
      // Filter to get only the latest position per team
      positions.forEach(pos => {
        const teamId = pos.team_id.toString();
        if (!latestPositions.has(teamId)) {
          latestPositions.set(teamId, pos);
        }
      });
      
      // Calculate investments from latest positions only
      latestPositions.forEach(pos => {
        const teamId = pos.team_id;
        const investment = pos.total_invested; // Use total_invested directly
        
        if (teamInvestments.has(teamId)) {
          const existing = teamInvestments.get(teamId)!;
          existing.totalInvestment += investment;
          existing.totalShares += pos.quantity; // Changed from shares to quantity
        } else {
          teamInvestments.set(teamId, {
            totalInvestment: investment,
            totalShares: pos.quantity // Changed from shares to quantity
          });
        }
      });
    }
    
    // Reset each team individually with proper investment calculations
    for (const team of teams) {
      const investments = teamInvestments.get(team.id);
      
      const marketCap = 100 + (investments?.totalInvestment || 0);
      const sharesOutstanding = 5 + (investments?.totalShares || 0);
      
      const { error } = await supabase
        .from('teams')
        .update({ 
          initial_market_cap: 100,
          market_cap: marketCap,
          shares_outstanding: sharesOutstanding,
          updated_at: new Date().toISOString()
        })
        .eq('id', team.id);
      
      if (error) throw error;
    }
    
    logger.info(`Reset ${teams.length} teams to clean state with investments preserved`);
  },

  async clearSnapshotValues(): Promise<void> {
    // Clear all snapshot values from fixtures to force fresh calculations
    // Use a simpler approach - update all fixtures regardless of current values
    const { error } = await supabase
      .from('fixtures')
      .update({ 
        snapshot_home_cap: null,
        snapshot_away_cap: null,
        updated_at: new Date().toISOString()
      });
    
    if (error) throw error;
    logger.info('Cleared all snapshot values from fixtures');
  },

  async forceResetAll(): Promise<void> {
    // FORCE reset all teams to exactly $100 market cap, ignoring investments
    const { data: teams, error: fetchError } = await supabase.from('teams').select('id');
    if (fetchError) throw fetchError;
    if (!teams || teams.length === 0) { 
      logger.info('No teams found to reset'); 
      return; 
    }

    // Reset ALL teams to exactly $100 market cap and 5 shares
    for (const team of teams) {
      const { error } = await supabase
        .from('teams')
        .update({ 
          initial_market_cap: 100,
          market_cap: 100,
          shares_outstanding: 5,
          updated_at: new Date().toISOString()
        })
        .eq('id', team.id);
      
      if (error) throw error;
    }

    // Clear all snapshot values from fixtures
    const { error: snapshotError } = await supabase
      .from('fixtures')
      .update({ 
        snapshot_home_cap: null,
        snapshot_away_cap: null,
        updated_at: new Date().toISOString()
      });
    
    if (snapshotError) throw snapshotError;

    // Clear all transfer ledger entries
    const { error: ledgerError } = await supabase
      .from('transfers_ledger')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all records
    
    if (ledgerError) throw ledgerError;

    logger.info(`Force reset ${teams.length} teams to exactly $100 market cap`);
  },

  async resetMarketCapsOnly(): Promise<void> {
    // Reset only market caps to $100, preserving fixtures and user investments
    const { data: teams, error: fetchError } = await supabase.from('teams').select('id');
    if (fetchError) throw fetchError;
    if (!teams || teams.length === 0) { 
      logger.info('No teams found to reset'); 
      return; 
    }

    // Reset ONLY market caps to $100, keep everything else intact
    for (const team of teams) {
      const { error } = await supabase
        .from('teams')
        .update({ 
          market_cap: 100,
          updated_at: new Date().toISOString()
        })
        .eq('id', team.id);
      
      if (error) throw error;
    }

    logger.info(`Reset market caps for ${teams.length} teams to $100 (fixtures preserved)`);
  },

  async processMatchResult(fixtureId: number): Promise<void> {
    // This function is now deprecated - market cap updates are handled by the fixture trigger
    // Only update fixture result and status, the trigger will handle market cap changes
    const { data: fixture, error: fixtureError } = await supabase
      .from('fixtures')
      .select('*')
      .eq('id', fixtureId)
      .single();

    if (fixtureError) {
      throw new Error(`Error getting fixture: ${fixtureError.message}`);
    }

    if (fixture.result === 'pending') {
      throw new Error('Cannot process match result - result is still pending');
    }

    // The fixture trigger will handle all market cap updates and ledger entries
    logger.info(`Match result processing delegated to fixture trigger for fixture ${fixtureId}`);
  },

  async processBatchMatchResults(fixtures: any[], teamsData?: DatabaseTeam[]): Promise<void> {
    // This function is now deprecated - market cap updates are handled by the fixture trigger
    // The trigger will automatically process all fixture result changes
    logger.info(`Batch match processing delegated to fixture trigger for ${fixtures.length} fixtures`);
  },

  async syncTeamsFromAPI(): Promise<void> {
    logger.info('Syncing teams from Football API...');
    
    try {
      // Get Premier League data to get all team data
      const { footballApiService } = await import('../football-api');
      const premierLeagueData = await footballApiService.getPremierLeagueData(2024);
      const standings = premierLeagueData.standings;
      
      logger.info(`Found ${standings.length} teams in Premier League standings`);
      
      // Process each team from API using upsert approach
      for (const standing of standings) {
        const team = standing.team;
        
        // Normalize team name for matching (remove "FC", "United", etc.)
        const normalizeName = (name: string) => {
          return name
            .replace(/\s+FC$/, '')
            .replace(/\s+United$/, '')
            .replace(/\s+City$/, '')
            .replace(/\s+Town$/, '')
            .replace(/\s+AFC$/, '')
            .trim();
        };
        
        const normalizedApiName = normalizeName(team.name);
        
        // Try to find existing team by normalized name matching
        const { data: existingTeams, error: searchError } = await supabase
          .from('teams')
          .select('*');
        
        if (searchError) {
          logger.warn(`Error searching for teams:`, searchError);
          continue;
        }
        
        // Find matching team by normalized name
        const matchingTeam = existingTeams?.find(existingTeam => {
          const normalizedExistingName = normalizeName(existingTeam.name);
          return normalizedExistingName.toLowerCase() === normalizedApiName.toLowerCase();
        });
        
        if (matchingTeam) {
          // Update existing team with API data
          const { error: updateError } = await supabase
            .from('teams')
            .update({
              external_id: team.id,
              updated_at: new Date().toISOString()
            })
            .eq('id', matchingTeam.id);
          
          if (updateError) {
            logger.warn(`Error updating team ${team.name} (matched to ${matchingTeam.name}):`, updateError);
          } else {
            logger.info(`Updated ${matchingTeam.name} with external_id: ${team.id} (from API: ${team.name})`);
          }
        } else {
          // Create new team if not found
          const { error: insertError } = await supabase
            .from('teams')
            .insert({
              name: team.name,
              external_id: team.id,
              initial_market_cap: 100,
              market_cap: 100,
              shares_outstanding: 5,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            });
          
          if (insertError) {
            logger.warn(`Error creating team ${team.name}:`, insertError);
          } else {
            logger.info(`Created ${team.name} with external_id: ${team.id}`);
          }
        }
      }
      
      logger.info('Team sync completed');
    } catch (error) {
      logger.error('Error syncing teams from API:', error);
      throw error;
    }
  }
};
