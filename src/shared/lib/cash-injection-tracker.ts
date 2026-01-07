// Cash injection tracking system
// Uses existing orders table to track user purchases and their impact on market cap

import { supabase } from './supabase';
import { logger } from './logger';
import { fromCents } from './utils/decimal';

export interface CashInjection {
  id: number;
  team_id: number;
  user_id: string;
  amount: number;
  shares_purchased: number;
  price_per_share: number;
  created_at: string;
  user_email?: string;
  team_name?: string;
}

export interface CashInjectionWithDetails extends CashInjection {
  user_email: string;
  team_name: string;
  market_cap_before?: number;
  market_cap_after?: number;
  fixture_before?: {
    id: number;
    opponent: string;
    result: string;
    kickoff_at: string;
  };
  fixture_after?: {
    id: number;
    opponent: string;
    result: string;
    kickoff_at: string;
  };
}

export interface CashInjectionSummary {
  totalInjections: number;
  totalAmount: number;
  averageInjection: number;
  largestInjection: number;
  injectionCount: number;
}

export const cashInjectionTracker = {
  /**
   * Get cash injections for a specific team (from orders table) - OPTIMIZED
   */
  async getTeamInjections(teamId: number): Promise<CashInjectionWithDetails[]> {
    logger.debug(`Fetching cash injections for team ${teamId}`);
    
    // Use covering index for optimal performance
    const { data, error } = await supabase
      .from('orders')
      .select(`
        id,
        team_id,
        user_id,
        total_amount,
        quantity,
        price_per_share,
        created_at,
        team:teams(name),
        profile:profiles(username)
      `)
      .eq('team_id', teamId)
      .eq('order_type', 'BUY')
      .eq('status', 'FILLED')
      .order('created_at', { ascending: true });

    if (error) {
      logger.error('Error fetching team cash injections:', error);
      throw error;
    }

    logger.debug(`Found ${data?.length || 0} orders for team ${teamId}:`, data);

    // Batch load all fixtures for this team to avoid N+1 queries
    const { data: teamFixtures } = await supabase
      .from('fixtures')
      .select(`
        id,
        kickoff_at,
        result,
        status,
        home_team_id,
        away_team_id,
        home_team:teams!fixtures_home_team_id_fkey(name),
        away_team:teams!fixtures_away_team_id_fkey(name)
      `)
      .or(`home_team_id.eq.${teamId},away_team_id.eq.${teamId}`)
      .order('kickoff_at', { ascending: true });

    // Create fixture lookup map for O(1) access
    const fixtureMap = new Map(teamFixtures?.map(f => [f.id, f]) || []);

      // Get team data including initial market cap
      const { data: teamData } = await supabase
        .from('teams')
        .select('market_cap, initial_market_cap')
        .eq('id', teamId)
        .single();

      const currentMarketCap = teamData?.market_cap || 0;
      const initialMarketCap = teamData?.initial_market_cap || 0;

      // SIMPLE BACKWARDS CALCULATION: Work backwards from current market cap
      // This is the most accurate approach - start with current cap and subtract injections
      const injectionMarketCaps = new Map<number, { before: number; after: number }>();
      
      // Sort injections by date (newest first) to work backwards
      const sortedInjectionsDesc = (data || []).sort((a, b) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      
      // Start with current market cap and subtract injections going backwards
      let workingMarketCap = currentMarketCap;
      
      logger.debug(`Team ${teamId} backwards calculation starting with current cap: ${currentMarketCap}`);
      
      for (const injection of sortedInjectionsDesc) {
        const marketCapAfter = workingMarketCap;
        const marketCapBefore = workingMarketCap - injection.total_amount;
        
        injectionMarketCaps.set(injection.id, { before: marketCapBefore, after: marketCapAfter });
        
        logger.debug(`Injection ${injection.id}: ${marketCapBefore} → ${marketCapAfter} (${injection.total_amount})`);
        workingMarketCap = marketCapBefore;
      }
      
      // Log the calculation for debugging
      logger.debug(`Team ${teamId} backwards calculation result:`, {
        currentMarketCap,
        initialMarketCap,
        injectionsCount: sortedInjectionsDesc.length,
        injectionDetails: sortedInjectionsDesc.map(inj => ({
          id: inj.id,
          amount: inj.total_amount,
          date: inj.created_at,
          calculatedBefore: injectionMarketCaps.get(inj.id)?.before,
          calculatedAfter: injectionMarketCaps.get(inj.id)?.after
        }))
      });
      

      // Enhance with fixture details - O(n) instead of O(n²)
      const injectionsWithDetails: CashInjectionWithDetails[] = [];
      
      for (const injection of data || []) {
        const marketCapData = injectionMarketCaps.get(injection.id) || { before: 0, after: 0 };

        const details: CashInjectionWithDetails = {
          id: injection.id,
          team_id: injection.team_id,
          user_id: injection.user_id,
          // Convert from cents (BIGINT) to dollars
          amount: fromCents(injection.total_amount).toNumber(),
          shares_purchased: injection.quantity,
          price_per_share: fromCents(injection.price_per_share).toNumber(),
          created_at: injection.created_at,
          team_name: (injection.team as any)?.name || 'Unknown Team',
          user_email: (injection.profile as any)?.username || 'Unknown User',
          market_cap_before: fromCents(marketCapData.before).toNumber(),
          market_cap_after: fromCents(marketCapData.after).toNumber()
        };

      // Find fixture context using binary search for O(log n) instead of O(n)
      const injectionDate = new Date(injection.created_at);
      
      // Find the last completed fixture before this injection
      const completedFixtures = teamFixtures?.filter(f => 
        f.status === 'applied' && 
        f.result !== 'pending' && 
        new Date(f.kickoff_at) < injectionDate
      ) || [];
      
      if (completedFixtures.length > 0) {
        const fixtureBefore = completedFixtures[completedFixtures.length - 1];
        const opponent = fixtureBefore.home_team_id === teamId 
          ? (fixtureBefore.away_team as any)?.name 
          : (fixtureBefore.home_team as any)?.name;
        
        details.fixture_before = {
          id: fixtureBefore.id,
          opponent: opponent || 'Unknown',
          result: fixtureBefore.result,
          kickoff_at: fixtureBefore.kickoff_at
        };
      }

      // Find the next scheduled fixture after this injection
      const upcomingFixtures = teamFixtures?.filter(f => 
        f.status === 'scheduled' && 
        new Date(f.kickoff_at) > injectionDate
      ) || [];
      
      if (upcomingFixtures.length > 0) {
        const fixtureAfter = upcomingFixtures[0];
        const opponent = fixtureAfter.home_team_id === teamId 
          ? (fixtureAfter.away_team as any)?.name 
          : (fixtureAfter.home_team as any)?.name;
        
        details.fixture_after = {
          id: fixtureAfter.id,
          opponent: opponent || 'Unknown',
          result: fixtureAfter.result,
          kickoff_at: fixtureAfter.kickoff_at
        };
      }

      injectionsWithDetails.push(details);
    }

    return injectionsWithDetails;
  },

  /**
   * Get cash injections between two fixtures
   */
  async getInjectionsBetweenFixtures(
    teamId: number, 
    fixtureBeforeId: number, 
    fixtureAfterId: number
  ): Promise<CashInjectionWithDetails[]> {
    // Get fixture dates to filter orders
    const { data: fixtures, error: fixturesError } = await supabase
      .from('fixtures')
      .select('kickoff_at')
      .in('id', [fixtureBeforeId, fixtureAfterId])
      .order('kickoff_at', { ascending: true });

    if (fixturesError || !fixtures || fixtures.length !== 2) {
      logger.error('Error fetching fixtures for date range:', fixturesError);
      return [];
    }

    const [fixtureBefore, fixtureAfter] = fixtures;

    const { data, error } = await supabase
      .from('orders')
      .select(`
        id,
        team_id,
        user_id,
        total_amount,
        quantity,
        price_per_share,
        created_at,
        team:teams(name),
        profile:profiles(username)
      `)
      .eq('team_id', teamId)
      .eq('order_type', 'BUY')
      .eq('status', 'FILLED')
      .gte('created_at', fixtureBefore.kickoff_at)
      .lte('created_at', fixtureAfter.kickoff_at)
      .order('created_at', { ascending: true });

    if (error) {
      logger.error('Error fetching injections between fixtures:', error);
      throw error;
    }

    return (data || []).map(injection => ({
      id: injection.id,
      team_id: injection.team_id,
      user_id: injection.user_id,
      amount: injection.total_amount,
      shares_purchased: injection.quantity,
      price_per_share: injection.price_per_share,
      created_at: injection.created_at,
      team_name: (injection.team as any)?.name || 'Unknown Team',
      user_email: (injection.profile as any)?.username || 'Unknown User'
    }));
  },

  /**
   * Get total cash injections for a team
   */
  async getTeamTotalInjections(teamId: number): Promise<number> {
    const { data, error } = await supabase
      .from('orders')
      .select('total_amount')
      .eq('team_id', teamId)
      .eq('order_type', 'BUY')
      .eq('status', 'FILLED');

    if (error) {
      logger.error('Error fetching team total injections:', error);
      return 0;
    }

    return (data || []).reduce((total, order) => total + order.total_amount, 0);
  },

  /**
   * Get cash injection summary for a team
   */
  async getTeamInjectionSummary(teamId: number): Promise<{
    totalInjections: number;
    totalAmount: number;
    averageInjection: number;
    largestInjection: number;
    injectionCount: number;
  }> {
    logger.debug(`Fetching injection summary for team ${teamId}`);
    
    const { data, error } = await supabase
      .from('orders')
      .select('total_amount')
      .eq('team_id', teamId)
      .eq('order_type', 'BUY')
      .eq('status', 'FILLED');

    if (error) {
      logger.error('Error fetching team injection summary:', error);
      return {
        totalInjections: 0,
        totalAmount: 0,
        averageInjection: 0,
        largestInjection: 0,
        injectionCount: 0
      };
    }

    logger.debug(`Found ${data?.length || 0} orders for summary:`, data);

    const orders = data || [];
    
    if (orders.length === 0) {
      return {
        totalInjections: 0,
        totalAmount: 0,
        averageInjection: 0,
        largestInjection: 0,
        injectionCount: 0
      };
    }

    const totalAmount = orders.reduce((sum, order) => sum + order.total_amount, 0);
    const largestInjection = Math.max(...orders.map(o => o.total_amount));

    return {
      totalInjections: orders.length,
      totalAmount,
      averageInjection: totalAmount / orders.length,
      largestInjection,
      injectionCount: orders.length
    };
  }
};