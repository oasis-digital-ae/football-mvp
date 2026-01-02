/**
 * Unified Match Service
 * Consolidates match-processing, match-monitor, and match-scheduler functionality
 */

import { supabase } from '../supabase';
import { fixturesService, teamsService } from '../database';
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

export const matchService = {
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
  async updateFixtureFromAPI(fixtureId: number, externalId: string): Promise<boolean> {
    try {
      const matchData = await footballApiService.getMatchById(externalId);
      
      if (!matchData) {
        logger.warn(`No match data found for external ID: ${externalId}`);
        return false;
      }

      const updateData: any = {
        home_score: matchData.score.home,
        away_score: matchData.score.away,
      };

      // Update status based on match state
      if (matchData.status === 'FINISHED') {
        updateData.status = 'completed';
        updateData.result = this.determineResult(matchData.score.home, matchData.score.away);
      } else if (matchData.status === 'LIVE') {
        updateData.status = 'live';
      }

      const { error } = await supabase
        .from('fixtures')
        .update(updateData)
        .eq('id', fixtureId);

      if (error) {
        logger.error(`Error updating fixture ${fixtureId}:`, error);
        return false;
      }

      logger.debug(`Updated fixture ${fixtureId} from API`);
      return true;
    } catch (error) {
      logger.error(`Error updating fixture from API for ${externalId}:`, error);
      return false;
    }
  },

  /**
   * Capture snapshots for a fixture
   */
  async captureSnapshotsForFixture(fixtureId: number, homeTeamId: number, awayTeamId: number): Promise<void> {
    try {
      // Get current market caps
      const { data: homeTeam } = await supabase
        .from('teams')
        .select('market_cap')
        .eq('id', homeTeamId)
        .single();

      const { data: awayTeam } = await supabase
        .from('teams')
        .select('market_cap')
        .eq('id', awayTeamId)
        .single();

      // Update fixture with snapshots
      await supabase
        .from('fixtures')
        .update({
          snapshot_home_cap: homeTeam?.market_cap || 500000, // $5000.00 in cents (default if missing)
          snapshot_away_cap: awayTeam?.market_cap || 500000, // $5000.00 in cents (default if missing)
        })
        .eq('id', fixtureId);

      logger.debug(`Captured snapshots for fixture ${fixtureId}`);
    } catch (error) {
      logger.error(`Error capturing snapshots for fixture ${fixtureId}:`, error);
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
      errors: 0,
    };

    try {
      const fixtures = await this.getMatchesToMonitor();
      const now = new Date();

      logger.debug(`Monitoring ${fixtures.length} fixtures...`);

      for (const fixture of fixtures) {
        try {
          const kickoffTime = new Date(fixture.kickoff_at);
          const buyCloseTime = new Date(kickoffTime.getTime() - 30 * 60 * 1000);
          const matchEndTime = new Date(kickoffTime.getTime() + 120 * 60 * 1000);

          // Capture snapshots at buy-close time
          if (fixture.status === 'scheduled') {
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
  },

  /**
   * Process all fixtures that need snapshots
   */
  async processKickoffSnapshots(): Promise<void> {
    try {
      logger.info('Processing kickoff snapshots...');
      
      const fixturesNeedingSnapshot = await fixturesService.getFixturesNeedingSnapshot();
      logger.info(`Found ${fixturesNeedingSnapshot.length} fixtures needing snapshots`);
      
      if (!Array.isArray(fixturesNeedingSnapshot)) {
        throw new Error('getFixturesNeedingSnapshot did not return an array');
      }
      
      for (const fixture of fixturesNeedingSnapshot) {
        try {
          await teamsService.captureMarketCapSnapshot(fixture.id);
          await fixturesService.markFixtureAsClosed(fixture.id);
          
          logger.info(`✅ Processed kickoff snapshot for ${fixture.home_team?.name} vs ${fixture.away_team?.name}`);
        } catch (error) {
          logger.error(`❌ Error processing snapshot for fixture ${fixture.id}:`, error);
        }
      }
      
      logger.info(`Kickoff snapshot processing completed: ${fixturesNeedingSnapshot.length} fixtures processed`);
    } catch (error) {
      logger.error('Error processing kickoff snapshots:', error);
      throw error;
    }
  },

  /**
   * Process all finished matches
   */
  async processFinishedMatches(): Promise<void> {
    try {
      logger.info('Processing finished matches...');
      
      const fixturesNeedingProcessing = await fixturesService.getFixturesNeedingProcessing();
      logger.info(`Found ${fixturesNeedingProcessing.length} fixtures needing processing`);
      
      if (!Array.isArray(fixturesNeedingProcessing)) {
        throw new Error('getFixturesNeedingProcessing did not return an array');
      }

      for (const fixture of fixturesNeedingProcessing) {
        try {
          await teamsService.processMatchResult(fixture.id);
          
          logger.info(`✅ Processed match result for ${fixture.home_team?.name} vs ${fixture.away_team?.name}`);
        } catch (error) {
          logger.error(`❌ Error processing match result for fixture ${fixture.id}:`, error);
        }
      }
      
      logger.info(`Finished match processing completed: ${fixturesNeedingProcessing.length} fixtures processed`);
    } catch (error) {
      logger.error('Error processing finished matches:', error);
      throw error;
    }
  },

  /**
   * Helper: Determine match result
   */
  determineResult(homeScore: number, awayScore: number): 'home_win' | 'away_win' | 'draw' {
    if (homeScore > awayScore) return 'home_win';
    if (awayScore > homeScore) return 'away_win';
    return 'draw';
  },
};
