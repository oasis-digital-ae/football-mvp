// Legacy database service - use individual services from ./services/ instead
// This file is kept for backward compatibility but should be migrated to use the new services

import { supabase } from './supabase';
import type { Club, Match, PortfolioItem, Transaction } from '@/shared/constants/clubs';
import { logger } from './logger';
import type { DatabasePositionWithTeam, DatabaseOrderWithTeam } from '@/shared/types/database.types';
import { teamStateSnapshotService } from './team-state-snapshots';

// Import services for backward compatibility
import { 
  teamsService as importedTeamsService, 
  fixturesService as importedFixturesService, 
  positionsService as importedPositionsService, 
  ordersService as importedOrdersService, 
  transfersLedgerService as importedTransfersLedgerService,
  type DatabaseTeam,
  type DatabaseFixture,
  type DatabasePosition,
  type DatabaseOrder,
  type DatabaseTransferLedger
} from './services';

// Database service layer to replace localStorage usage

// Team details cache service
export const teamDetailsService = {
  // Store detailed team information in localStorage (temporary solution)
  async storeTeamDetails(teams: any[]): Promise<void> {
    try {
      const teamDetailsMap = teams.reduce((acc, team) => {
        acc[team.id] = {
          id: team.id,
          name: team.name,
          shortName: team.shortName,
          tla: team.tla,
          crest: team.crest,
          website: team.website,
          founded: team.founded,
          clubColors: team.clubColors,
          venue: team.venue,
          squad: team.squad || [],
          staff: team.staff || [],
          lastUpdated: team.lastUpdated
        };
        return acc;
      }, {} as Record<number, any>);
      
      localStorage.setItem('teamDetailsCache', JSON.stringify(teamDetailsMap));
      localStorage.setItem('teamDetailsCacheTimestamp', Date.now().toString());
      
      logger.info(`Stored detailed information for ${teams.length} teams`);
    } catch (error) {
      logger.error('Error storing team details:', error);
    }
  },

  // Get detailed team information from cache
  async getTeamDetails(externalTeamId: number): Promise<any | null> {
    try {
      const cached = localStorage.getItem('teamDetailsCache');
      const timestamp = localStorage.getItem('teamDetailsCacheTimestamp');
      
      if (!cached || !timestamp) {
        return null;
      }
      
      // Check if cache is still valid (24 hours)
      const cacheAge = Date.now() - parseInt(timestamp);
      if (cacheAge > 24 * 60 * 60 * 1000) {
        localStorage.removeItem('teamDetailsCache');
        localStorage.removeItem('teamDetailsCacheTimestamp');
        return null;
      }
      
      const teamDetailsMap = JSON.parse(cached);
      return teamDetailsMap[externalTeamId] || null;
    } catch (error) {
      logger.error('Error retrieving team details:', error);
      return null;
    }
  },

  // Check if team details cache exists and is valid
  async hasValidCache(): Promise<boolean> {
    try {
      const cached = localStorage.getItem('teamDetailsCache');
      const timestamp = localStorage.getItem('teamDetailsCacheTimestamp');
      
      if (!cached || !timestamp) {
        return false;
      }
      
      const cacheAge = Date.now() - parseInt(timestamp);
      return cacheAge < 24 * 60 * 60 * 1000; // 24 hours
    } catch (error) {
      return false;
    }
  },

  // Clear team details cache
  async clearCache(): Promise<void> {
    localStorage.removeItem('teamDetailsCache');
    localStorage.removeItem('teamDetailsCacheTimestamp');
  }
};

// Database interfaces are now imported from ./services

