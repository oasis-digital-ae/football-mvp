import React, { createContext, useContext, useState, useEffect } from 'react';
import { Club, Match, PortfolioItem, Transaction, PREMIER_LEAGUE_CLUBS } from '@/shared/constants/clubs';
import { toast } from '@/shared/components/ui/use-toast';
import { teamsService, positionsService, convertTeamToClub } from '@/shared/lib/database';
import { footballApiService } from '@/shared/lib/football-api';
import { supabase } from '@/shared/lib/supabase';
import type { Standing, Scorer, FootballMatch } from '@/shared/lib/football-api';
import { useAuth } from '@/features/auth/contexts/AuthContext';
import { logger } from '@/shared/lib/logger';
import type { DatabasePositionWithTeam, DatabaseOrderWithTeam } from '@/shared/types/database.types';
import { withErrorHandling, DatabaseError, ValidationError, BusinessLogicError, ExternalApiError, AuthenticationError } from '@/shared/lib/error-handling';
import ErrorBoundary from '@/shared/components/ErrorBoundary';
import { teamStateSnapshotService } from '@/shared/lib/team-state-snapshots';
import { buyWindowService } from '@/shared/lib/buy-window.service';
import { matchSchedulerService } from '@/shared/lib/services/match-scheduler.service';

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
  
  // Poll portfolio and market data periodically (realtime not available)
  useEffect(() => {
    if (!user) return;

    // Refresh data periodically to catch updates
    const interval = setInterval(() => {
      loadData();
    }, 10000); // Poll every 10 seconds

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

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
      
      // Debug: Log all positions for this user
      dbPositions.forEach(pos => {
        logger.debug(`Position: Team ${pos.team_id} (${pos.team?.name}), Quantity: ${pos.quantity}, Total Invested: ${pos.total_invested}, Latest: ${pos.is_latest}`);
      });

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
      
      // Load user transactions from orders table
      const convertedTransactions: Transaction[] = [];
      
      // Get individual transactions from orders table (not positions)
      const { data: userOrders, error: ordersError } = await supabase
        .from('orders')
        .select(`
          *,
          team:teams(name)
        `)
        .eq('user_id', user.id)
        .eq('status', 'FILLED')
        .eq('order_type', 'BUY')
        .order('executed_at', { ascending: false });

      if (ordersError) {
        logger.error('Error loading user orders:', ordersError);
        throw ordersError;
      }

      // Convert orders to transactions
      if (userOrders) {
        logger.db('Loading user orders for transactions', { count: userOrders.length });
        userOrders.forEach((order) => {
          convertedTransactions.push({
            id: order.id.toString(),
            clubId: order.team_id.toString(),
            clubName: order.team?.name || 'Unknown',
            units: order.quantity,
            pricePerUnit: order.price_per_share,
            totalValue: order.total_amount,
            date: new Date(order.executed_at || order.created_at).toLocaleDateString()
          });
        });
        logger.db('Converted orders to transactions', { count: convertedTransactions.length });
      }
      
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
      // Start match monitoring service
      // Disabled: match monitoring now handled by database scheduled job
      // matchSchedulerService.start();
    } else {
      setClubs([]);
      setPortfolio([]);
      setTransactions([]);
      setLoading(false);
      // Stop match monitoring service when user logs out
      matchSchedulerService.stop();
    }
    
    // Cleanup on unmount
    return () => {
      matchSchedulerService.stop();
    };
  }, [user]);

  const toggleSidebar = () => {
    setSidebarOpen(prev => !prev);
  };

  const purchaseClub = withErrorHandling(async (clubId: string, units: number) => {
    if (!user) {
      throw new AuthenticationError('You must be logged in to purchase shares');
    }

    // Add a small delay to prevent rapid-fire purchase conflicts
    await new Promise(resolve => setTimeout(resolve, 100));

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
        // Use upsert to handle existing profiles gracefully
        const { data: newProfile, error: createError } = await supabase
          .from('profiles')
          .upsert(
            { 
              id: user.id, 
              username: user.email ?? `user_${user.id.slice(0, 8)}` 
            },
            { 
              onConflict: 'id',
              ignoreDuplicates: false 
            }
          )
          .select('id')
          .single();
        
        if (createError) {
          // If it's a duplicate key error, that's actually fine - profile already exists
          if (createError.code === '23505') {
            profileId = user.id; // Use the user ID directly
          } else {
            throw new DatabaseError('Failed to create user profile');
          }
        } else if (!newProfile) {
          throw new DatabaseError('Failed to create user profile');
        } else {
          profileId = newProfile.id;
        }
      }

      // CRITICAL: Use atomic transaction for purchase
      logger.debug(`Processing atomic purchase: User ${profileId}, Team ${teamIdInt}, Units ${units}, Price ${nav}`);
      
      // Validate buy window before attempting purchase
      try {
        await buyWindowService.validateBuyWindow(teamIdInt);
      } catch (error: any) {
        throw new BusinessLogicError(error.message || 'Trading window is closed');
      }
      
      const { data: result, error: atomicError } = await supabase.rpc(
        'process_share_purchase_atomic',
        {
          p_user_id: profileId,
          p_team_id: teamIdInt,
          p_shares: units,
          p_price_per_share: nav,
          p_total_amount: totalCost
        }
      );

      if (atomicError) {
        logger.error('Atomic purchase failed:', atomicError);
        
        // Parse error message for user-friendly display
        let errorMessage = atomicError.message || 'Purchase failed';
        
        // Handle specific error cases
        if (errorMessage.includes('Insufficient balance')) {
          errorMessage = 'Insufficient wallet balance. Please deposit funds before purchasing.';
        } else if (errorMessage.includes('row-level security')) {
          errorMessage = 'Purchase failed due to security policy. Please try again or contact support.';
        } else if (errorMessage.includes('Price mismatch')) {
          errorMessage = 'Price has changed. Please refresh and try again.';
        } else if (errorMessage.includes('Team not found')) {
          errorMessage = 'Team not found. Please refresh the page.';
        }
        
        throw new DatabaseError(errorMessage);
      }

      if (!result?.success) {
        const errorMsg = result?.error || 'Purchase transaction failed';
        let friendlyMessage = errorMsg;
        
        if (errorMsg.includes('Insufficient balance')) {
          friendlyMessage = 'Insufficient wallet balance. Please deposit funds before purchasing.';
        }
        
        throw new BusinessLogicError(friendlyMessage);
      }

      logger.debug(`Atomic purchase completed successfully:`, result);

      // Refresh data immediately after purchase
      logger.debug('Refreshing data after purchase...');
      await loadData();
      logger.debug('Data refresh completed');
      
      // Trigger wallet balance refresh via custom event (since we can't import hook here)
      // Components that use useAuth will handle the refresh
      window.dispatchEvent(new CustomEvent('wallet-balance-changed'));
      
      toast({
        title: "Purchase Successful",
        description: `Successfully purchased ${units} share(s) of ${team.name} at $${nav.toFixed(2)} per share. Your wallet balance has been updated.`,
        variant: "default",
      });

    } catch (error) {
      logger.error('Error purchasing shares:', error);
      
      // Throw with user-friendly error message
      if (error instanceof BusinessLogicError || error instanceof DatabaseError) {
        throw error; // Already has user-friendly message
      } else if (error instanceof Error) {
        throw new DatabaseError(`Purchase failed: ${error.message}`);
      } else {
        throw new DatabaseError('Purchase failed. Please try again.');
      }
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