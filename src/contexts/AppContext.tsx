import React, { createContext, useContext, useState, useEffect } from 'react';
import { Club, Match, PortfolioItem, Transaction, generateInitialClubs, PREMIER_LEAGUE_CLUBS } from '@/data/clubs';
import { toast } from '@/components/ui/use-toast';
interface AppContextType {
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  clubs: Club[];
  matches: Match[];
  portfolio: PortfolioItem[];
  transactions: Transaction[];
  currentPage: string;
  setCurrentPage: (page: string) => void;
  purchaseClub: (clubId: string, units: number) => void;
  simulateMatch: () => void;
  getTransactionsByClub: (clubId: string) => Transaction[];
}

const defaultAppContext: AppContextType = {
  sidebarOpen: false,
  toggleSidebar: () => {},
  clubs: [],
  matches: [],
  portfolio: [],
  transactions: [],
  currentPage: 'marketplace',
  setCurrentPage: () => {},
  purchaseClub: () => {},
  simulateMatch: () => {},
  getTransactionsByClub: () => []
};

const AppContext = createContext<AppContextType>(defaultAppContext);

export { AppContext };
export const useAppContext = () => useContext(AppContext);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [clubs, setClubs] = useState<Club[]>(generateInitialClubs());
  const [matches, setMatches] = useState<Match[]>([]);
  const [portfolio, setPortfolio] = useState<PortfolioItem[]>([]);
  const [currentPage, setCurrentPage] = useState('marketplace');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  
  // Load matches from localStorage on component mount
  useEffect(() => {
    const savedMatches = localStorage.getItem('football-matches');
    if (savedMatches) {
      try {
        setMatches(JSON.parse(savedMatches));
      } catch (error) {
        console.error('Error loading matches from localStorage:', error);
      }
    }
  }, []);

  // Save matches to localStorage whenever matches change
  useEffect(() => {
    if (matches.length > 0) {
      localStorage.setItem('football-matches', JSON.stringify(matches));
    }
  }, [matches]);

  const toggleSidebar = () => {
    setSidebarOpen(prev => !prev);
  };

  const purchaseClub = (clubId: string, units: number) => {
    const club = clubs.find(c => c.id === clubId);
    if (!club) return;

    // Get the actual current market price from match history
    const getLatestClubValue = (clubName: string, launchValue: number): number => {
      const clubMatches = matches.filter(match => 
        match.homeTeam === clubName || match.awayTeam === clubName
      );
      
      if (clubMatches.length === 0) {
        return launchValue;
      }
      
      const latestMatch = clubMatches[0];
      return latestMatch.homeTeam === clubName ? latestMatch.homeEndValue : latestMatch.awayEndValue;
    };

    const actualCurrentPrice = getLatestClubValue(club.name, 20);

    // Update or create portfolio holding
    const existingItem = portfolio.find(p => p.clubId === clubId);
    
    if (existingItem) {
      const newUnits = existingItem.units + units;
      const newTotalCost = (existingItem.purchasePrice * existingItem.units) + (actualCurrentPrice * units);
      const newAvgPrice = newTotalCost / newUnits;
      
      // Update local state
      setPortfolio(prev => prev.map(p => 
        p.clubId === clubId 
          ? {
              ...p,
              units: newUnits,
              purchasePrice: newAvgPrice,
              totalValue: newUnits * actualCurrentPrice,
              profitLoss: (actualCurrentPrice - newAvgPrice) * newUnits
            }
          : p
      ));
    } else {
      // Add to local state
      const newItem: PortfolioItem = {
        clubId,
        clubName: club.name,
        units,
        purchasePrice: actualCurrentPrice,
        currentPrice: actualCurrentPrice,
        totalValue: units * actualCurrentPrice,
        profitLoss: 0
      };
      setPortfolio(prev => [...prev, newItem]);
    }

    // Add transaction to local state
    const newTransaction: Transaction = {
      id: `transaction-${Date.now()}`,
      clubId,
      clubName: club.name,
      units,
      pricePerUnit: actualCurrentPrice,
      totalValue: units * actualCurrentPrice,
      date: new Date().toLocaleDateString()
    };
    setTransactions(prev => [newTransaction, ...prev]);

    toast({
      title: "Purchase Successful",
      description: `Bought ${units} unit(s) of ${club.name} for $${actualCurrentPrice.toFixed(2)} per unit`,
    });
  };

  const simulateMatch = () => {
    const availableClubs = [...PREMIER_LEAGUE_CLUBS];
    const homeTeam = availableClubs[Math.floor(Math.random() * availableClubs.length)];
    availableClubs.splice(availableClubs.indexOf(homeTeam), 1);
    const awayTeam = availableClubs[Math.floor(Math.random() * availableClubs.length)];

    const homeScore = Math.floor(Math.random() * 5);
    const awayScore = Math.floor(Math.random() * 5);
    
    const homeClub = clubs.find(c => c.name === homeTeam);
    const awayClub = clubs.find(c => c.name === awayTeam);
    
    if (!homeClub || !awayClub) return;

    // Get starting values: use launch price (20) for first match, otherwise use previous match ending value
    const homeMatches = matches.filter(m => m.homeTeam === homeTeam || m.awayTeam === homeTeam);
    const awayMatches = matches.filter(m => m.homeTeam === awayTeam || m.awayTeam === awayTeam);
    
    let homeStartValue = 20; // Default launch price
    let awayStartValue = 20; // Default launch price
    
    // For home team: get ending value from their most recent match
    if (homeMatches.length > 0) {
      const lastHomeMatch = homeMatches[0]; // Most recent match (matches are sorted newest first)
      homeStartValue = lastHomeMatch.homeTeam === homeTeam ? lastHomeMatch.homeEndValue : lastHomeMatch.awayEndValue;
    }
    
    // For away team: get ending value from their most recent match  
    if (awayMatches.length > 0) {
      const lastAwayMatch = awayMatches[0]; // Most recent match (matches are sorted newest first)
      awayStartValue = lastAwayMatch.homeTeam === awayTeam ? lastAwayMatch.homeEndValue : lastAwayMatch.awayEndValue;
    }

    const homeWins = homeScore > awayScore;
    const awayWins = awayScore > homeScore;
    
    let homeChange = 0;
    let awayChange = 0;
    let homeProfit = 0;
    let awayProfit = 0;

    if (homeWins) {
      awayChange = -10;
      awayProfit = -(awayStartValue * 0.1);
      homeProfit = Math.abs(awayProfit);
      homeChange = (homeProfit / homeStartValue) * 100;
    } else if (awayWins) {
      homeChange = -10;
      homeProfit = -(homeStartValue * 0.1);
      awayProfit = Math.abs(homeProfit);
      awayChange = (awayProfit / awayStartValue) * 100;
    }

    const homeEndValue = homeStartValue + homeProfit;
    const awayEndValue = awayStartValue + awayProfit;
    // Update club values
    setClubs(prev => prev.map(club => {
      if (club.name === homeTeam) {
        const newValue = homeEndValue;
        return {
          ...club,
          currentValue: newValue,
          profitLoss: newValue - club.launchValue,
          percentChange: ((newValue - club.launchValue) / club.launchValue) * 100,
          marketCap: newValue * 1000000
        };
      } else if (club.name === awayTeam) {
        const newValue = awayEndValue;
        return {
          ...club,
          currentValue: newValue,
          profitLoss: newValue - club.launchValue,
          percentChange: ((newValue - club.launchValue) / club.launchValue) * 100,
          marketCap: newValue * 1000000
        };
      }
      return club;
    }));

    // Update portfolio with new prices
    setPortfolio(prev => prev.map(p => {
      const updatedClub = clubs.find(c => c.id === p.clubId);
      if (updatedClub && (updatedClub.name === homeTeam || updatedClub.name === awayTeam)) {
        const newPrice = updatedClub.name === homeTeam ? homeEndValue : awayEndValue;
        return {
          ...p,
          currentPrice: newPrice,
          totalValue: p.units * newPrice,
          profitLoss: (newPrice - p.purchasePrice) * p.units
        };
      }
      return p;
    }));

    const newMatch: Match = {
      id: `match-${Date.now()}`,
      date: new Date().toLocaleDateString(),
      homeTeam,
      awayTeam,
      homeScore,
      awayScore,
      homeStartValue,
      awayStartValue,
      homeEndValue,
      awayEndValue,
      homeChange,
      awayChange,
      homeProfit,
      awayProfit
    };

    // Keep all matches, don't delete them
    setMatches(prev => [newMatch, ...prev]);

    toast({
      title: "Match Simulated",
      description: `${homeTeam} ${homeScore} - ${awayScore} ${awayTeam}`,
    });
  };

  const getTransactionsByClub = (clubId: string): Transaction[] => {
    return transactions.filter(t => t.clubId === clubId).sort((a, b) => 
      new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  };

  return (
    <AppContext.Provider
      value={{
        sidebarOpen,
        toggleSidebar,
        clubs,
        matches,
        portfolio,
        transactions,
        currentPage,
        setCurrentPage,
        purchaseClub,
        simulateMatch,
        getTransactionsByClub
      }}
    >
      {children}
    </AppContext.Provider>
  );
};
