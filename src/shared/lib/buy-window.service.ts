// Buy Window Enforcement Service
// Prevents trading during match periods

import { supabase } from './supabase';
import { logger } from './logger';

export interface BuyWindowStatus {
  isOpen: boolean;
  nextCloseTime?: Date;
  nextKickoffTime?: Date;
  reason?: string;
}

export const buyWindowService = {
  /**
   * Check if buy window is open for a team
   */
  async isBuyWindowOpen(teamId: number): Promise<BuyWindowStatus> {
    const now = new Date();
    
    try {
      // Get upcoming fixtures for this team
      const { data: upcomingFixtures, error } = await supabase
        .from('fixtures')
        .select('buy_close_at, kickoff_at, home_team_id, away_team_id')
        .or(`home_team_id.eq.${teamId},away_team_id.eq.${teamId}`)
        .gte('kickoff_at', now.toISOString())
        .eq('status', 'SCHEDULED')
        .order('kickoff_at', { ascending: true })
        .limit(1);

      if (error) {
        logger.warn('Error checking fixtures for buy window:', error);
        return {
          isOpen: false,
          reason: 'Unable to determine trading status. Trading temporarily disabled.'
        };
      }
      
      if (!upcomingFixtures || upcomingFixtures.length === 0) {
        return {
          isOpen: true,
          reason: 'No upcoming fixtures - trading open'
        };
      }
      
      const nextFixture = upcomingFixtures[0];
      const buyCloseTime = new Date(nextFixture.buy_close_at);
      const kickoffTime = new Date(nextFixture.kickoff_at);
      
      if (now >= buyCloseTime) {
        return {
          isOpen: false,
          nextCloseTime: buyCloseTime,
          nextKickoffTime: kickoffTime,
          reason: `Trading closed. Buy window closed at ${buyCloseTime.toLocaleString()}. Next match starts at ${kickoffTime.toLocaleString()}`
        };
      }
      
      return {
        isOpen: true,
        nextCloseTime: buyCloseTime,
        nextKickoffTime: kickoffTime,
        reason: `Trading open until ${buyCloseTime.toLocaleString()}`
      };
      
    } catch (error) {
      logger.error('Buy window check failed:', error);
      // If we can't determine buy window status, err on the side of caution
      return {
        isOpen: false,
        reason: 'Unable to determine trading status. Trading temporarily disabled.'
      };
    }
  },

  /**
   * Validate buy window before processing order
   */
  async validateBuyWindow(teamId: number): Promise<void> {
    const status = await this.isBuyWindowOpen(teamId);
    
    if (!status.isOpen) {
      throw new Error(`Trading is currently closed: ${status.reason}`);
    }
  },

  /**
   * Get buy window status for display
   */
  async getBuyWindowDisplayInfo(teamId: number): Promise<{
    isOpen: boolean;
    message: string;
    nextAction?: string;
  }> {
    const status = await this.isBuyWindowOpen(teamId);
    
    if (status.isOpen) {
      return {
        isOpen: true,
        message: status.reason || 'Trading is open',
        nextAction: status.nextCloseTime ? `Closes at ${status.nextCloseTime.toLocaleString()}` : undefined
      };
    } else {
      return {
        isOpen: false,
        message: status.reason || 'Trading is closed',
        nextAction: status.nextKickoffTime ? `Next match at ${status.nextKickoffTime.toLocaleString()}` : undefined
      };
    }
  }
};
