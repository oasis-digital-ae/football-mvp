export interface Club {
  id: string;
  name: string;
  launchValue: number;
  currentValue: number;
  profitLoss: number;
  percentChange: number;
  marketCap: number;
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
  purchasePrice: number;
  currentPrice: number;
  totalValue: number;
  profitLoss: number;
}

export interface Transaction {
  id: string;
  clubId: string;
  clubName: string;
  units: number;
  pricePerUnit: number;
  totalValue: number;
  date: string;
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