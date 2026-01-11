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
  total_pnl?: number; // Total P&L in cents (realized + unrealized) - BIGINT from database
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
    const { data: positionData, error: positionError } = await supabase
      .from('positions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (positionError) {
      console.warn('Error fetching positions:', positionError);
      return [];
    }
    
    if (!positionData || positionData.length === 0) {
      return [];
    }

    // Get team IDs from positions
    const teamIds = positionData.map(p => p.team_id);
    
    // Fetch teams separately to avoid join RLS issues
    const { data: teamData, error: teamError } = await supabase
      .from('teams')
      .select('id, name, market_cap, shares_outstanding')
      .in('id', teamIds);

    if (teamError) {
      console.warn('Error fetching teams:', teamError);
      // Return positions without team data
      return positionData.map(p => ({
        ...p,
        team: { name: 'Unknown', market_cap: 0, shares_outstanding: 0 }
      })) as DatabasePositionWithTeam[];
    }

    // Create team lookup map
    const teamMap = new Map(teamData.map(t => [t.id, t]));

    // Combine data
    return positionData.map(p => ({
      ...p,
      team: teamMap.get(p.team_id) || { name: 'Unknown', market_cap: 0, shares_outstanding: 0 }
    })) as DatabasePositionWithTeam[];
  },

  async getUserPosition(userId: string, teamId: number): Promise<DatabasePositionWithTeam | null> {
    try {
      // Get a specific position for a user and team
      // Try querying positions WITHOUT the teams join first to avoid RLS issues
      const { data: positionData, error: positionError } = await supabase
        .from('positions')
        .select('*')
        .eq('user_id', userId)
        .eq('team_id', teamId)
        .limit(1);

      if (positionError) {
        console.warn('Error fetching position data:', positionError);
        return null;
      }

      if (!positionData || positionData.length === 0) {
        return null;
      }

      // Now fetch team data separately to avoid join RLS issues
      const { data: teamData, error: teamError } = await supabase
        .from('teams')
        .select('name, market_cap, shares_outstanding')
        .eq('id', teamId)
        .single();

      if (teamError) {
        console.warn('Error fetching team data:', teamError);
        // Return position data without team data
        return {
          ...positionData[0],
          team: {
            name: 'Unknown Team',
            market_cap: 0,
            shares_outstanding: 0
          }
        } as DatabasePositionWithTeam;
      }

      // Combine position and team data
      return {
        ...positionData[0],
        team: teamData
      } as DatabasePositionWithTeam;
    } catch (error) {
      // Catch any other errors and return null instead of throwing
      console.warn('Exception in getUserPosition:', error);
      return null;
    }
  },

  async getUserPositionHistory(userId: string, teamId?: number): Promise<DatabasePositionWithTeam[]> {
    // Get all position history for a user (or specific team)
    // Note: With simplified positions table, this will return the same as getUserPositions
    // Complete transaction history is available in the orders table
    let query = supabase
      .from('positions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    
    if (teamId) {
      query = query.eq('team_id', teamId);
    }
    
    const { data: positionData, error: positionError } = await query;
    if (positionError) {
      console.warn('Error fetching position history:', positionError);
      return [];
    }

    if (!positionData || positionData.length === 0) {
      return [];
    }

    // Get unique team IDs
    const teamIds = [...new Set(positionData.map(p => p.team_id))];
    
    // Fetch teams separately
    const { data: teamData, error: teamError } = await supabase
      .from('teams')
      .select('id, name, market_cap, shares_outstanding')
      .in('id', teamIds);

    if (teamError) {
      console.warn('Error fetching teams:', teamError);
      return positionData.map(p => ({
        ...p,
        team: { name: 'Unknown', market_cap: 0, shares_outstanding: 0 }
      })) as DatabasePositionWithTeam[];
    }

    // Create team lookup map
    const teamMap = new Map(teamData.map(t => [t.id, t]));

    // Combine data
    return positionData.map(p => ({
      ...p,
      team: teamMap.get(p.team_id) || { name: 'Unknown', market_cap: 0, shares_outstanding: 0 }
    })) as DatabasePositionWithTeam[];
  },

  async getByUserIdAndTeamId(userId: string, teamId: number): Promise<DatabasePositionWithTeam | null> {
    // Get the position for a specific user and team
    const { data: positionData, error: positionError } = await supabase
      .from('positions')
      .select('*')
      .eq('user_id', userId)
      .eq('team_id', teamId)
      .limit(1);

    if (positionError) {
      if (positionError.code === 'PGRST116') {
        return null;
      }
      console.warn('Error fetching position:', positionError);
      return null;
    }

    if (!positionData || positionData.length === 0) {
      return null;
    }

    // Fetch team data separately
    const { data: teamData, error: teamError } = await supabase
      .from('teams')
      .select('name, market_cap, shares_outstanding')
      .eq('id', teamId)
      .single();

    if (teamError) {
      console.warn('Error fetching team data:', teamError);
      return {
        ...positionData[0],
        team: { name: 'Unknown', market_cap: 0, shares_outstanding: 0 }
      } as DatabasePositionWithTeam;
    }

    return {
      ...positionData[0],
      team: teamData
    } as DatabasePositionWithTeam;
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
    // Ensure UTC parsing - if no timezone info, treat as UTC
    const buyCloseTimeStr = nextFixture.buy_close_at;
    const buyCloseTime = new Date(buyCloseTimeStr.includes('Z') || buyCloseTimeStr.match(/[+-]\d{2}:\d{2}$/) 
      ? buyCloseTimeStr 
      : buyCloseTimeStr + 'Z');
    
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
