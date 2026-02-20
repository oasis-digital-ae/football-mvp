// Match Scheduler Service
// Manages automatic periodic checking of matches with smart interval scheduling

import { matchMonitorService } from './match-monitor.service';
import { logger } from '../logger';

class MatchSchedulerService {
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;

  /**
   * Start monitoring with smart intervals
   */
  start(): void {
    if (this.intervalId) {
      logger.debug('Match scheduler already running');
      return; // Already running
    }

    logger.info('🎯 Starting match monitoring service...');
    this.isRunning = true;

    // Run immediately
    this.checkAndUpdate();
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    if (this.intervalId) {
      clearTimeout(this.intervalId);
      this.intervalId = null;
      this.isRunning = false;
      logger.info('🛑 Match monitoring service stopped');
    }
  }

  /**
   * Check if service is running
   */
  isActive(): boolean {
    return this.isRunning;
  }

  /**
   * Check and update matches, then schedule next run
   */
  private async checkAndUpdate(): Promise<void> {
    if (!this.isRunning) return;

    try {
      const fixtures = await matchMonitorService.getMatchesToMonitor();
      const now = new Date();

      let hasLiveMatches = false;
      let nextKickoff: Date | null = null;

      logger.debug(`Checking ${fixtures.length} fixtures for updates...`);

      for (const fixture of fixtures) {        try {
          const kickoffTime = new Date(fixture.kickoff_at);
          const matchEndTime = new Date(kickoffTime.getTime() + 120 * 60 * 1000); // 2 hours
          const buyCloseTime = new Date(kickoffTime.getTime() - 15 * 60 * 1000); // 15 min before

          // Track if any match is currently live
          if (now >= kickoffTime && now <= matchEndTime) {
            hasLiveMatches = true;
          }

          // Track next upcoming kickoff
          if (kickoffTime > now && (!nextKickoff || kickoffTime < nextKickoff)) {
            nextKickoff = kickoffTime;
          }
        } catch (error) {
          logger.error(`Error processing fixture ${fixture.id} in scheduler:`, error);
        }
      }

      // Run monitoring (which handles snapshot capture and live match updates)
      const stats = await matchMonitorService.monitorActiveMatches();

      if (stats.updated > 0 || stats.snapshotsCaptured > 0) {
        logger.info(`📊 Monitor run: ${stats.updated} updated, ${stats.snapshotsCaptured} snapshots captured`);
      }

      // Determine next check interval based on match activity
      let nextInterval: number;

      if (hasLiveMatches) {
        // During live matches: check every 5 minutes
        nextInterval = 5 * 60 * 1000;
      } else if (nextKickoff) {
        const timeToKickoff = nextKickoff.getTime() - now.getTime();
        
        if (timeToKickoff < 60 * 60 * 1000) {
          // Match starting in < 1 hour: check every 10 minutes
          nextInterval = 10 * 60 * 1000;
        } else if (timeToKickoff < 24 * 60 * 60 * 1000) {
          // Match starting in 1-24 hours: check every 30 minutes
          nextInterval = 30 * 60 * 1000;
        } else {
          // Match starting in > 24 hours: check every hour
          nextInterval = 60 * 60 * 1000;
        }
      } else {
        // No matches today: check every hour
        nextInterval = 60 * 60 * 1000;
      }

      this.scheduleNext(nextInterval);

    } catch (error) {
      logger.error('❌ Error in match monitoring scheduler:', error);
      // Retry in 5 minutes on error
      this.scheduleNext(5 * 60 * 1000);
    }
  }

  /**
   * Schedule next check
   */
  private scheduleNext(interval: number = 60 * 60 * 1000): void {
    if (this.intervalId) {
      clearTimeout(this.intervalId);
    }

    this.intervalId = setTimeout(() => {
      this.checkAndUpdate();
    }, interval);

    const minutes = Math.floor(interval / 60000);
    logger.debug(`⏰ Next match monitor check in ${minutes} minutes`);
  }
}

// Export singleton instance
export const matchSchedulerService = new MatchSchedulerService();

