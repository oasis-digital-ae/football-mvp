// Teams admin service for team management
import { supabase } from '../supabase';
import { logger } from '../logger';
import { calculateSharePrice, calculateProfitLoss, calculatePercentChange } from '../utils/calculations';
import { fromCents } from '../utils/decimal';

export interface TeamWithMetrics {
  id: number;
  name: string;
  short_name: string;
  external_id: number;
  logo_url?: string;
  market_cap: number;
  share_price: number;
  available_shares: number;
  total_shares: number;
  total_invested: number;
  lifetime_change: number;
  lifetime_change_percent: number;
}

export interface TeamPerformance {
  team_id: number;
  team_name: string;
  market_cap_history: Array<{
    date: string;
    market_cap: number;
    share_price: number;
  }>;
  match_results: Array<{
    fixture_id: number;
    date: string;
    opponent: string;
    result: 'win' | 'loss' | 'draw';
    market_cap_before: number;
    market_cap_after: number;
    change: number;
    change_percent: number;
  }>;
  top_holders: Array<{
    user_id: string;
    username: string;
    quantity: number;
    total_invested: number;
    current_value: number;
  }>;
}

export const teamsAdminService = {
  /**
   * Get all teams with comprehensive metrics
   */
  async getAllTeamsWithMetrics(): Promise<TeamWithMetrics[]> {
    try {
      // Get all teams
      const { data: teams, error: teamsError } = await supabase
        .from('teams')
        .select('*')
        .order('name', { ascending: true });

      if (teamsError) throw teamsError;

      // Get total investments per team
      const { data: positions, error: positionsError } = await supabase
        .from('positions')
        .select('team_id, total_invested')
        .gt('quantity', 0);

      if (positionsError) throw positionsError;

      const teamInvestments = new Map<number, number>();
      // Convert cents to dollars: total_invested is now BIGINT (cents)
      (positions || []).forEach(pos => {
        const current = teamInvestments.get(pos.team_id) || 0;
        teamInvestments.set(pos.team_id, current + fromCents(pos.total_invested || 0).toNumber());
      });

      // Build team metrics
      // Convert cents to dollars: market_cap is now BIGINT (cents)
      const teamsWithMetrics: TeamWithMetrics[] = (teams || []).map(team => {
        const totalShares = team.total_shares || 1000;
        const marketCapDollars = fromCents(team.market_cap || 0).toNumber();
        const launchPriceDollars = fromCents(team.launch_price || 0).toNumber();
        // Use centralized calculation function (same as Portfolio page) - rounds to 2 decimals
        const sharePrice = calculateSharePrice(marketCapDollars, totalShares, launchPriceDollars);
        const totalInvested = teamInvestments.get(team.id) || 0;
        
        // Calculate lifetime change (current price vs launch price) - always meaningful
        const lifetimeChange = calculateProfitLoss(sharePrice, launchPriceDollars);
        const lifetimeChangePercent = calculatePercentChange(sharePrice, launchPriceDollars);

        return {
          id: team.id,
          name: team.name,
          short_name: team.short_name,
          external_id: team.external_id,
          logo_url: team.logo_url,
          market_cap: marketCapDollars,
          share_price: sharePrice,
          available_shares: team.available_shares || 1000,
          total_shares: totalShares,
          total_invested: totalInvested,
          lifetime_change: lifetimeChange,
          lifetime_change_percent: lifetimeChangePercent
        };
      });

      return teamsWithMetrics;
    } catch (error) {
      logger.error('Error fetching teams with metrics:', error);
      throw error;
    }
  },

  /**
   * Update team market cap manually (admin action with audit trail)
   */
  async updateTeamMarketCap(teamId: number, newMarketCap: number, reason: string): Promise<void> {
    try {
      // Get current market cap
      const { data: team, error: teamError } = await supabase
        .from('teams')
        .select('market_cap, name')
        .eq('id', teamId)
        .single();

      if (teamError) throw teamError;
      if (!team) throw new Error('Team not found');

      // Convert cents to dollars: market_cap is stored as BIGINT (cents)
      const oldMarketCapDollars = fromCents(team.market_cap || 0).toNumber();

      // Update market cap - convert dollars to cents (database stores as BIGINT cents)
      const newMarketCapCents = Math.round(newMarketCap * 100);
      const { error: updateError } = await supabase
        .from('teams')
        .update({
          market_cap: newMarketCapCents,
          updated_at: new Date().toISOString()
        })
        .eq('id', teamId);

      if (updateError) throw updateError;

      // Log to audit trail (store values in dollars for readability)
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('audit_log').insert({
          user_id: user.id,
          action: 'admin_market_cap_adjustment',
          table_name: 'teams',
          record_id: teamId,
          new_values: {
            team_name: team.name,
            old_market_cap: oldMarketCapDollars,
            new_market_cap: newMarketCap,
            reason: reason,
            adjusted_by: user.id
          }
        });
      }

      logger.info(`Market cap updated for team ${teamId}: ${oldMarketCapDollars} -> ${newMarketCap}`);
    } catch (error) {
      logger.error('Error updating team market cap:', error);
      throw error;
    }
  },

  /**
   * Get team performance metrics and history
   */
  async getTeamPerformance(teamId: number): Promise<TeamPerformance | null> {
    try {
      // Get team info
      const { data: team, error: teamError } = await supabase
        .from('teams')
        .select('id, name')
        .eq('id', teamId)
        .single();

      if (teamError) throw teamError;
      if (!team) return null;

      // Get market cap history from total_ledger
      const { data: ledgerData, error: ledgerError } = await supabase
        .from('total_ledger')
        .select('*')
        .eq('team_id', teamId)
        .in('ledger_type', ['initial_state', 'match_win', 'match_loss', 'match_draw'])
        .order('event_date', { ascending: true });

      if (ledgerError) throw ledgerError;

      // Get match results
      const { data: fixtures, error: fixturesError } = await supabase
        .from('fixtures')
        .select(`
          id,
          kickoff_at,
          home_team_id,
          away_team_id,
          result,
          home_score,
          away_score,
          home_team:teams!fixtures_home_team_id_fkey(name),
          away_team:teams!fixtures_away_team_id_fkey(name)
        `)
        .or(`home_team_id.eq.${teamId},away_team_id.eq.${teamId}`)
        .eq('status', 'applied')
        .order('kickoff_at', { ascending: false })
        .limit(20);

      if (fixturesError) throw fixturesError;

      // Get top holders
      const { data: positions, error: positionsError } = await supabase
        .from('positions')
        .select(`
          user_id,
          quantity,
          total_invested,
          profiles!inner(username),
          teams!inner(market_cap, total_shares)
        `)
        .eq('team_id', teamId)
        .gt('quantity', 0)
        .order('quantity', { ascending: false })
        .limit(10);

      if (positionsError) throw positionsError;

      // Build market cap history
      // Convert cents to dollars: market_cap values are now BIGINT (cents)
      const marketCapHistory = (ledgerData || []).map(entry => {
        const totalShares = 1000; // Fixed shares
        const marketCapDollars = fromCents(entry.market_cap_after || 0).toNumber();
        const sharePrice = totalShares > 0 ? marketCapDollars / totalShares : 0;
        return {
          date: entry.event_date,
          market_cap: marketCapDollars,
          share_price: sharePrice
        };
      });

      // Build match results
      const matchResults = (fixtures || []).map(fixture => {
        const isHomeTeam = fixture.home_team_id === teamId;
        const opponent = isHomeTeam 
          ? (fixture.away_team as any)?.name || 'Unknown'
          : (fixture.home_team as any)?.name || 'Unknown';
        
        // Get market cap change from ledger
        const ledgerEntry = (ledgerData || []).find(e => 
          e.trigger_event_id === fixture.id && 
          e.trigger_event_type === 'fixture'
        );

        // Convert cents to dollars: market_cap values are now BIGINT (cents)
        const marketCapBefore = ledgerEntry ? fromCents(ledgerEntry.market_cap_before || 0).toNumber() : 0;
        const marketCapAfter = ledgerEntry ? fromCents(ledgerEntry.market_cap_after || 0).toNumber() : 0;
        const change = marketCapAfter - marketCapBefore;
        const changePercent = marketCapBefore > 0 ? (change / marketCapBefore) * 100 : 0;

        let result: 'win' | 'loss' | 'draw' = 'draw';
        if (fixture.result === 'home_win' && isHomeTeam) result = 'win';
        else if (fixture.result === 'away_win' && !isHomeTeam) result = 'win';
        else if (fixture.result === 'home_win' && !isHomeTeam) result = 'loss';
        else if (fixture.result === 'away_win' && isHomeTeam) result = 'loss';

        return {
          fixture_id: fixture.id,
          date: fixture.kickoff_at,
          opponent,
          result,
          market_cap_before: marketCapBefore,
          market_cap_after: marketCapAfter,
          change,
          change_percent: changePercent
        };
      });

      // Build top holders
      // Convert cents to dollars: market_cap and total_invested are now BIGINT (cents)
      const topHolders = (positions || []).map(pos => {
        const team = pos.teams as any;
        const totalShares = team.total_shares || 1000;
        const marketCapDollars = fromCents(team.market_cap || 0).toNumber();
        const sharePrice = totalShares > 0 ? marketCapDollars / totalShares : 0;
        const currentValue = Number(pos.quantity) * sharePrice;

        return {
          user_id: pos.user_id,
          username: (pos.profiles as any)?.username || 'Unknown',
          quantity: Number(pos.quantity),
          total_invested: fromCents(pos.total_invested || 0).toNumber(), // Convert cents to dollars
          current_value: currentValue
        };
      });

      return {
        team_id: teamId,
        team_name: team.name,
        market_cap_history: marketCapHistory,
        match_results: matchResults,
        top_holders: topHolders
      };
    } catch (error) {
      logger.error('Error fetching team performance:', error);
      throw error;
    }
  }
};





