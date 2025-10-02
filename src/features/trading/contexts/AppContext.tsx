import React, { createContext, useContext, useState, useEffect } from 'react';
import { Club, Match, PortfolioItem, Transaction, PREMIER_LEAGUE_CLUBS } from '@/shared/constants/clubs';
import { toast } from '@/shared/components/ui/use-toast';
import { teamsService, positionsService, ordersService, convertTeamToClub, convertPositionToPortfolioItem } from '@/shared/lib/database';
import { footballApiService } from '@/shared/lib/football-api';
import { supabase } from '@/shared/lib/supabase';
import type { Standing, Scorer, FootballMatch } from '@/shared/lib/football-api';
import { useAuth } from '@/features/auth/contexts/AuthContext';
import { logger } from '@/shared/lib/logger';
import type { DatabasePositionWithTeam, DatabaseOrderWithTeam } from '@/shared/types/database.types';
import { withErrorHandling, DatabaseError, ValidationError, BusinessLogicError, ExternalApiError, AuthenticationError } from '@/shared/lib/error-handling';
import ErrorBoundary from '@/shared/components/ErrorBoundary';
import { teamStateSnapshotService } from '@/shared/lib/team-state-snapshots';

interface AppContextType {
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  clubs: Club[];
  matches: Match[];
  portfolio: PortfolioItem[];
  transactions: Transaction[];
  standings: Standing[];
  topScorers: Scorer[];
  liveMatches: FootballMatch[];
  currentPage: string;
  setCurrentPage: (page: string) => void;
  purchaseClub: (clubId: string, units: number) => Promise<void>;
  simulateMatch: () => void;
  getTransactionsByClub: (clubId: string) => Transaction[];
  loading: boolean;
  refreshData: () => Promise<void>;
  refreshStandings: () => Promise<void>;
  refreshTopScorers: () => Promise<void>;
  refreshLiveMatches: () => Promise<void>;
  user: any; // Add user to context
}

const defaultAppContext: AppContextType = {
  sidebarOpen: false,
  toggleSidebar: () => {},
  clubs: [],
  matches: [],
  portfolio: [],
  transactions: [],
  standings: [],
  topScorers: [],
  liveMatches: [],
  currentPage: 'marketplace',
  setCurrentPage: () => {},
  purchaseClub: async () => {},
  simulateMatch: () => {},
  getTransactionsByClub: () => [],
  loading: true,
  refreshData: async () => {},
  refreshStandings: async () => {},
  refreshTopScorers: async () => {},
  refreshLiveMatches: async () => {},
  user: null
};

const AppContext = createContext<AppContextType>(defaultAppContext);

export { AppContext };
export const useAppContext = () => useContext(AppContext);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <ErrorBoundary>
      <AppProviderInner>{children}</AppProviderInner>
    </ErrorBoundary>
  );
};

