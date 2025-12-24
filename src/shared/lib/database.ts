/**
 * Re-export database services and utilities
 * All actual service implementations are in ./services/
 */

import { logger } from './logger';
import type { Club, PortfolioItem } from '@/shared/constants/clubs';
import {
  calculateSharePrice,
  calculateProfitLoss,
  calculateLifetimePercentChange
} from './utils/calculations';

// Import types from services
import type { DatabaseTeam } from './services/teams.service';
import type { DatabaseFixture, DatabaseFixtureWithTeams } from './services/fixtures.service';
import type { DatabasePosition } from './services/positions.service';
import type { DatabaseOrder } from './services/orders.service';
import type { DatabaseTransferLedger } from './services/transfers.service';
import type { DatabasePositionWithTeam, DatabaseOrderWithTeam } from '@/shared/types/database.types';

// Import and re-export all services from services module
export { 
  teamsService, 
  fixturesService, 
  positionsService, 
  ordersService, 
  transfersLedgerService 
} from './services';

// Re-export types
export type { 
  DatabaseTeam,
  DatabaseFixture, 
  DatabasePosition, 
  DatabaseOrder,
  DatabaseTransferLedger
};

export type {
  DatabaseFixtureWithTeams,
  DatabasePositionWithTeam,
  DatabaseOrderWithTeam
} from '@/shared/types/database.types';


// Team details cache service for localStorage caching
export const teamDetailsService = {
  async storeTeamDetails(teams: any[]): Promise<void> {
    try {
      const teamDetailsMap = teams.reduce((acc, team) => {
        acc[team.id] = {
          id: team.id,
          name: team.name,
          shortName: team.shortName,
          tla: team.tla,
          crest: team.crest,
          website: team.website,
          founded: team.founded,
          clubColors: team.clubColors,
          venue: team.venue,
          squad: team.squad || [],
          staff: team.staff || [],
          lastUpdated: team.lastUpdated
        };
        return acc;
      }, {} as Record<number, any>);
      
      localStorage.setItem('teamDetailsCache', JSON.stringify(teamDetailsMap));
      localStorage.setItem('teamDetailsCacheTimestamp', Date.now().toString());
      logger.info(`Stored detailed information for ${teams.length} teams`);
    } catch (error) {
      logger.error('Error storing team details:', error);
    }
  },

  async getTeamDetails(externalTeamId: number): Promise<any | null> {
    try {
      const cached = localStorage.getItem('teamDetailsCache');
      const timestamp = localStorage.getItem('teamDetailsCacheTimestamp');
      
      if (!cached || !timestamp) return null;
      
      const cacheAge = Date.now() - parseInt(timestamp);
      if (cacheAge > 24 * 60 * 60 * 1000) {
        localStorage.removeItem('teamDetailsCache');
        localStorage.removeItem('teamDetailsCacheTimestamp');
        return null;
      }
      
      const teamDetailsMap = JSON.parse(cached);
      return teamDetailsMap[externalTeamId] || null;
    } catch (error) {
      logger.error('Error retrieving team details:', error);
      return null;
    }
  },

  async hasValidCache(): Promise<boolean> {
    try {
      const cached = localStorage.getItem('teamDetailsCache');
      const timestamp = localStorage.getItem('teamDetailsCacheTimestamp');
      if (!cached || !timestamp) return false;
      const cacheAge = Date.now() - parseInt(timestamp);
      return cacheAge < 24 * 60 * 60 * 1000;
    } catch {
      return false;
    }
  },

  async clearCache(): Promise<void> {
    localStorage.removeItem('teamDetailsCache');
    localStorage.removeItem('teamDetailsCacheTimestamp');
  }
};

// Type conversion utilities
// Fixed shares model: Price = market_cap / total_shares (1000)
export const convertTeamToClub = (team: DatabaseTeam): Club => {
  // Use total_shares (fixed at 1000) instead of shares_outstanding
  const totalShares = team.total_shares || 1000;
  const launchPrice = team.launch_price;
  
  // Use centralized calculation functions for consistency
  const currentNAV = calculateSharePrice(team.market_cap, totalShares, launchPrice);
  const profitLoss = calculateProfitLoss(currentNAV, launchPrice);
  const percentChange = calculateLifetimePercentChange(currentNAV, launchPrice);
  
  return {
    id: team.id.toString(),
    name: team.name,
    externalId: team.external_id?.toString(),
    launchValue: launchPrice,
    currentValue: currentNAV,
    profitLoss: profitLoss,
    percentChange: percentChange,
    marketCap: team.market_cap,
    sharesOutstanding: team.available_shares || 1000 // Show available_shares instead
  };
};

export const convertPositionToPortfolioItem = (position: DatabasePositionWithTeam): PortfolioItem => {
  // Use total_shares (fixed at 1000) instead of shares_outstanding
  const totalShares = position.team.total_shares || 1000;
  const currentPrice = totalShares > 0 ? 
    position.team.market_cap / totalShares : 20.00;
  const avgCost = position.quantity > 0 ? position.total_invested / position.quantity : 0;
  
  return {
    clubId: position.team_id.toString(),
    clubName: position.team.name,
    units: position.quantity,
    purchasePrice: avgCost,
    currentPrice: currentPrice,
    totalValue: position.quantity * currentPrice,
    profitLoss: (currentPrice - avgCost) * position.quantity
  };
};

