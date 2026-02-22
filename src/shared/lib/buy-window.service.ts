// Buy Window Enforcement Service
// Prevents trading during match periods

import { supabase } from './supabase';
import { logger } from './logger';
import { footballApiService } from './football-api';

export interface BuyWindowStatus {
  isOpen: boolean;
  nextCloseTime?: Date;
  nextKickoffTime?: Date;
  reason?: string;
}

export const buyWindowService = {
  /**
   * Ensure Date is created from UTC timestamp string
   * If string doesn't have timezone info, treat it as UTC
   */
  parseUTCDate(dateString: string): Date {
    if (!dateString) return new Date();
    // If already has timezone info (Z or +HH:MM or -HH:MM), use as-is
    if (dateString.includes('Z') || dateString.match(/[+-]\d{2}:\d{2}$/)) {
      return new Date(dateString);
    }
    // Otherwise, append Z to force UTC interpretation
    return new Date(dateString + 'Z');
  },

  /**
   * Calculate buy window status synchronously from fixtures data (instant, no DB call)
   * Trusts fixture status 'closed' which is updated from API and handles extra time correctly
   */
  calculateBuyWindowStatus(teamId: number, fixtures: any[]): BuyWindowStatus {
    const now = new Date();
    
    try {
      // FIRST: Check if there's a match currently in progress (LIVE/IN_PLAY)
      // Use result field to determine if match is finished - if result is NOT 'pending', match is over
      const teamFixtures = fixtures.filter(f => f.home_team_id === teamId || f.away_team_id === teamId);
      
      // Find matches that might be live (status 'closed' or 'scheduled' with kickoff passed)
      // But exclude matches with a result (home_win, away_win, draw) - those are finished
      const potentiallyLiveMatch = teamFixtures
        .filter(f => {
          const kickoff = this.parseUTCDate(f.kickoff_at);
          const isPastKickoff = now >= kickoff;
            // Match is potentially live if:
          // 1. Result is 'pending' (match not finished yet)
          // 2. AND status is 'live' (confirmed live from API) OR 'closed' (legacy) OR 'scheduled' with kickoff passed
          // 3. AND status is not 'applied' or 'postponed'
          const hasResult = f.result && f.result !== 'pending';
          return !hasResult && // Match doesn't have a final result yet
                 (f.status === 'live' || f.status === 'closed' || (f.status === 'scheduled' && isPastKickoff)) && 
                 f.status !== 'applied' && 
                 f.status !== 'postponed';
        })
        .sort((a, b) => this.parseUTCDate(b.kickoff_at).getTime() - this.parseUTCDate(a.kickoff_at).getTime())[0];

      if (potentiallyLiveMatch) {
        const matchKickoff = this.parseUTCDate(potentiallyLiveMatch.kickoff_at);
        
        // If status is 'live' or 'closed' (legacy) and result is 'pending', match is definitely live (from API, handles extra time)
        if ((potentiallyLiveMatch.status === 'live' || potentiallyLiveMatch.status === 'closed') && (!potentiallyLiveMatch.result || potentiallyLiveMatch.result === 'pending')) {
          return {
            isOpen: false,
            nextCloseTime: undefined,
            nextKickoffTime: matchKickoff,
            reason: `Trading closed. Match in progress.`
          };
        }
        
        // If status is 'scheduled' but kickoff passed and no result, close temporarily (until status updates)
        // This handles the case where status hasn't been updated from API yet
        if (potentiallyLiveMatch.status === 'scheduled' && now >= matchKickoff && (!potentiallyLiveMatch.result || potentiallyLiveMatch.result === 'pending')) {
          return {
            isOpen: false,
            nextCloseTime: undefined,
            nextKickoffTime: matchKickoff,
            reason: `Trading closed. Match in progress.`
          };
        }
      }

      // SECOND: Check for upcoming fixtures for this team (exclude matches currently in progress)
      const upcomingFixtures = fixtures
        .filter(f => {
          const kickoff = this.parseUTCDate(f.kickoff_at);
          
          // Only include fixtures that are:
          // - For this team
          // - In the future (kickoff hasn't passed)
          // - Scheduled (not closed/live, not already applied/postponed)
          return (f.home_team_id === teamId || f.away_team_id === teamId) &&
                 kickoff > now && // Future matches only
                 f.status === 'scheduled'; // Not live, not finished
        })
        .sort((a, b) => this.parseUTCDate(a.kickoff_at).getTime() - this.parseUTCDate(b.kickoff_at).getTime());

      if (!upcomingFixtures || upcomingFixtures.length === 0) {
        return {
          isOpen: true,
          reason: 'No upcoming fixtures - trading open'
        };
      }

      const nextFixture = upcomingFixtures[0];
      const buyCloseTime = this.parseUTCDate(nextFixture.buy_close_at);
      const kickoffTime = this.parseUTCDate(nextFixture.kickoff_at);

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
      logger.error('Buy window calculation failed:', error);
      // Default to open on error
      return {
        isOpen: true,
        reason: 'Trading is open (status check unavailable)'
      };
    }
  },

  /**
   * Check if buy window is open for a team (async - fetches from DB)
   */
  async isBuyWindowOpen(teamId: number): Promise<BuyWindowStatus> {
    const now = new Date();
    
    try {
      // FIRST: Check if there's a match currently in progress (LIVE/IN_PLAY)
      // Only check matches with status 'closed' AND result 'pending' (not finished yet)
      const { data: liveMatch, error: liveError } = await supabase
        .from('fixtures')
        .select('kickoff_at, status, result')
        .or(`home_team_id.eq.${teamId},away_team_id.eq.${teamId}`)
        .eq('status', 'closed') // 'closed' = match is LIVE/IN_PLAY
        .or('result.is.null,result.eq.pending') // Only matches without final result
        .order('kickoff_at', { ascending: false })
        .limit(1);

      if (liveError) {
        logger.warn('Error checking live matches for buy window:', liveError);
      }
      
      // If there's a match currently in progress, check result field to determine if match is finished
      // If result is 'home_win', 'away_win', or 'draw', match is finished - trading should be OPEN
      // If result is 'pending' or null, match is still in progress - trading should be CLOSED
      if (liveMatch && liveMatch.length > 0) {
        const match = liveMatch[0];
        const matchKickoff = this.parseUTCDate(match.kickoff_at);
        
        // Check if match has a final result (not 'pending')
        const hasFinalResult = match.result && 
                              match.result !== 'pending' && 
                              (match.result === 'home_win' || match.result === 'away_win' || match.result === 'draw');
          // If match has a final result, it's finished - trading should be OPEN
        if (hasFinalResult) {
          // Match is finished, continue to check upcoming fixtures
        } else if (match.status === 'live' || match.status === 'closed') {
          // Status is 'live' or 'closed' (legacy) and result is still 'pending' - match is live
          return {
            isOpen: false,
            nextCloseTime: undefined,
            nextKickoffTime: matchKickoff,
            reason: `Trading closed. Match in progress.`
          };
        }
      }
      
      // Also check for matches that might be live but status hasn't updated yet
      // Check fixtures where kickoff has passed but status is still 'scheduled' and result is 'pending'
      const { data: potentiallyLiveMatches } = await supabase
        .from('fixtures')
        .select('kickoff_at, status, result, external_id')
        .or(`home_team_id.eq.${teamId},away_team_id.eq.${teamId}`)
        .eq('status', 'scheduled')
        .lte('kickoff_at', now.toISOString())
        .order('kickoff_at', { ascending: false })
        .limit(1);
      
      if (potentiallyLiveMatches && potentiallyLiveMatches.length > 0) {
        const potentialMatch = potentiallyLiveMatches[0];
        
        // Check if match has a final result - if so, it's finished
        const hasFinalResult = potentialMatch.result && 
                              potentialMatch.result !== 'pending' && 
                              (potentialMatch.result === 'home_win' || potentialMatch.result === 'away_win' || potentialMatch.result === 'draw');
        
        if (hasFinalResult) {
          // Match is finished, continue to check upcoming fixtures
        } else if (potentialMatch.external_id) {
          // No final result yet, check API directly for live status
          try {
            const matchData = await footballApiService.getMatchDetails(parseInt(potentialMatch.external_id));
            // Check if match is actually live (LIVE, IN_PLAY, PAUSED) and not finished
            if (matchData.status === 'LIVE' || matchData.status === 'IN_PLAY' || matchData.status === 'PAUSED') {
              return {
                isOpen: false,
                nextCloseTime: undefined,
                nextKickoffTime: this.parseUTCDate(potentialMatch.kickoff_at),
                reason: `Trading closed. Match in progress.`
              };
            }
            // If API says FINISHED, match is over - continue to check upcoming fixtures
          } catch (error) {
            // If API check fails, close trading if kickoff has passed (safer approach)
            logger.warn('Failed to check live match status from API:', error);
            return {
              isOpen: false,
              nextCloseTime: undefined,
              nextKickoffTime: this.parseUTCDate(potentialMatch.kickoff_at),
              reason: `Trading closed. Match in progress.`
            };
          }
        } else {
          // No external_id and no result, close if kickoff has passed (fallback)
          return {
            isOpen: false,
            nextCloseTime: undefined,
            nextKickoffTime: this.parseUTCDate(potentialMatch.kickoff_at),
            reason: `Trading closed. Match in progress.`
          };
        }
      }

      // SECOND: Check for upcoming fixtures for this team
      const { data: upcomingFixtures, error } = await supabase
        .from('fixtures')
        .select('buy_close_at, kickoff_at, home_team_id, away_team_id')
        .or(`home_team_id.eq.${teamId},away_team_id.eq.${teamId}`)
        .gte('kickoff_at', now.toISOString())
        .eq('status', 'scheduled')
        .order('kickoff_at', { ascending: true })
        .limit(1);

      if (error) {
        logger.warn('Error checking fixtures for buy window:', error);
        // On error, default to open (don't block trading) but log the error
        // This prevents showing "temporarily closed" when there's a transient error
        return {
          isOpen: true,
          reason: 'Trading is open (status check unavailable)'
        };
      }
      
      if (!upcomingFixtures || upcomingFixtures.length === 0) {
        return {
          isOpen: true,
          reason: 'No upcoming fixtures - trading open'
        };
      }
      
      const nextFixture = upcomingFixtures[0];
      const buyCloseTime = this.parseUTCDate(nextFixture.buy_close_at);
      const kickoffTime = this.parseUTCDate(nextFixture.kickoff_at);
      
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
      // If we can't determine buy window status, default to open (don't block trading)
      // This prevents showing "temporarily closed" when there's a transient error
      return {
        isOpen: true,
        reason: 'Trading is open (status check unavailable)'
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
   * Get buy window status for display (synchronous - uses fixtures data)
   */
  getBuyWindowDisplayInfoSync(teamId: number, fixtures: any[]): {
    isOpen: boolean;
    message: string;
    nextAction?: string;
    nextCloseTime?: Date;
  } {
    const status = this.calculateBuyWindowStatus(teamId, fixtures);
    
    if (status.isOpen) {
      return {
        isOpen: true,
        message: status.reason || 'Trading is open',
        nextAction: status.nextCloseTime ? `Closes at ${status.nextCloseTime.toLocaleString()}` : undefined,
        nextCloseTime: status.nextCloseTime
      };
    } else {
      // Check if match is in progress (nextCloseTime is undefined but match is live)
      const isMatchInProgress = !status.nextCloseTime && 
                                 status.nextKickoffTime && 
                                 status.reason?.includes('Match in progress');
      
      return {
        isOpen: false,
        message: status.reason || 'Trading is closed',
        nextAction: isMatchInProgress ? 'will reopen after match' : 
                   (status.nextKickoffTime ? `Next match at ${status.nextKickoffTime.toLocaleString()}` : undefined),
        nextCloseTime: status.nextCloseTime
      };
    }
  },

  /**
   * Get buy window status for display (async - fetches from DB)
   */
  async getBuyWindowDisplayInfo(teamId: number): Promise<{
    isOpen: boolean;
    message: string;
    nextAction?: string;
    nextActionTime?: Date; // Add raw Date object for proper timezone handling
  }> {
    const status = await this.isBuyWindowOpen(teamId);
    
    if (status.isOpen) {
      return {
        isOpen: true,
        message: status.reason || 'Trading is open',
        nextAction: status.nextCloseTime ? `Closes at ${status.nextCloseTime.toLocaleString('en-US', { timeZone: 'Asia/Dubai' })}` : undefined,
        nextActionTime: status.nextCloseTime || undefined
      };
    } else {
      // Check if match is in progress (nextCloseTime is undefined but match is live)
      const isMatchInProgress = !status.nextCloseTime && 
                                 status.nextKickoffTime && 
                                 status.reason?.includes('Match in progress');
      
      return {
        isOpen: false,
        message: status.reason || 'Trading is closed',
        nextAction: isMatchInProgress ? 'will reopen after match' : 
                   (status.nextKickoffTime ? `Next match at ${status.nextKickoffTime.toLocaleString('en-US', { timeZone: 'Asia/Dubai' })}` : undefined),
        nextActionTime: status.nextKickoffTime || undefined
      };
    }
  }
};