// Teams/Clubs operations - Legacy implementation (use importedTeamsService instead)
const legacyTeamsService = {
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
    const { error } = await supabase
      .from('teams')
      .update({ 
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', id);
    
    if (error) throw error;
  },

  async create(team: Omit<DatabaseTeam, 'id' | 'created_at' | 'updated_at'>): Promise<DatabaseTeam> {
    const { data, error } = await supabase
      .from('teams')
      .insert({
        ...team,
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

    console.log(`Captured market cap snapshot for fixture ${fixtureId}: Home=${homeTeam.market_cap}, Away=${awayTeam.market_cap}`);
  },


  async resetToCleanState(): Promise<void> {
    // Get all teams
    const { data: teams, error: fetchError } = await supabase
      .from('teams')
      .select('id');
    
    if (fetchError) throw fetchError;
    
    if (!teams || teams.length === 0) {
      console.log('No teams found to update');
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
    
    console.log(`Reset ${teams.length} teams to clean state with investments preserved`);
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
    console.log('Cleared all snapshot values from fixtures');
  },

  async forceResetAll(): Promise<void> {
    // FORCE reset all teams to exactly $100 market cap, ignoring investments
    const { data: teams, error: fetchError } = await supabase.from('teams').select('id');
    if (fetchError) throw fetchError;
    if (!teams || teams.length === 0) { 
      console.log('No teams found to reset'); 
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

    console.log(`Force reset ${teams.length} teams to exactly $100 market cap`);
  },

  async resetMarketCapsOnly(): Promise<void> {
    // Reset only market caps to $100, preserving fixtures and user investments
    const { data: teams, error: fetchError } = await supabase.from('teams').select('id');
    if (fetchError) throw fetchError;
    if (!teams || teams.length === 0) { 
      console.log('No teams found to reset'); 
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

    console.log(`Reset market caps for ${teams.length} teams to $100 (fixtures preserved)`);
  },

  async processMatchResult(fixtureId: number): Promise<void> {
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

    // Calculate transfer amount (10% of losing team's market cap)
    const transferPercentage = 0.10; // Back to 10% as per your example
    let transferAmount = 0;
    let winnerTeamId = 0;
    let loserTeamId = 0;

    if (fixture.result === 'home_win') {
      winnerTeamId = fixture.home_team_id;
      loserTeamId = fixture.away_team_id;
    } else if (fixture.result === 'away_win') {
      winnerTeamId = fixture.away_team_id;
      loserTeamId = fixture.home_team_id;
    } else if (fixture.result === 'draw') {
      // For draws, no transfer occurs
      console.log(`Draw result for fixture ${fixtureId} - no market cap transfer`);
      return;
    }

    if (winnerTeamId && loserTeamId) {
      // Get current team data (not snapshot values)
      const { data: teams, error: teamsError } = await supabase
        .from('teams')
        .select('id, market_cap')
        .in('id', [winnerTeamId, loserTeamId]);

      if (teamsError) {
        throw new Error(`Error getting teams: ${teamsError.message}`);
      }

      const winnerTeam = teams.find(t => t.id === winnerTeamId);
      const loserTeam = teams.find(t => t.id === loserTeamId);

      if (!winnerTeam || !loserTeam) {
        throw new Error('Winner or loser team not found');
      }

      // Calculate transfer amount based on CURRENT market cap (not snapshot)
      transferAmount = loserTeam.market_cap * transferPercentage;

      // Update market caps using CURRENT values
      const winnerNewCap = winnerTeam.market_cap + transferAmount;
      const loserNewCap = loserTeam.market_cap - transferAmount;

      // Create snapshots for both teams BEFORE market cap changes to capture pre-match state
      try {
        // Create pre-match snapshots for both teams with fixture kickoff time as effective_at
        const winnerSnapshotId = await teamStateSnapshotService.createMatchResultSnapshot({
          teamId: winnerTeamId,
          fixtureId: fixtureId,
          matchResult: 'win',
          priceImpact: transferAmount,
          effectiveAt: fixture.kickoff_at // Use fixture time instead of NOW()
        });

        const loserSnapshotId = await teamStateSnapshotService.createMatchResultSnapshot({
          teamId: loserTeamId,
          fixtureId: fixtureId,
          matchResult: 'loss',
          priceImpact: -transferAmount,
          effectiveAt: fixture.kickoff_at // Use fixture time instead of NOW()
        });

        logger.debug(`Created pre-match snapshots for fixture ${fixtureId} at ${fixture.kickoff_at}: Winner +${transferAmount}, Loser -${transferAmount}`);
        console.log('✅ Snapshots created:', {
          fixtureId,
          kickoffAt: fixture.kickoff_at,
          winnerTeamId,
          loserTeamId,
          transferAmount,
          winnerSnapshotId,
          loserSnapshotId
        });
      } catch (snapshotError) {
        logger.warn('Failed to create pre-match snapshots:', snapshotError);
        // Don't fail the entire operation if snapshot creation fails
      }

      // Update winner team
      const { error: winnerError } = await supabase
        .from('teams')
        .update({ 
          market_cap: winnerNewCap,
          updated_at: new Date().toISOString()
        })
        .eq('id', winnerTeamId);

      if (winnerError) {
        throw new Error(`Error updating winner team: ${winnerError.message}`);
      }

      // Update loser team
      const { error: loserError } = await supabase
        .from('teams')
        .update({ 
          market_cap: loserNewCap,
          updated_at: new Date().toISOString()
        })
        .eq('id', loserTeamId);

      if (loserError) {
        throw new Error(`Error updating loser team: ${loserError.message}`);
      }

      // Record the transfer in the ledger
      const { error: ledgerError } = await supabase
        .from('transfers_ledger')
        .insert({
          fixture_id: fixtureId,
          winner_team_id: winnerTeamId,
          loser_team_id: loserTeamId,
          transfer_amount: transferAmount
        });

      if (ledgerError) {
        throw new Error(`Error recording transfer: ${ledgerError.message}`);
      }

      console.log(`Processed match result for fixture ${fixtureId}: ${transferAmount} transferred from loser to winner`);
    }
  },

  async processBatchMatchResults(fixtures: DatabaseFixture[], teamsData?: DatabaseTeam[]): Promise<void> {
    const transferPercentage = 0.10; // Back to 10% as per your example
    const teamUpdates: { id: number; market_cap: number }[] = [];
    const ledgerInserts: any[] = [];
    
    // OPTIMIZED: Create team lookup map for O(1) access instead of O(n) find
    const teamMap = new Map(teamsData?.map(team => [team.id, team]) || []);
    
    // Process all fixtures in memory first
    for (const fixture of fixtures) {
      if (fixture.result === 'pending') {
        continue;
      }
      
      // Get current market cap values from teamsData (not snapshot values)
      const homeTeam = teamMap.get(fixture.home_team_id); // O(1) lookup instead of O(n) find
      const awayTeam = teamMap.get(fixture.away_team_id); // O(1) lookup instead of O(n) find
      
      if (!homeTeam || !awayTeam) {
        console.warn(`Missing team data for fixture ${fixture.id}`);
        continue;
      }
      
      // DEBUG: Log the market cap values being used for this fixture
      logger.debug(`Fixture ${fixture.id}: ${homeTeam.name} ($${homeTeam.market_cap}) vs ${awayTeam.name} ($${awayTeam.market_cap})`);
      
      let transferAmount = 0;
      let winnerTeamId = 0;
      let loserTeamId = 0;
      let winnerCurrentCap = 0;
      let loserCurrentCap = 0;
      
      if (fixture.result === 'home_win') {
        winnerTeamId = fixture.home_team_id;
        loserTeamId = fixture.away_team_id;
        winnerCurrentCap = homeTeam.market_cap;
        loserCurrentCap = awayTeam.market_cap;
        transferAmount = loserCurrentCap * transferPercentage;
      } else if (fixture.result === 'away_win') {
        winnerTeamId = fixture.away_team_id;
        loserTeamId = fixture.home_team_id;
        winnerCurrentCap = awayTeam.market_cap;
        loserCurrentCap = homeTeam.market_cap;
        transferAmount = loserCurrentCap * transferPercentage;
      }
      
      if (transferAmount > 0) {
        // Calculate new market caps using CURRENT values (not snapshot)
        const winnerNewCap = winnerCurrentCap + transferAmount;
        const loserNewCap = loserCurrentCap - transferAmount;
        
        // Ensure market caps never go negative (enforce constraint)
        const finalLoserCap = Math.max(loserNewCap, 10); // Minimum $10 market cap
        
        // Add to batch updates
        teamUpdates.push({ id: winnerTeamId, market_cap: winnerNewCap });
        teamUpdates.push({ id: loserTeamId, market_cap: finalLoserCap });
        
        // Add to ledger batch
        ledgerInserts.push({
          fixture_id: fixture.id,
          winner_team_id: winnerTeamId,
          loser_team_id: loserTeamId,
          transfer_amount: transferAmount
        });
      }
    }
    
    // Process team updates using simple update approach (no historical records for now)
    if (teamUpdates.length > 0) {
      // Consolidate multiple updates for the same team by accumulating changes
      const consolidatedUpdates = new Map<number, { teamId: number; totalChange: number; baseCap: number }>();
      
      // First pass: collect all changes per team
      teamUpdates.forEach(update => {
        if (consolidatedUpdates.has(update.id)) {
          const existing = consolidatedUpdates.get(update.id)!;
          // Calculate the change from the base cap
          const change = update.market_cap - existing.baseCap;
          existing.totalChange += change;
        } else {
          // Find the base market cap for this team
          const team = teamsData?.find(t => t.id === update.id);
          const baseCap = team ? team.market_cap : update.market_cap;
          const change = update.market_cap - baseCap;
          
          consolidatedUpdates.set(update.id, {
            teamId: update.id,
            totalChange: change,
            baseCap: baseCap
          });
        }
      });
      
      // Convert to final updates with accumulated changes
      const uniqueUpdates = Array.from(consolidatedUpdates.values()).map(update => ({
        id: update.teamId,
        market_cap: update.baseCap + update.totalChange
      }));
      
      // Simple update approach - just update the market_cap field
      logger.debug('Applying market cap updates:', uniqueUpdates);
      
      for (const update of uniqueUpdates) {
        logger.debug(`Updating team ${update.id} market cap to ${update.market_cap}`);
        
        const { error } = await supabase
          .from('teams')
          .update({ 
            market_cap: update.market_cap,
            updated_at: new Date().toISOString()
          })
          .eq('id', update.id);
        
        if (error) {
          logger.error(`Error updating team ${update.id}:`, error);
          throw error;
        }
        
        logger.debug(`Successfully updated team ${update.id}`);
      }
    }
    
    // Batch insert all ledger entries
    if (ledgerInserts.length > 0) {
      try {
        const { error: ledgerError } = await supabase
          .from('transfers_ledger')
          .insert(ledgerInserts);
        
        if (ledgerError) {
          logger.error('Ledger insert error:', ledgerError);
          // Don't throw error for ledger issues, just log them
          logger.warn('Continuing without ledger entries due to error');
        }
      } catch (ledgerError) {
        logger.error('Ledger insert exception:', ledgerError);
        logger.warn('Continuing without ledger entries due to exception');
      }
    }
    
    logger.info(`Batch processed ${fixtures.length} fixtures: ${teamUpdates.length} team updates, ${ledgerInserts.length} transfers`);
  },

  async syncTeamsFromAPI(): Promise<void> {
    logger.info('Syncing teams from Football API...');
    
    try {
      // Get Premier League data to get all team data
      const { footballApiService } = await import('./football-api');
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
          console.warn(`Error searching for teams:`, searchError);
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

// Transfers Ledger operations
const legacyTransfersLedgerService = {
  async getAll(): Promise<DatabaseTransferLedger[]> {
    const { data, error } = await supabase
      .from('transfers_ledger')
      .select('*')
      .order('applied_at', { ascending: false });
    
    if (error) throw error;
    return data || [];
  },

  async getByTeam(teamId: number): Promise<DatabaseTransferLedger[]> {
    const { data, error } = await supabase
      .from('transfers_ledger')
      .select('*')
      .or(`winner_team_id.eq.${teamId},loser_team_id.eq.${teamId}`)
      .order('applied_at', { ascending: false });
    
    if (error) throw error;
    return data || [];
  },

  async getByFixture(fixtureId: number): Promise<DatabaseTransferLedger[]> {
    const { data, error } = await supabase
      .from('transfers_ledger')
      .select('*')
      .eq('fixture_id', fixtureId)
      .order('applied_at', { ascending: false });
    
    if (error) throw error;
    return data || [];
  },

  async getHistorical(): Promise<DatabaseTransferLedger[]> {
    const { data, error } = await supabase
      .from('transfers_ledger')
      .select('*')
      .order('applied_at', { ascending: false });
    
    if (error) throw error;
    return data || [];
  }
};

// Fixtures operations
const legacyFixturesService = {
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
      console.log('No fixtures found to delete');
      return;
    }
    
    // Delete each fixture individually
    const fixtureIds = fixtures.map(fixture => fixture.id);
    const { error } = await supabase
      .from('fixtures')
      .delete()
      .in('id', fixtureIds);
    
    if (error) throw error;
    console.log(`Cleared ${fixtures.length} fixtures from database`);
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
          console.error(`Error updating fixture ${fixture.id}:`, updateError);
        } else {
          console.log(`✅ Created mock result for fixture ${fixture.id}: ${mock.home}-${mock.away} (${mock.result})`);
        }
      }

      console.log(`✅ Created ${Math.min(fixtures.length, mockResults.length)} mock completed matches`);
    } catch (error) {
      console.error('Error creating mock matches:', error);
      throw error;
    }
  }
};

// Orders operations
const legacyOrdersService = {
  async createOrder(order: Omit<DatabaseOrder, 'id' | 'executed_at' | 'created_at' | 'updated_at'>): Promise<DatabaseOrder> {
    // Buy window enforcement disabled for MVP - can be re-enabled later
    logger.debug('Creating order without buy window enforcement (MVP mode)');
    
    // Note: Buy window enforcement can be re-enabled when fixtures are properly synced
    /*
    // Check buy window for this team
    const now = new Date();
    
    try {
      // Check if there are any upcoming fixtures for this team
      const { data: upcomingFixtures, error: fixtureError } = await supabase
        .from('fixtures')
        .select('buy_close_at, kickoff_at, home_team_id, away_team_id')
        .or(`home_team_id.eq.${order.team_id},away_team_id.eq.${order.team_id}`)
        .gte('kickoff_at', now.toISOString())
        .order('kickoff_at', { ascending: true })
        .limit(1);

      if (fixtureError) {
        logger.warn('Error checking fixtures for buy window:', fixtureError);
        // Continue without buy window enforcement if fixtures table has issues
      } else if (upcomingFixtures && upcomingFixtures.length > 0) {
        const nextFixture = upcomingFixtures[0];
        const buyCloseTime = new Date(nextFixture.buy_close_at);
        
        if (now > buyCloseTime) {
          const kickoffTime = new Date(nextFixture.kickoff_at);
          throw new Error(`Trading closed for this team. Buy window closed at ${buyCloseTime.toLocaleString()}. Next match starts at ${kickoffTime.toLocaleString()}`);
        }
      }
    } catch (error) {
      logger.warn('Buy window check failed, allowing trade:', error);
      // Continue with the order if buy window check fails
    }
    */
    
    const { data, error } = await supabase
      .from('orders')
      .insert(order)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },

  async getUserOrders(userId: string): Promise<DatabaseOrderWithTeam[]> {
    const { data, error } = await supabase
      .from('orders')
      .select(`
        *,
        team:teams(name)
      `)
      .eq('user_id', userId)
      .order('executed_at', { ascending: false });
    
    if (error) throw error;
    return (data || []) as DatabaseOrderWithTeam[];
  }
};

// Positions operations
const legacyPositionsService = {
  async getUserPositions(userId: string): Promise<DatabasePositionWithTeam[]> {
    // Get all positions for user (will filter to latest after migration)
    const { data, error } = await supabase
      .from('positions')
      .select(`
        *,
        team:teams(name, market_cap, shares_outstanding)
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    
    // Filter to get only the latest position per team (until is_latest column is added)
    const latestPositions = new Map<number, DatabasePositionWithTeam>();
    (data || []).forEach(position => {
      if (!latestPositions.has(position.team_id)) {
        latestPositions.set(position.team_id, position);
      }
    });
    
    return Array.from(latestPositions.values());
  },

  async getUserPositionHistory(userId: string, teamId?: number): Promise<DatabasePositionWithTeam[]> {
    // Get all position history for a user (or specific team)
    let query = supabase
      .from('positions')
      .select(`
        *,
        team:teams(name, market_cap, shares_outstanding)
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    
    if (teamId) {
      query = query.eq('team_id', teamId);
    }
    
    const { data, error } = await query;
    if (error) throw error;
    return (data || []) as DatabasePositionWithTeam[];
  },

  async addPosition(userId: string, teamId: number, quantity: number, pricePerShare: number): Promise<void> {
    // Get the current latest position for this user-team combination
    const { data: currentPositions, error: fetchError } = await supabase
      .from('positions')
      .select('quantity, total_invested')
      .eq('user_id', userId)
      .eq('team_id', teamId)
      .eq('is_latest', true)
      .order('created_at', { ascending: false })
      .limit(1);

    if (fetchError) {
      throw fetchError;
    }

    const currentPosition = currentPositions?.[0] || null;

    let newQuantity: number;
    let newTotalInvested: number;

    if (currentPosition) {
      // User already has shares - add to existing position
      const newPurchaseCost = quantity * pricePerShare;
      
      newQuantity = currentPosition.quantity + quantity;
      newTotalInvested = currentPosition.total_invested + newPurchaseCost;
      
      // Mark the current position as not latest
      await supabase
        .from('positions')
        .update({ is_latest: false })
        .eq('user_id', userId)
        .eq('team_id', teamId)
        .eq('is_latest', true);
    } else {
      // First purchase for this team
      newQuantity = quantity;
      newTotalInvested = quantity * pricePerShare;
    }

    // Insert new position record with is_latest = true
    const insertData: any = {
      user_id: userId,
      team_id: teamId,
      quantity: newQuantity,
      total_invested: newTotalInvested,
      is_latest: true
    };

    const { error: insertError } = await supabase
      .from('positions')
      .insert(insertData);

    if (insertError) throw insertError;
  },

  async upsertPosition(position: Omit<DatabasePosition, 'id'>): Promise<void> {
    // This method is deprecated - use addPosition instead for transaction history
    logger.warn('upsertPosition is deprecated - use addPosition for transaction history');
    
    const { error } = await supabase
      .from('positions')
      .upsert(position, {
        onConflict: 'user_id,team_id,is_latest'
      });
    
    if (error) throw error;
  },

  async isTeamTradeable(teamId: number): Promise<{ tradeable: boolean; reason?: string; nextFixture?: { kickoff_at: string; buy_close_at: string } }> {
    const now = new Date();
    
    // Check if there are any upcoming fixtures for this team
    const { data: upcomingFixtures, error } = await supabase
      .from('fixtures')
      .select('buy_close_at, kickoff_at, home_team_id, away_team_id')
      .or(`home_team_id.eq.${teamId},away_team_id.eq.${teamId}`)
      .gte('kickoff_at', now.toISOString())
      .order('kickoff_at', { ascending: true })
      .limit(1);

    if (error) {
      throw new Error(`Error checking fixtures: ${error.message}`);
    }

    // If no upcoming fixtures, team is tradeable
    if (!upcomingFixtures || upcomingFixtures.length === 0) {
      return { tradeable: true };
    }

    const nextFixture = upcomingFixtures[0];
    const buyCloseTime = new Date(nextFixture.buy_close_at);
    
    if (now > buyCloseTime) {
      return { 
        tradeable: false, 
        reason: `Trading closed. Buy window closed at ${buyCloseTime.toLocaleString()}`,
        nextFixture: {
          kickoff_at: nextFixture.kickoff_at,
          buy_close_at: nextFixture.buy_close_at
        }
      };
    }

    return { 
      tradeable: true,
      nextFixture: {
        kickoff_at: nextFixture.kickoff_at,
        buy_close_at: nextFixture.buy_close_at
      }
    };
  }
};

// Helper functions to convert between app types and database types
export const convertTeamToClub = (team: DatabaseTeam): Club => {
  // Calculate current NAV based on market cap and shares outstanding
  const currentNAV = team.shares_outstanding > 0 ? 
    team.market_cap / team.shares_outstanding : 
    20.00; // Use $20 as default when no shares outstanding
  
  // Launch price is hardcoded in the database - no calculations needed
  const launchPrice = team.launch_price;
  
  const profitLoss = currentNAV - launchPrice;
  const percentChange = launchPrice > 0 ? ((currentNAV - launchPrice) / launchPrice) * 100 : 0;
  
  return {
    id: team.id.toString(), // Convert integer to string for frontend
    name: team.name,
    externalId: team.external_id?.toString(),
    launchValue: launchPrice, // Hardcoded launch price from database
    currentValue: currentNAV, // Current price calculated from market_cap
    profitLoss: profitLoss,
    percentChange: percentChange,
    marketCap: team.market_cap,
    sharesOutstanding: team.shares_outstanding
  };
};

export const convertPositionToPortfolioItem = (position: DatabasePositionWithTeam): PortfolioItem => {
  // Calculate current price based on team's market cap and total shares outstanding
  const currentPrice = position.team.shares_outstanding > 0 ? 
    position.team.market_cap / position.team.shares_outstanding : 
    20.00; // Fallback to starter NAV
  
  // Calculate average cost from total_invested and quantity
  const avgCost = position.quantity > 0 ? position.total_invested / position.quantity : 0;
  
  return {
    clubId: position.team_id.toString(),
    clubName: position.team.name,
    units: position.quantity, // Changed from shares to quantity
    purchasePrice: avgCost,
    currentPrice: currentPrice,
    totalValue: position.quantity * currentPrice, // Changed from shares to quantity
    profitLoss: (currentPrice - avgCost) * position.quantity // Changed from shares to quantity
  };
};

// Export the imported services for backward compatibility
export const teamsService = importedTeamsService;
export const fixturesService = importedFixturesService;
export const positionsService = importedPositionsService;
export const ordersService = importedOrdersService;
export const transfersLedgerService = importedTransfersLedgerService;

// Export types
export type { DatabaseTeam, DatabaseFixture, DatabasePosition, DatabaseOrder, DatabaseTransferLedger };

