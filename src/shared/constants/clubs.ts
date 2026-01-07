export interface Club {
  id: string;
  name: string;
  externalId?: string;
  launchValue: number;
  currentValue: number;
  profitLoss: number;
  percentChange: number;
  marketCap: number;
  sharesOutstanding: number;
}

export interface Match {
  id: string;
  date: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  homeStartValue: number;
  awayStartValue: number;
  homeEndValue: number;
  awayEndValue: number;
  homeChange: number;
  awayChange: number;
  homeProfit: number;
  awayProfit: number;
}

export interface PortfolioItem {
  clubId: string;
  clubName: string;
  units: number;
  purchasePrice: number; // Display: user's actual purchase price from total_invested (rounded to 2 decimals)
  currentPrice: number;
  totalValue: number;
  profitLoss: number;
  purchaseMarketCapPrecise: number; // Full precision purchase market cap for calculations (no rounding)
}

export interface Transaction {
  id: string;
  clubId: string;
  clubName: string;
  units: number;
  pricePerUnit: number;
  totalValue: number;
  date: string;
  orderType: 'BUY' | 'SELL';
}

export const PREMIER_LEAGUE_CLUBS = [
  'Arsenal', 'Aston Villa', 'Brighton', 'Burnley', 'Chelsea',
  'Crystal Palace', 'Everton', 'Fulham', 'Liverpool', 'Luton Town',
  'Manchester City', 'Manchester United', 'Newcastle United', 'Nottingham Forest',
  'Sheffield United', 'Tottenham', 'West Ham', 'Wolves', 'Bournemouth', 'Brentford'
];

export const generateInitialClubs = (): Club[] => {
  return PREMIER_LEAGUE_CLUBS.map((name, index) => {
    const launchValue = Math.floor(Math.random() * 11) + 10; // 10-20
    const currentValue = launchValue + (Math.random() * 6 - 3); // ±3 variation
    const profitLoss = currentValue - launchValue;
    const percentChange = (profitLoss / launchValue) * 100;
    
    return {
      id: `club-${index}`,
      name,
      launchValue,
      currentValue: Math.max(1, currentValue),
      profitLoss,
      percentChange,
      marketCap: currentValue * 1000000
    };
  });
};