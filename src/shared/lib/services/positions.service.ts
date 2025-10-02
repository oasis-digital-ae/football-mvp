// Positions service - handles all position-related database operations
import { supabase } from '../supabase';
import { logger } from '../logger';
import { sanitizeInput } from '../sanitization';

export interface DatabasePosition {
  id: number;
  user_id: string; // Changed to string (UUID)
  team_id: number;
  quantity: number; // Changed from shares to quantity to match database
  total_invested: number;
  is_latest: boolean;
  created_at: string;
  updated_at: string;
}

export interface DatabasePositionWithTeam extends DatabasePosition {
  team: {
    name: string;
    market_cap: number;
    shares_outstanding: number;
  };
}

export const positionsService = {
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

  async getByUserIdAndTeamId(userId: string, teamId: number): Promise<DatabasePositionWithTeam | null> {
    // Get the latest position for a specific user and team
    const { data, error } = await supabase
      .from('positions')
      .select(`
        *,
        team:teams(name, market_cap, shares_outstanding)
      `)
      .eq('user_id', userId)
      .eq('team_id', teamId)
      .eq('is_latest', true)
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) throw error;
    return (data && data.length > 0) ? data[0] as DatabasePositionWithTeam : null;
  },

  async addPosition(userId: string, teamId: number, quantity: number, pricePerShare: number): Promise<void> {
    // Sanitize inputs
    const sanitizedUserId = sanitizeInput(userId, 'database');
    const sanitizedQuantity = Math.max(0, Math.floor(quantity));
    const sanitizedPricePerShare = Math.max(0, pricePerShare);

    // Get the current latest position for this user-team combination
    const { data: currentPositions, error: fetchError } = await supabase
      .from('positions')
      .select('quantity, total_invested')
      .eq('user_id', sanitizedUserId)
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
      const newPurchaseCost = sanitizedQuantity * sanitizedPricePerShare;
      
      newQuantity = currentPosition.quantity + sanitizedQuantity;
      newTotalInvested = currentPosition.total_invested + newPurchaseCost;
      
      // Mark the current position as not latest
      await supabase
        .from('positions')
        .update({ is_latest: false })
        .eq('user_id', sanitizedUserId)
        .eq('team_id', teamId)
        .eq('is_latest', true);
    } else {
      // First purchase for this team
      newQuantity = sanitizedQuantity;
      newTotalInvested = sanitizedQuantity * sanitizedPricePerShare;
    }

    // Insert new position record with is_latest = true
    const insertData: any = {
      user_id: sanitizedUserId,
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
    
    // Sanitize inputs
    const sanitizedPosition = {
      ...position,
      user_id: sanitizeInput(position.user_id, 'database')
    };
    
    const { error } = await supabase
      .from('positions')
      .upsert(sanitizedPosition, {
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