const AppProviderInner: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [clubs, setClubs] = useState<Club[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [portfolio, setPortfolio] = useState<PortfolioItem[]>([]);
  const [currentPage, setCurrentPage] = useState('marketplace');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [standings, setStandings] = useState<Standing[]>([]);
  const [topScorers, setTopScorers] = useState<Scorer[]>([]);
  const [liveMatches, setLiveMatches] = useState<FootballMatch[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Load data from database
  const loadData = withErrorHandling(async () => {
    if (!user) return;
    
    try {
      setLoading(true);
      
      // Load teams/clubs
      const dbTeams = await teamsService.getAll();
      logger.db('Loaded teams from database', { count: dbTeams.length });
      
      // Log market cap and shares for first few teams in debug mode
      if (dbTeams.length > 0) {
        logger.debug('Sample team data:', dbTeams[0]);
        dbTeams.slice(0, 3).forEach(team => {
          logger.debug(`Team ${team.name}: Market Cap=$${team.market_cap}, Shares=${team.shares_outstanding}, NAV=$${(team.market_cap / team.shares_outstanding).toFixed(2)}`);
        });
      }
      
      const convertedClubs = dbTeams.map(convertTeamToClub);
      logger.db('Converted teams to clubs', { count: convertedClubs.length });
      setClubs(convertedClubs);
      
      // Load user portfolio from positions table
      const dbPositions = await positionsService.getUserPositions(user.id);
      logger.db('Loaded user positions', { count: dbPositions.length });

      // Convert positions to portfolio items - OPTIMIZED with Map lookup
      const clubMap = new Map(convertedClubs.map(club => [club.id, club]));
      const portfolio = dbPositions.map((position: DatabasePositionWithTeam) => {
        const teamId = position.team_id.toString();
        const teamName = position.team?.name || 'Unknown';
        const team = clubMap.get(teamId); // O(1) lookup instead of O(n) find
        
        // Calculate average cost from total_invested and quantity
        const avgCost = position.quantity > 0 ? position.total_invested / position.quantity : 0;
        
        logger.debug('Portfolio calculation', {
          teamName,
          position: { quantity: position.quantity, totalInvested: position.total_invested, avgCost },
          team: team ? { id: team.id, currentValue: team.currentValue } : 'NOT FOUND',
          teamId
        });
        
        const currentPrice = team ? team.currentValue : 0;
        
        return {
          clubId: teamId,
          clubName: teamName,
          units: position.quantity,
          purchasePrice: avgCost,
          currentPrice,
          totalValue: position.quantity * currentPrice,
          profitLoss: (currentPrice - avgCost) * position.quantity
        };
      });
      
      logger.db('Final portfolio calculated', { count: portfolio.length });
      setPortfolio(portfolio);
      
      // Load user transactions from position history
      const dbPositionHistory = await positionsService.getUserPositionHistory(user.id);
      const convertedTransactions: Transaction[] = [];
      
      // Group positions by team to create transaction history
      const teamPositions = new Map<number, DatabasePositionWithTeam[]>();
      dbPositionHistory.forEach(pos => {
        if (!teamPositions.has(pos.team_id)) {
          teamPositions.set(pos.team_id, []);
        }
        teamPositions.get(pos.team_id)!.push(pos);
      });
      
      // Create transactions from position history
      teamPositions.forEach((positions, teamId) => {
        // Sort by created_at to get chronological order
        const sortedPositions = positions.sort((a, b) => 
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );
        
        let previousQuantity = 0;
        let previousTotalInvested = 0;
        
        sortedPositions.forEach((position, index) => {
          const quantityChange = position.quantity - previousQuantity;
          const totalInvestedChange = position.total_invested - previousTotalInvested;
          
          if (quantityChange > 0) { // Only show purchases (positive quantity changes)
            const avgPrice = totalInvestedChange / quantityChange;
            
            convertedTransactions.push({
              id: `${position.id}-${index}`,
              clubId: position.team_id.toString(),
              clubName: position.team?.name || 'Unknown',
              units: quantityChange,
              pricePerUnit: avgPrice,
              totalValue: totalInvestedChange,
              date: new Date(position.created_at).toLocaleDateString()
            });
          }
          
          previousQuantity = position.quantity;
          previousTotalInvested = position.total_invested;
        });
      });
      
      setTransactions(convertedTransactions);
      
    } catch (error) {
      logger.error('Error loading data:', error);
      throw new DatabaseError('Failed to load application data');
    } finally {
      setLoading(false);
    }
  }, 'loadData');

  // Load data when user changes
  useEffect(() => {
    if (user) {
      loadData();
    } else {
      setClubs([]);
      setPortfolio([]);
      setTransactions([]);
      setLoading(false);
    }
  }, [user]);

  const toggleSidebar = () => {
    setSidebarOpen(prev => !prev);
  };

  const purchaseClub = withErrorHandling(async (clubId: string, units: number) => {
    if (!user) {
      throw new AuthenticationError('You must be logged in to purchase shares');
    }

    // Validate input
    if (!clubId || units <= 0) {
      throw new ValidationError('Invalid club ID or share quantity');
    }

    try {
      // Convert string ID to integer for database operations
      const teamIdInt = parseInt(clubId);
      
      if (isNaN(teamIdInt)) {
        throw new ValidationError('Invalid club ID format');
      }
      
      // Get current team data
      const team = await teamsService.getById(teamIdInt);
      if (!team) {
        throw new BusinessLogicError('Team not found');
      }

      // Calculate proper NAV based on current market cap and shares outstanding
      const currentNAV = team.shares_outstanding > 0 ? 
        team.market_cap / team.shares_outstanding : 
        20.00; // Use $20 as default when no shares outstanding
      
      const nav = currentNAV;
      const totalCost = nav * units;

      // Validate purchase amount
      if (totalCost <= 0) {
        throw new BusinessLogicError('Invalid purchase amount');
      }

      // Get or create profile for the user (using id directly as auth user ID)
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', user.id)
        .single();
      
      if (profileError && profileError.code !== 'PGRST116') { // PGRST116 = no rows returned
        throw new DatabaseError('Failed to get user profile');
      }
      
      let profileId: string;
      if (profile) {
        profileId = profile.id;
      } else {
        // Create new profile (using id directly as auth user ID)
        const { data: newProfile, error: createError } = await supabase
          .from('profiles')
          .insert({ id: user.id, username: user.email ?? null })
          .select('id')
          .single();
        
        if (createError || !newProfile) {
          throw new DatabaseError('Failed to create user profile');
        }
        profileId = newProfile.id;
      }

      // Create order
      const order = await ordersService.createOrder({
        user_id: profileId,
        team_id: teamIdInt,
        order_type: 'BUY',
        quantity: units,
        price_per_share: nav,
        total_amount: totalCost,
        status: 'FILLED'
      });

      // Proper NAV approach: market cap increases by purchase amount, shares increase by units
      const newMarketCap = team.market_cap + totalCost;
      const newSharesOutstanding = team.shares_outstanding + units;

      logger.debug('Purchase update', {
        teamId: teamIdInt,
        teamName: team.name,
        oldMarketCap: team.market_cap,
        oldSharesOutstanding: team.shares_outstanding,
        totalCost,
        units,
        newMarketCap,
        newSharesOutstanding
      });

      try {
        await teamsService.updateById(teamIdInt, {
          market_cap: newMarketCap,
          shares_outstanding: newSharesOutstanding
        });
        logger.debug('Team update completed successfully');
      } catch (updateError) {
        logger.error('Team update failed:', updateError);
        throw new DatabaseError('Failed to update team market cap');
      }

      // Create snapshot for share purchase
      try {
        const snapshotId = await teamStateSnapshotService.createSharePurchaseSnapshot({
          teamId: teamIdInt,
          orderId: order.id,
          sharesTraded: units,
          tradeAmount: totalCost
        });
        logger.debug(`Created snapshot for share purchase: ${units} shares, $${totalCost}, snapshot ID: ${snapshotId}`);
        console.log('✅ Share purchase snapshot created:', {
          teamId: teamIdInt,
          orderId: order.id,
          sharesTraded: units,
          tradeAmount: totalCost,
          snapshotId
        });
      } catch (snapshotError) {
        logger.warn('Failed to create share purchase snapshot:', snapshotError);
        console.error('❌ Failed to create share purchase snapshot:', snapshotError);
        // Don't fail the entire operation if snapshot creation fails
      }

      // Add position using transaction history approach
      await positionsService.addPosition(profileId, teamIdInt, units, nav);

      // Cash injection is automatically tracked via the orders table
      logger.debug(`Purchase completed: ${units} shares of ${team.name} for ${totalCost}, market cap: ${team.market_cap} -> ${newMarketCap}`);

      // Wait a moment for database to sync, then refresh data
      await new Promise(resolve => setTimeout(resolve, 100));
      
      logger.debug('Refreshing data after purchase...');
      await loadData();
      logger.debug('Data refresh completed');

      toast({
        title: "Purchase Successful",
        description: `Bought ${units} share(s) of ${team.name} for $${nav.toFixed(2)} per share`,
      });

    } catch (error) {
      logger.error('Error purchasing shares:', error);
      throw error; // Re-throw to be handled by withErrorHandling
    }
  }, 'purchaseClub');

  const simulateMatch = withErrorHandling(async () => {
    try {
      // Get fixtures that need processing
      const { fixturesService } = await import('@/shared/lib/database');
      const fixtures = await fixturesService.getFixturesNeedingProcessing();
      
      if (fixtures.length === 0) {
        toast({
          title: "No Matches to Process",
          description: "All matches have been processed or no matches are ready for processing.",
        });
        return;
      }
      
      // Process the first batch of fixtures
      const { teamsService } = await import('@/shared/lib/database');
      const teams = await teamsService.getAll();
      
      // Process match results
      await teamsService.processBatchMatchResults(fixtures.slice(0, 5), teams);
      
      // Refresh data to show updated market caps
      await loadData();
      
      toast({
        title: "Match Simulation Complete",
        description: `Processed ${Math.min(fixtures.length, 5)} match results and updated market caps.`,
      });
    } catch (error) {
      logger.error('Error simulating matches:', error);
      throw new BusinessLogicError('Failed to simulate match results');
    }
  }, 'simulateMatch');

  const getTransactionsByClub = (clubId: string): Transaction[] => {
    return transactions.filter(t => t.clubId === clubId).sort((a, b) => 
      new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  };

  const refreshData = async () => {
    await loadData();
  };

  const refreshStandings = withErrorHandling(async () => {
    try {
      const premierLeagueData = await footballApiService.getPremierLeagueData();
      setStandings(premierLeagueData.standings);
    } catch (error) {
      logger.error('Error refreshing standings:', error);
      throw new ExternalApiError('Failed to refresh standings', 'Football API');
    }
  }, 'refreshStandings');

  const refreshTopScorers = withErrorHandling(async () => {
    try {
      const scorersData = await footballApiService.getTopScorers();
      setTopScorers(scorersData);
    } catch (error) {
      logger.error('Error refreshing top scorers:', error);
      throw new ExternalApiError('Failed to refresh top scorers', 'Football API');
    }
  }, 'refreshTopScorers');

  const refreshLiveMatches = withErrorHandling(async () => {
    try {
      // Use mock live matches for testing
      const liveMatchesData = await footballApiService.getMockLiveMatches();
      setLiveMatches(liveMatchesData);
    } catch (error) {
      logger.error('Error refreshing live matches:', error);
      throw new ExternalApiError('Failed to refresh live matches', 'Football API');
    }
  }, 'refreshLiveMatches');

  return (
    <AppContext.Provider
      value={{
        sidebarOpen,
        toggleSidebar,
        clubs,
        matches,
        portfolio,
        transactions,
        standings,
        topScorers,
        liveMatches,
        currentPage,
        setCurrentPage,
        purchaseClub,
        simulateMatch,
        getTransactionsByClub,
        loading,
        refreshData,
        refreshStandings,
        refreshTopScorers,
        refreshLiveMatches,
        user
      }}
    >
      {children}
    </AppContext.Provider>
  );
};