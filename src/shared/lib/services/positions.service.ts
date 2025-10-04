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
    // Get all positions for user (now one record per team)
    const { data, error } = await supabase
      .from('positions')
      .select(`
        *,
        team:teams(name, market_cap, shares_outstanding)
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    
    return (data || []) as DatabasePositionWithTeam[];
  },

  async getUserPosition(userId: string, teamId: number): Promise<DatabasePositionWithTeam | null> {
    // Get a specific position for a user and team
    const { data, error } = await supabase
      .from('positions')
      .select(`
        *,
        team:teams(name, market_cap, shares_outstanding)
      `)
      .eq('user_id', userId)
      .eq('team_id', teamId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No rows returned - user has no position in this team
        return null;
      }
      throw error;
    }
    
    return data as DatabasePositionWithTeam;
  },

  async getUserPositionHistory(userId: string, teamId?: number): Promise<DatabasePositionWithTeam[]> {
    // Get all position history for a user (or specific team)
    // Note: With simplified positions table, this will return the same as getUserPositions
    // Complete transaction history is available in the orders table
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
    // Get the position for a specific user and team
    const { data, error } = await supabase
      .from('positions')
      .select(`
        *,
        team:teams(name, market_cap, shares_outstanding)
      `)
      .eq('user_id', userId)
      .eq('team_id', teamId)
      .single();

    if (error) {
      // Handle "no rows" case gracefully
      if (error.code === 'PGRST116') {
        return null; // No position found for this user-team combination
      }
      throw error; // Re-throw other errors
    }
    return data as DatabasePositionWithTeam | null;
  },

  async addPosition(userId: string, teamId: number, quantity: number, pricePerShare: number): Promise<void> {
    // Sanitize inputs
    const sanitizedUserId = sanitizeInput(userId, 'database');
    const sanitizedQuantity = Math.max(0, Math.floor(quantity));
    const sanitizedPricePerShare = Math.max(0, pricePerShare);

    const newPurchaseCost = sanitizedQuantity * sanitizedPricePerShare;

    console.log(`🚀 Starting addPosition: User=${sanitizedUserId}, Team=${teamId}, Qty=${sanitizedQuantity}, Price=${sanitizedPricePerShare}`);

    // Get the current position for this user-team combination
    const { data: currentPositions, error: fetchError } = await supabase
      .from('positions')
      .select('quantity, total_invested, id')
      .eq('user_id', sanitizedUserId)
      .eq('team_id', teamId)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') { // PGRST116 = no rows returned
      console.error('Error fetching current position:', fetchError);
      throw fetchError;
    }

    const currentPosition = currentPositions || null;
    let newQuantity: number;
    let newTotalInvested: number;

    if (currentPosition) {
      // User already has shares - add to existing position
      newQuantity = currentPosition.quantity + sanitizedQuantity;
      newTotalInvested = currentPosition.total_invested + newPurchaseCost;
      
      console.log(`🔄 Updating position: ${currentPosition.quantity} + ${sanitizedQuantity} = ${newQuantity} shares, $${currentPosition.total_invested} + $${newPurchaseCost} = $${newTotalInvested}`);
      console.log(`📍 Current position ID: ${currentPosition.id}`);
      
      // Update the existing position
      const updateData = {
        quantity: newQuantity,
        total_invested: newTotalInvested,
        updated_at: new Date().toISOString()
      };

      const { error: updateError } = await supabase
        .from('positions')
        .update(updateData)
        .eq('id', currentPosition.id);

      if (updateError) {
        console.error('Error updating existing position:', updateError);
        throw updateError;
      }
      
      console.log(`✅ Position updated successfully: ${newQuantity} shares, $${newTotalInvested}`);
      
    } else {
      // First purchase for this team
      newQuantity = sanitizedQuantity;
      newTotalInvested = newPurchaseCost;
      
      console.log(`🆕 First purchase: ${newQuantity} shares, $${newTotalInvested}`);
      
      // Insert new position record
      console.log(`🎯 Inserting new position...`);
      const insertData = {
        user_id: sanitizedUserId,
        team_id: teamId,
        quantity: newQuantity,
        total_invested: newTotalInvested
      };

      const { error: insertError } = await supabase
        .from('positions')
        .insert(insertData);

      if (insertError) {
        console.error('Error inserting new position:', insertError);
        throw insertError;
      }
      
      console.log(`🎯 Position added successfully: ${newQuantity} shares, $${newTotalInvested}`);
    }
    
    console.log(`🏁 addPosition completed successfully!`);
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
