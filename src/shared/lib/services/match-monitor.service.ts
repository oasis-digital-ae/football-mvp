// Match Monitoring Service
// Monitors upcoming and live matches, fetches data from Football API, and updates fixtures

import { supabase } from '../supabase';
import { footballApiService } from '../football-api';
import { logger } from '../logger';

export interface MonitoredFixture {
  id: number;
  external_id: string;
  home_team_id: number;
  away_team_id: number;
  kickoff_at: string;
  status: string;
  result: string;
  home_score: number;
  away_score: number;
}

export const matchMonitorService = {
  /**
   * Get matches that need monitoring (next 48 hours)
   */
  async getMatchesToMonitor(): Promise<MonitoredFixture[]> {
    try {
      const now = new Date();
      const twoDaysLater = new Date(now.getTime() + 48 * 60 * 60 * 1000);
      
      const { data, error } = await supabase
        .from('fixtures')
        .select('id, external_id, home_team_id, away_team_id, kickoff_at, status, result, home_score, away_score')
        .gte('kickoff_at', now.toISOString())
        .lte('kickoff_at', twoDaysLater.toISOString())
        .in('status', ['scheduled', 'closed'])
        .order('kickoff_at', { ascending: true });

      if (error) {
        logger.error('Error fetching matches to monitor:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      logger.error('Error in getMatchesToMonitor:', error);
      return [];
    }
  },

  /**
   * Update a specific fixture from Football API
   */
  async updateFixtureFromAPI(fixtureId: number, externalId: string): Promise<void> {
    try {
      logger.debug(`Updating fixture ${fixtureId} from API...`);

      // Fetch latest data from Football API
      const matchData = await footballApiService.getMatchDetails(parseInt(externalId));
      
      // Convert API status/result
      const newResult = footballApiService.convertMatchStatus(matchData.status, matchData.score);
      const newStatus = footballApiService.convertMatchStatusToFixtureStatus(matchData.status);
      
      // Update fixture in database
      const { error } = await supabase
        .from('fixtures')
        .update({
          result: newResult,
          status: newStatus,
          home_score: matchData.score?.fullTime?.home || 0,
          away_score: matchData.score?.fullTime?.away || 0,
          updated_at: new Date().toISOString()
        })
        .eq('id', fixtureId);
      
      if (error) {
        logger.error(`Error updating fixture ${fixtureId}:`, error);
        throw error;
      }
      
      // Trigger will automatically process market cap if result changed from pending
      logger.info(`✅ Updated fixture ${fixtureId}: ${newStatus} - ${newResult} (${matchData.score?.fullTime?.home}-${matchData.score?.fullTime?.away})`);
      
    } catch (error) {
      logger.error(`❌ Error updating fixture ${fixtureId} from API:`, error);
      throw error;
    }
  },

  /**
   * Capture market cap snapshots at buy-close time
   */
  async captureSnapshotsForFixture(fixtureId: number, homeTeamId: number, awayTeamId: number): Promise<void> {
    try {
      // Get current market caps for both teams
      const { data: teams, error: teamsError } = await supabase
        .from('teams')
        .select('id, market_cap')
        .in('id', [homeTeamId, awayTeamId]);

      if (teamsError || !teams || teams.length !== 2) {
        throw new Error(`Error fetching team data for snapshot: ${teamsError?.message}`);
      }

      const homeTeam = teams.find(t => t.id === homeTeamId);
      const awayTeam = teams.find(t => t.id === awayTeamId);

      if (!homeTeam || !awayTeam) {
        throw new Error(`Missing team data for fixture ${fixtureId}`);
      }

      // Update fixture with snapshot values
      const { error: updateError } = await supabase
        .from('fixtures')
        .update({
          snapshot_home_cap: homeTeam.market_cap,
          snapshot_away_cap: awayTeam.market_cap,
          updated_at: new Date().toISOString()
        })
        .eq('id', fixtureId);

      if (updateError) {
        throw new Error(`Error saving snapshots: ${updateError.message}`);
      }

      logger.info(`📸 Captured snapshots for fixture ${fixtureId}: Home=$${homeTeam.market_cap}, Away=$${awayTeam.market_cap}`);
      
    } catch (error) {
      logger.error(`Error capturing snapshots for fixture ${fixtureId}:`, error);
      throw error;
    }
  },

  /**
   * Monitor all active and upcoming matches
   */
  async monitorActiveMatches(): Promise<{
    updated: number;
    snapshotsCaptured: number;
    errors: number;
  }> {
    const stats = {
      updated: 0,
      snapshotsCaptured: 0,
      errors: 0
    };

    try {
      const fixtures = await this.getMatchesToMonitor();
      const now = new Date();

      logger.debug(`Monitoring ${fixtures.length} fixtures...`);      for (const fixture of fixtures) {
        try {
          const kickoffTime = new Date(fixture.kickoff_at);
          const buyCloseTime = new Date(kickoffTime.getTime() - 15 * 60 * 1000); // 15 min before kickoff
          const matchEndTime = new Date(kickoffTime.getTime() + 120 * 60 * 1000); // 2 hours after kickoff

          // Capture snapshots at buy-close time (within 5-minute window)
          if (fixture.status === 'scheduled' && !fixture.snapshot_home_cap) {
            const timeToBuyClose = buyCloseTime.getTime() - now.getTime();
            if (timeToBuyClose <= 5 * 60 * 1000 && timeToBuyClose >= 0) {
              await this.captureSnapshotsForFixture(fixture.id, fixture.home_team_id, fixture.away_team_id);
              stats.snapshotsCaptured++;
            }
          }

          // Update match data if it's live or recently finished
          if (now >= kickoffTime && now <= matchEndTime) {
            await this.updateFixtureFromAPI(fixture.id, fixture.external_id);
            stats.updated++;
          }
          
        } catch (error) {
          logger.error(`Error processing fixture ${fixture.id}:`, error);
          stats.errors++;
        }
      }

      return stats;
      
    } catch (error) {
      logger.error('Error in monitorActiveMatches:', error);
      return stats;
    }
  }
};

