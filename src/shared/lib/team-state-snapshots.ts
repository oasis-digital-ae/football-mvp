import { supabase } from './supabase';
import { logger } from './logger';

// =====================================================
// TEAM STATE SNAPSHOT TYPES
// =====================================================

export interface TeamStateSnapshot {
  id: number;
  team_id: number;
  snapshot_type: 'initial' | 'match_result' | 'share_purchase' | 'share_sale' | 'manual';
  trigger_event_id?: number;
  trigger_event_type?: 'fixture' | 'order' | 'manual';
  market_cap: number;
  shares_outstanding: number; // Total shares that exist
  current_share_price: number; // Calculated: market_cap / shares_outstanding
  match_result?: 'win' | 'loss' | 'draw';
  price_impact: number;
  shares_traded: number;
  trade_amount: number;
  created_at: string;
  effective_at: string;
}

export interface TeamStateHistoryPoint {
  effective_at: string;
  market_cap: number;
  current_share_price: number;
  snapshot_type: string;
  price_impact: number;
  shares_traded: number;
  match_result?: string;
}

export interface TeamStateAtTime {
  market_cap: number;
  shares_outstanding: number;
  current_share_price: number;
  snapshot_type: string;
  effective_at: string;
}

// =====================================================
// TEAM STATE SNAPSHOT SERVICE
// =====================================================

export const teamStateSnapshotService = {
  /**
   * Create a snapshot of team state
   */
  async createSnapshot(params: {
    teamId: number;
    snapshotType: 'initial' | 'match_result' | 'share_purchase' | 'share_sale' | 'manual';
    triggerEventId?: number;
    triggerEventType?: 'fixture' | 'order' | 'manual';
    matchResult?: 'win' | 'loss' | 'draw';
    priceImpact?: number;
    sharesTraded?: number;
    tradeAmount?: number;
    effectiveAt?: string; // Custom effective time (defaults to NOW())
  }): Promise<number> {
    try {
      const { data, error } = await supabase.rpc('create_team_snapshot', {
        p_team_id: params.teamId,
        p_snapshot_type: params.snapshotType,
        p_trigger_event_id: params.triggerEventId || null,
        p_trigger_event_type: params.triggerEventType || null,
        p_match_result: params.matchResult || null,
        p_price_impact: params.priceImpact || 0,
        p_shares_traded: params.sharesTraded || 0,
        p_trade_amount: params.tradeAmount || 0,
        p_effective_at: params.effectiveAt || null
      });

      if (error) {
        logger.error('Failed to create team snapshot:', error);
        throw error;
      }

      logger.debug(`Created team snapshot for team ${params.teamId}:`, {
        snapshotType: params.snapshotType,
        triggerEventId: params.triggerEventId,
        priceImpact: params.priceImpact
      });

      return data;
    } catch (error) {
      logger.error('Error creating team snapshot:', error);
      throw error;
    }
  },

  /**
   * Get team state at a specific point in time
   */
  async getTeamStateAtTime(
    teamId: number, 
    atTime: string
  ): Promise<TeamStateAtTime | null> {
    try {
      const { data, error } = await supabase.rpc('get_team_state_at_time', {
        p_team_id: teamId,
        p_at_time: atTime
      });

      if (error) {
        logger.error('Failed to get team state at time:', error);
        throw error;
      }

      return data?.[0] || null;
    } catch (error) {
      logger.error('Error getting team state at time:', error);
      throw error;
    }
  },

  /**
   * Get team state history for graphing/charting
   */
  async getTeamStateHistory(
    teamId: number,
    fromDate?: string,
    toDate?: string
  ): Promise<TeamStateHistoryPoint[]> {
    try {
      const { data, error } = await supabase.rpc('get_team_state_history', {
        p_team_id: teamId,
        p_from_date: fromDate || null,
        p_to_date: toDate || null
      });

      if (error) {
        logger.error('Failed to get team state history:', error);
        throw error;
      }

      return data || [];
    } catch (error) {
      logger.error('Error getting team state history:', error);
      throw error;
    }
  },

  /**
   * Get current state of all teams
   */
  async getCurrentTeamStates(): Promise<TeamStateSnapshot[]> {
    try {
      const { data, error } = await supabase
        .from('current_team_states')
        .select('*')
        .order('team_id');

      if (error) {
        logger.error('Failed to get current team states:', error);
        throw error;
      }

      return data || [];
    } catch (error) {
      logger.error('Error getting current team states:', error);
      throw error;
    }
  },

  /**
   * Get team state snapshots with full details
   */
  async getTeamSnapshots(
    teamId: number,
    limit: number = 50
  ): Promise<TeamStateSnapshot[]> {
    try {
      const { data, error } = await supabase
        .from('team_state_snapshots')
        .select('*')
        .eq('team_id', teamId)
        .order('effective_at', { ascending: false })
        .limit(limit);

      if (error) {
        logger.error('Failed to get team snapshots:', error);
        throw error;
      }

      return data || [];
    } catch (error) {
      logger.error('Error getting team snapshots:', error);
      throw error;
    }
  },

  /**
   * Get share price at a specific time for a team
   */
  async getSharePriceAtTime(
    teamId: number,
    atTime: string
  ): Promise<number | null> {
    try {
      const state = await this.getTeamStateAtTime(teamId, atTime);
      return state?.current_share_price || null;
    } catch (error) {
      logger.error('Error getting share price at time:', error);
      throw error;
    }
  },

  /**
   * Get market cap at a specific time for a team
   */
  async getMarketCapAtTime(
    teamId: number,
    atTime: string
  ): Promise<number | null> {
    try {
      const state = await this.getTeamStateAtTime(teamId, atTime);
      return state?.market_cap || null;
    } catch (error) {
      logger.error('Error getting market cap at time:', error);
      throw error;
    }
  },

  /**
   * Create snapshot for match result
   */
  async createMatchResultSnapshot(params: {
    teamId: number;
    fixtureId: number;
    matchResult: 'win' | 'loss' | 'draw';
    priceImpact: number;
    effectiveAt?: string;
  }): Promise<number> {
    return this.createSnapshot({
      teamId: params.teamId,
      snapshotType: 'match_result',
      triggerEventId: params.fixtureId,
      triggerEventType: 'fixture',
      matchResult: params.matchResult,
      priceImpact: params.priceImpact,
      effectiveAt: params.effectiveAt
    });
  },

  /**
   * Create snapshot for share purchase
   */
  async createSharePurchaseSnapshot(params: {
    teamId: number;
    orderId: number;
    sharesTraded: number;
    tradeAmount: number;
  }): Promise<number> {
    return this.createSnapshot({
      teamId: params.teamId,
      snapshotType: 'share_purchase',
      triggerEventId: params.orderId,
      triggerEventType: 'order',
      sharesTraded: params.sharesTraded,
      tradeAmount: params.tradeAmount
    });
  },

  /**
   * Create snapshot for share sale
   */
  async createShareSaleSnapshot(params: {
    teamId: number;
    orderId: number;
    sharesTraded: number;
    tradeAmount: number;
  }): Promise<number> {
    return this.createSnapshot({
      teamId: params.teamId,
      snapshotType: 'share_sale',
      triggerEventId: params.orderId,
      triggerEventType: 'order',
      sharesTraded: params.sharesTraded,
      tradeAmount: params.tradeAmount
    });
  }
};

