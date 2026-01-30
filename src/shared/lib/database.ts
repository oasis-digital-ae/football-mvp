/**
 * Re-export database services and utilities
 * All actual service implementations are in ./services/
 */

import { logger } from './logger';
import type { Club, PortfolioItem } from '@/shared/constants/clubs';
import {
  calculateSharePrice,
  calculateProfitLoss,
  calculatePercentChange,
  calculateAverageCost,
  calculateTotalValue,
  roundToTwoDecimals
} from './utils/calculations';
import { fromCents } from './utils/decimal';

// Import types from services
import type { DatabaseTeam } from './services/teams.service';
import type { DatabaseFixture, DatabaseFixtureWithTeams } from './services/fixtures.service';
import type { DatabasePosition } from './services/positions.service';
import type { DatabaseOrder } from './services/orders.service';
import type { DatabaseTransferLedger } from './services/transfers.service';
import type { DatabasePositionWithTeam, DatabaseOrderWithTeam } from '@/shared/types/database.types';

// Re-export DatabaseFixtureWithTeams for use in other files
export type { DatabaseFixtureWithTeams };

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
// Database stores values as BIGINT (cents), convert to dollars using fromCents()
export const convertTeamToClub = (team: DatabaseTeam): Club => {
  // Use total_shares (fixed at 1000) instead of shares_outstanding
  const totalShares = team.total_shares || 1000;
  
  // Convert cents to dollars: database stores as BIGINT (cents)
  const marketCapDollars = fromCents(team.market_cap).toNumber();
  const launchPriceDollars = fromCents(team.launch_price).toNumber();
  
  // Use centralized calculation functions (now use Decimal internally)
  const currentNAV = calculateSharePrice(marketCapDollars, totalShares, launchPriceDollars);
  const profitLoss = calculateProfitLoss(currentNAV, launchPriceDollars);
  
  // Calculate percent change directly from market cap to avoid rounding errors
  // Since price = marketCap / totalShares, price % change = marketCap % change
  // Calculate initial market cap from launch price for comparison
  const initialMarketCap = launchPriceDollars * totalShares;
  const percentChange = calculatePercentChange(marketCapDollars, initialMarketCap);
  
  return {
    id: team.id.toString(),
    name: team.name,
    externalId: team.external_id?.toString(),
    launchValue: launchPriceDollars,
    currentValue: currentNAV, // Already rounded to 2 decimals by calculateSharePrice
    profitLoss: profitLoss, // Already rounded to 2 decimals by calculateProfitLoss
    percentChange: percentChange, // Already rounded to 2 decimals by calculatePercentChange
    marketCap: marketCapDollars,
    sharesOutstanding: team.available_shares || 1000 // Show available_shares instead
  };
};

export const convertPositionToPortfolioItem = (position: DatabasePositionWithTeam): PortfolioItem => {
  // Use total_shares (fixed at 1000) instead of shares_outstanding
  const totalShares = position.team.total_shares || 1000;
  
  // Convert cents to dollars: database stores as BIGINT (cents)
  const marketCapDollars = fromCents(position.team.market_cap).toNumber();
  const totalInvestedDollars = fromCents(position.total_invested).toNumber();
  const totalInvestedCents = Number(position.total_invested || 0);
  
  // Use centralized calculation functions (now use Decimal internally)
  const currentPrice = totalShares > 0 ? 
    calculateSharePrice(marketCapDollars, totalShares, 20.00) : 20.00;
  const avgCost = position.quantity > 0 ? 
    calculateAverageCost(totalInvestedDollars, position.quantity) : 0;
  
  // Unrealized P&L only (this helper has no order history for realized)
  const unrealizedPnl = calculateProfitLoss(currentPrice, avgCost) * position.quantity;
  const totalPnl = fromCents(position.total_pnl ?? 0).toNumber();
  const realizedPnl = totalPnl - unrealizedPnl;
  const profitLoss = roundToTwoDecimals(totalPnl);
  const totalValue = calculateTotalValue(currentPrice, position.quantity);
  
  // Calculate purchase market cap (full precision, no rounding)
  const purchaseMarketCapPrecise = marketCapDollars; // Use current market cap as approximation
  
  return {
    clubId: position.team_id.toString(),
    clubName: position.team.name,
    units: position.quantity,
    purchasePrice: avgCost,
    currentPrice,
    totalValue,
    profitLoss,
    unrealizedPnl: roundToTwoDecimals(unrealizedPnl),
    realizedPnl: roundToTwoDecimals(realizedPnl),
    purchaseMarketCapPrecise,
    totalInvestedCents
  };
};

