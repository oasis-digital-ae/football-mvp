import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAppContext } from '../contexts/AppContext';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Input } from '@/shared/components/ui/input';
import { formatCurrency, formatPercent } from '@/shared/lib/formatters';
import { PurchaseConfirmationModal } from './PurchaseConfirmationModal';
import ClickableTeamName from '@/shared/components/ClickableTeamName';
import TeamLogo from '@/shared/components/TeamLogo';
import TeamDetailsSlideDown from './TeamDetailsSlideDown';
import { fixturesService } from '@/shared/lib/database';
import type { DatabaseFixture } from '@/shared/lib/database';
import { FixtureSync } from './FixtureSync';
import { TeamSync } from './TeamSync';
import { useToast } from '@/shared/hooks/use-toast';
import { ChevronDown, ChevronUp } from 'lucide-react';

export const ClubValuesPage: React.FC = () => {
  const { clubs, matches, purchaseClub, user } = useAppContext();
  const { toast } = useToast();
  const [selectedClub, setSelectedClub] = useState<string | null>(null);
  const [fixtures, setFixtures] = useState<DatabaseFixture[]>([]);
  const [confirmationData, setConfirmationData] = useState<{
    clubId: string;
    clubName: string;
    externalId?: number;
    pricePerShare: number;
  } | null>(null);

  // Load fixtures on component mount and when clubs change
  useEffect(() => {
    loadFixtures();
  }, [clubs]); // Refresh fixtures when clubs data changes (e.g., after simulation)

  const loadFixtures = async () => {
    try {
      const fixturesData = await fixturesService.getAll();
      setFixtures(fixturesData);
    } catch (error) {
      console.error('Error loading fixtures:', error);
    }
  };

  // Expose refresh function for external components to call
  const refreshFixtures = async () => {
    await loadFixtures();
  };

  // Make refreshFixtures available globally for simulation components
  useEffect(() => {
    (window as any).refreshClubValuesFixtures = refreshFixtures;
    return () => {
      delete (window as any).refreshClubValuesFixtures;
    };
  }, []);

  // Memoized function to count games played for a club using fixture data
  // Only counts fixtures that have been simulated (not synced from API)
  const getGamesPlayed = useCallback((clubId: string): number => {
    // OPTIMIZED: Pre-filter fixtures once instead of filtering for each club
    const clubIdInt = parseInt(clubId);
    return fixtures.filter(fixture => 
      (fixture.home_team_id === clubIdInt || fixture.away_team_id === clubIdInt) &&
      fixture.status === 'applied' && 
      fixture.result !== 'pending' &&
      // Only count fixtures that have snapshot data (indicating they were simulated)
      fixture.snapshot_home_cap !== null &&
      fixture.snapshot_away_cap !== null
    ).length;
  }, [fixtures]);
  // Function to get the latest ending value for a club from matches
  const getLatestClubValue = (clubName: string, launchValue: number): number => {
    // Find all matches where this club participated
    const clubMatches = matches.filter(match => 
      match.homeTeam === clubName || match.awayTeam === clubName
    );
    
    if (clubMatches.length === 0) {
      return launchValue; // No matches, return launch value
    }
    
    // Get the most recent match (first in array since matches are sorted newest first)
    const latestMatch = clubMatches[0];
    return latestMatch.homeTeam === clubName ? latestMatch.homeEndValue : latestMatch.awayEndValue;
  };

  const handleTeamClick = useCallback((clubId: string) => {
    setSelectedClub(selectedClub === clubId ? null : clubId);
  }, [selectedClub]);

  // Memoize the teams data to prevent unnecessary re-renders
  const memoizedTeams = useMemo(() => {
    const now = new Date().toISOString(); // Create date once per render
    return clubs.map(c => ({
      id: parseInt(c.id),
      external_id: c.externalId ? parseInt(c.externalId) : null,
      name: c.name,
      short_name: c.name,
      logo_url: null,
      initial_market_cap: c.launchPrice * c.sharesOutstanding,
      market_cap: c.marketCap,
      total_shares: c.sharesOutstanding,
      available_shares: c.sharesOutstanding,
      shares_outstanding: c.sharesOutstanding,
      is_tradeable: true,
      created_at: now,
      updated_at: now,
      launch_price: c.launchPrice
    }));
  }, [clubs]);

  const handlePurchaseClick = useCallback((clubId: string) => {
    const club = clubs.find(c => c.id === clubId);
    if (!club) return;
    
    const pricePerShare = club.currentValue; // Use actual current value (NAV)
    
    setConfirmationData({
      clubId,
      clubName: club.name,
      externalId: club.externalId ? parseInt(club.externalId) : undefined,
      pricePerShare
    });
  }, [clubs]);
  
  const confirmPurchase = useCallback(async (shares: number) => {
    if (!confirmationData) return;
    
    try {
      await purchaseClub(confirmationData.clubId, shares);
      setConfirmationData(null);
      toast({
        title: "Purchase Successful",
        description: `Successfully purchased ${shares} shares of ${confirmationData.clubName}`,
      });
    } catch (error: any) {
      console.error('Purchase failed:', error);
      toast({
        title: "Purchase Failed",
        description: error?.message || 'An unknown error occurred',
        variant: "destructive",
      });
    }
  }, [confirmationData, purchaseClub, toast]);

  return (
    <div className="p-6">
      <Card className="bg-gray-800 border-gray-700">
        <CardHeader>
          <CardTitle className="text-white text-2xl">Marketplace</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-white text-sm">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="text-left p-2">#</th>
                  <th className="text-left p-2">Club</th>
                  <th className="text-center p-2">Games Played</th>
                  <th className="text-right p-2">Launch</th>
                  <th className="text-right p-2">Current</th>
                  <th className="text-right p-2">P/L</th>
                  <th className="text-right p-2">Change</th>
                  <th className="text-right p-2">Market Cap</th>
                  <th className="text-center p-2">Shares Outstanding</th>
                  <th className="text-center p-2">Buy</th>
                </tr>
              </thead>
              <tbody>
                {useMemo(() => clubs
                  .map(club => {
                    const launchPrice = Number(club.launchValue) || 20; // Use actual launch value from database, fallback to 20
                    const currentValue = Number(club.currentValue) || 20; // Use actual current value from database, fallback to 20
                    const profitLoss = currentValue - launchPrice;
                    // Use the percentChange already calculated in convertTeamToClub, don't recalculate
                    const percentChange = club.percentChange;
                    const marketCap = Number(club.marketCap) || 100; // Use actual market cap from database, fallback to 100
                    
                    return {
                      ...club,
                      launchPrice,
                      currentValue,
                      profitLoss,
                      percentChange,
                      marketCap
                    };
                  })
                  .sort((a, b) => b.percentChange - a.percentChange), [clubs]) // Sort by percentage gain descending
                  .map((club, index) => (
                    <React.Fragment key={club.id}>
                      <tr className="border-b border-gray-700 hover:bg-gray-700">
                        <td className="p-2 text-gray-400">{index + 1}</td>
                        <td className="p-2 font-medium">
                          <div className="flex items-center gap-2">
                            <TeamLogo 
                              teamName={club.name} 
                              externalId={club.externalId ? parseInt(club.externalId) : undefined}
                              size="sm" 
                            />
                            <button
                              onClick={() => handleTeamClick(club.id)}
                              className="hover:text-blue-400 transition-colors duration-200 cursor-pointer text-left flex items-center gap-2"
                            >
                              {club.name}
                              <ChevronDown 
                                className={`h-4 w-4 transition-transform duration-280 ease-out ${
                                  selectedClub === club.id ? 'rotate-180' : ''
                                }`}
                              />
                            </button>
                          </div>
                        </td>
                        <td 
                          className="p-2 text-center text-blue-400 font-medium cursor-pointer hover:text-blue-300"
                          onClick={() => handleTeamClick(club.id)}
                        >
                          {getGamesPlayed(club.id)}
                        </td>
                        <td className="p-2 text-right">{formatCurrency(club.launchPrice)}</td>
                        <td className="p-2 text-right">{formatCurrency(club.currentValue)}</td>
                        <td className={`p-2 text-right ${club.profitLoss === 0 ? 'text-gray-400' : club.profitLoss > 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {formatCurrency(club.profitLoss)}
                        </td>
                        <td className={`p-2 text-right ${club.percentChange === 0 ? 'text-gray-400' : club.percentChange > 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {formatPercent(club.percentChange)}
                        </td>
                         <td className="p-2 text-right">{formatCurrency(club.marketCap)}</td>
                        <td className="p-2 text-center text-blue-400 font-medium">
                          {club.sharesOutstanding.toLocaleString()}
                        </td>
                        <td className="p-2 text-center">
                          <div className="flex gap-2 justify-center">
                            <Button
                              onClick={() => handlePurchaseClick(club.id)}
                              size="sm"
                              className="bg-blue-600 hover:bg-blue-700 text-xs px-3 py-1"
                            >
                              Buy
                            </Button>
                          </div>
                        </td>
                      </tr>
                      
                      {/* Slide-down panel for team details */}
                      <tr>
                        <td colSpan={10} className="p-0">
                          <TeamDetailsSlideDown
                            isOpen={selectedClub === club.id}
                            teamId={parseInt(club.id)}
                            teamName={club.name}
                            userId={user?.id}
                            fixtures={fixtures}
                            teams={memoizedTeams}
                          />
                        </td>
                      </tr>
                    </React.Fragment>
                  ))}

              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
      
      
      {/* Team Sync Component */}
      <div className="mt-6">
        <TeamSync />
      </div>
      
      {/* Fixture Sync Component */}
      <div className="mt-6">
        <FixtureSync />
      </div>
      
      <PurchaseConfirmationModal
        isOpen={confirmationData !== null}
        onClose={() => setConfirmationData(null)}
        onConfirm={confirmPurchase}
        clubName={confirmationData?.clubName || ''}
        clubId={confirmationData?.clubId}
        externalId={confirmationData?.externalId}
        pricePerShare={confirmationData?.pricePerShare || 0}
      />

    </div>
  );
};

export default ClubValuesPage;