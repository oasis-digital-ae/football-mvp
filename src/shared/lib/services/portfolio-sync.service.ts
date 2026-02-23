import { supabase } from '../supabase';
import { logger } from '../logger';
import { usersService } from './users.service';

interface SyncResult {
  success: boolean;
  userId: string;
  portfolioValue: number;
  error?: string;
}

interface BulkSyncResult {
  totalUsers: number;
  successCount: number;
  failureCount: number;
  results: SyncResult[];
}

export const portfolioSyncService = {

  /**
   * Sync portfolio value for ONE user
   * IMPORTANT:
   * Uses getUserList() because THAT is what admin table uses.
   * This guarantees identical values.
   */
  async syncUserPortfolio(
    userId: string,
    silent = false
  ): Promise<SyncResult> {

    const log = silent ? logger.debug : logger.info;

    try {
      log(`[Portfolio Sync] Sync start → ${userId}`);

      // 🔥 USE SAME SOURCE AS ADMIN PANEL
      const users = await usersService.getUserList();

      const user = users.find(u => u.id === userId);

      if (!user) {
        return {
          success: false,
          userId,
          portfolioValue: 0,
          error: 'User not found'
        };
      }

      const portfolioValue = user.portfolio_value;
      const cents = Math.round(portfolioValue * 100);

      log(
        `[Portfolio Sync] Calculated $${portfolioValue.toFixed(
          2
        )} (${cents} cents)`
      );

      // ❗ Let DB trigger handle updated_at
      const { error } = await supabase
        .from('profiles')
        .update({
          portfolio_value: cents
        })
        .eq('id', userId);

      if (error) {
        logger.error(`[Portfolio Sync] Update failed`, error);
        return {
          success: false,
          userId,
          portfolioValue,
          error: error.message
        };
      }

      log(`[Portfolio Sync] ✓ Synced ${userId}`);

      return {
        success: true,
        userId,
        portfolioValue
      };

    } catch (err) {
      logger.error(`[Portfolio Sync] Error`, err);

      return {
        success: false,
        userId,
        portfolioValue: 0,
        error: err instanceof Error ? err.message : 'Unknown error'
      };
    }
  },

  /**
   * Sync multiple users in parallel
   */
  async syncMultipleUsers(
    userIds: string[],
    silent = false
  ): Promise<BulkSyncResult> {

    const results = await Promise.all(
      userIds.map(id => this.syncUserPortfolio(id, silent))
    );

    return {
      totalUsers: userIds.length,
      successCount: results.filter(r => r.success).length,
      failureCount: results.filter(r => !r.success).length,
      results
    };
  },

  /**
   * Sync holders of a team (market cap changed)
   */
  async syncTeamHolders(teamId: number): Promise<BulkSyncResult> {

    const { data, error } = await supabase
      .from('positions')
      .select('user_id')
      .eq('team_id', teamId)
      .gt('quantity', 0);

    if (error) throw error;

    const userIds = [...new Set((data || []).map(p => p.user_id))];

    return this.syncMultipleUsers(userIds);
  },

  /**
   * Full sync (maintenance use only)
   */
  async syncAllUsers(): Promise<BulkSyncResult> {

    const { data, error } = await supabase
      .from('profiles')
      .select('id');

    if (error) throw error;

    const ids = (data || []).map(p => p.id);

    return this.syncMultipleUsers(ids);
  }
};