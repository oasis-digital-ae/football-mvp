// Teams admin service for team management
import { supabase } from '../supabase';
import { logger } from '../logger';

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
  price_change_24h: number;
  price_change_percent_24h: number;
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
      (positions || []).forEach(pos => {
        const current = teamInvestments.get(pos.team_id) || 0;
        teamInvestments.set(pos.team_id, current + Number(pos.total_invested));
      });

      // Get market cap history for 24h price change calculation
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: ledgerData, error: ledgerError } = await supabase
        .from('total_ledger')
        .select('team_id, market_cap_before, market_cap_after, event_date')
        .gte('event_date', oneDayAgo)
        .in('ledger_type', ['match_win', 'match_loss', 'match_draw']);

      if (ledgerError) throw ledgerError;

      // Calculate 24h price change per team
      const teamPriceChanges = new Map<number, { before: number; after: number }>();
      (ledgerData || []).forEach(entry => {
        const existing = teamPriceChanges.get(entry.team_id);
        if (!existing || new Date(entry.event_date) > new Date(existing.before ? existing.before.toString() : '1970-01-01')) {
          teamPriceChanges.set(entry.team_id, {
            before: Number(entry.market_cap_before),
            after: Number(entry.market_cap_after)
          });
        }
      });

      // Build team metrics
      const teamsWithMetrics: TeamWithMetrics[] = (teams || []).map(team => {
        const totalShares = team.total_shares || 1000;
        const sharePrice = totalShares > 0 ? team.market_cap / totalShares : 0;
        const totalInvested = teamInvestments.get(team.id) || 0;
        
        const priceChange = teamPriceChanges.get(team.id);
        let priceChange24h = 0;
        let priceChangePercent24h = 0;
        
        if (priceChange) {
          const beforePrice = priceChange.before / totalShares;
          const afterPrice = priceChange.after / totalShares;
          priceChange24h = afterPrice - beforePrice;
          priceChangePercent24h = beforePrice > 0 ? (priceChange24h / beforePrice) * 100 : 0;
        }

        return {
          id: team.id,
          name: team.name,
          short_name: team.short_name,
          external_id: team.external_id,
          logo_url: team.logo_url,
          market_cap: Number(team.market_cap),
          share_price: sharePrice,
          available_shares: team.available_shares || 1000,
          total_shares: totalShares,
          total_invested: totalInvested,
          price_change_24h: priceChange24h,
          price_change_percent_24h: priceChangePercent24h
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

      const oldMarketCap = Number(team.market_cap);

      // Update market cap
      const { error: updateError } = await supabase
        .from('teams')
        .update({
          market_cap: newMarketCap,
          updated_at: new Date().toISOString()
        })
        .eq('id', teamId);

      if (updateError) throw updateError;

      // Log to audit trail
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('audit_log').insert({
          user_id: user.id,
          action: 'admin_market_cap_adjustment',
          table_name: 'teams',
          record_id: teamId,
          new_values: {
            team_name: team.name,
            old_market_cap: oldMarketCap,
            new_market_cap: newMarketCap,
            reason: reason,
            adjusted_by: user.id
          }
        });
      }

      logger.info(`Market cap updated for team ${teamId}: ${oldMarketCap} -> ${newMarketCap}`);
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
      const marketCapHistory = (ledgerData || []).map(entry => {
        const totalShares = 1000; // Fixed shares
        const sharePrice = totalShares > 0 ? Number(entry.market_cap_after) / totalShares : 0;
        return {
          date: entry.event_date,
          market_cap: Number(entry.market_cap_after),
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

        const marketCapBefore = ledgerEntry ? Number(ledgerEntry.market_cap_before) : 0;
        const marketCapAfter = ledgerEntry ? Number(ledgerEntry.market_cap_after) : 0;
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
      const topHolders = (positions || []).map(pos => {
        const team = pos.teams as any;
        const totalShares = team.total_shares || 1000;
        const sharePrice = totalShares > 0 ? team.market_cap / totalShares : 0;
        const currentValue = Number(pos.quantity) * sharePrice;

        return {
          user_id: pos.user_id,
          username: (pos.profiles as any)?.username || 'Unknown',
          quantity: Number(pos.quantity),
          total_invested: Number(pos.total_invested),
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