// =====================================================
// CHARTING/GRAPHING UTILITIES
// =====================================================

export const chartingUtils = {
  /**
   * Prepare data for market cap chart
   */
  prepareMarketCapChartData(history: TeamStateHistoryPoint[]) {
    return history.map(point => ({
      x: new Date(point.effective_at).getTime(),
      y: point.market_cap,
      type: point.snapshot_type,
      priceImpact: point.price_impact,
      matchResult: point.match_result
    }));
  },

  /**
   * Prepare data for share price chart
   */
  prepareSharePriceChartData(history: TeamStateHistoryPoint[]) {
    return history.map(point => ({
      x: new Date(point.effective_at).getTime(),
      y: point.current_share_price,
      type: point.snapshot_type,
      priceImpact: point.price_impact,
      matchResult: point.match_result
    }));
  },

  /**
   * Get chart configuration for team state history
   */
  getChartConfig(title: string, data: any[], yAxisLabel: string) {
    return {
      title: {
        text: title,
        style: { color: '#ffffff' }
      },
      xAxis: {
        type: 'datetime',
        labels: { style: { color: '#ffffff' } },
        gridLineColor: '#333333'
      },
      yAxis: {
        title: { text: yAxisLabel, style: { color: '#ffffff' } },
        labels: { style: { color: '#ffffff' } },
        gridLineColor: '#333333'
      },
      series: [{
        name: yAxisLabel,
        data: data,
        color: '#3b82f6',
        lineWidth: 2,
        marker: {
          radius: 4,
          states: {
            hover: { radius: 6 }
          }
        }
      }],
      plotOptions: {
        series: {
          point: {
            events: {
              click: function() {
                // Handle point click for details
                console.log('Point clicked:', this);
              }
            }
          }
        }
      },
      tooltip: {
        backgroundColor: '#1f2937',
        borderColor: '#374151',
        style: { color: '#ffffff' },
        formatter: function() {
          const point = this.point;
          return `
            <b>${new Date(point.x).toLocaleString()}</b><br/>
            ${yAxisLabel}: $${point.y.toFixed(2)}<br/>
            Type: ${point.type}<br/>
            ${point.priceImpact ? `Impact: $${point.priceImpact.toFixed(2)}` : ''}
            ${point.matchResult ? `Result: ${point.matchResult}` : ''}
          `;
        }
      },
      chart: {
        backgroundColor: '#111827',
        style: { color: '#ffffff' }
      },
      legend: {
        itemStyle: { color: '#ffffff' }
      }
    };
  }
};
