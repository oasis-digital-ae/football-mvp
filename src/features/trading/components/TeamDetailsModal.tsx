import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import { footballApiService } from '@/shared/lib/football-api';
import { fixturesService, teamsService, positionsService } from '@/shared/lib/database';
import type { TeamDetails, FootballMatch, Standing } from '@/shared/lib/football-api';
import type { DatabaseFixture, DatabaseTeam } from '@/shared/lib/database';
import type { DatabasePositionWithTeam } from '@/shared/types/database.types';
import { formatCurrency } from '@/shared/lib/formatters';
import { Loader2, TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface TeamDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  teamId: number;
  teamName: string;
  userId?: string; // Optional user ID for P/L calculations
}

const TeamDetailsModal: React.FC<TeamDetailsModalProps> = ({ isOpen, onClose, teamId, teamName, userId }) => {
  const [teamDetails, setTeamDetails] = useState<TeamDetails | null>(null);
  const [teamMatches, setTeamMatches] = useState<FootballMatch[]>([]);
  const [standings, setStandings] = useState<Standing[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [matchHistory, setMatchHistory] = useState<any[]>([]);
  const [teams, setTeams] = useState<DatabaseTeam[]>([]);
  const [userPosition, setUserPosition] = useState<DatabasePositionWithTeam | null>(null);

  useEffect(() => {
    if (isOpen && teamId) {
      loadTeamData();
    }
  }, [isOpen, teamId]);

  const loadTeamData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      console.log('Loading team data for teamId:', teamId, 'teamName:', teamName);
      
      // First, get all teams to find the external ID for this team
      const allTeams = await teamsService.getAll();
      const team = allTeams.find(t => t.id === teamId);
      
      if (!team) {
        throw new Error(`Team with ID ${teamId} not found`);
      }
      
      const externalTeamId = team.external_id;
      console.log('Using external team ID:', externalTeamId, 'for team:', team.name);
      
      // Try to get Premier League data (this will use Netlify function if available)
      let premierLeague = null;
      try {
        const premierLeagueData = await footballApiService.getPremierLeagueData();
        premierLeague = premierLeagueData;
      } catch (error) {
        console.warn('Netlify function failed, attempting fallback with direct API calls:', error);
        
        // Fallback: Use direct API calls
        try {
          const [matchesData] = await Promise.allSettled([
            footballApiService.getPremierLeagueMatches()
          ]);
          
          const matches = matchesData.status === 'fulfilled' ? matchesData.value : [];
          
          // For fallback, we'll use basic team info from matches
          const teams = new Map();
          matches.forEach(match => {
            if (!teams.has(match.homeTeam.id)) {
              teams.set(match.homeTeam.id, match.homeTeam);
            }
            if (!teams.has(match.awayTeam.id)) {
              teams.set(match.awayTeam.id, match.awayTeam);
            }
          });
          
          // Reconstruct the data structure
          premierLeague = {
            standings: [], // Empty standings for fallback
            matches,
            teams: Array.from(teams.values())
          };
          
          console.log('Fallback successful:', { matches: matches.length, teams: teams.size });
        } catch (fallbackError) {
          console.error('Fallback also failed:', fallbackError);
          premierLeague = null;
        }
      }

      // Check if we have Premier League data
      if (!premierLeague) {
        console.warn('No Premier League data available');
      }

      // Get fixtures data
      const [fixturesData] = await Promise.allSettled([
        fixturesService.getAll()
      ]);

      // Extract successful results
      const fixtures = fixturesData.status === 'fulfilled' ? fixturesData.value : [];

      // Try to get detailed team information
      let teamDetails = null;
      if (externalTeamId) {
        try {
          const basicTeamInfo = premierLeague?.teams?.find(t => t.id === externalTeamId);
          if (basicTeamInfo) {
            teamDetails = basicTeamInfo;
          }
        } catch (detailError) {
          console.warn('Failed to fetch detailed team info, using basic info:', detailError);
          teamDetails = null;
        }
      }

      // Set the data regardless of success or failure
      setTeamDetails(teamDetails);
      setTeamMatches(teamMatches);
      setStandings(standings);
      setTeams(allTeams);
      
      console.log('Team data loaded:', { 
        details: teamDetails ? 'loaded' : 'failed', 
        matches: teamMatches.length, 
        standings: standings.length 
      });

      // Load user position if userId is provided
      let currentUserPosition = null;
      if (userId) {
        currentUserPosition = await loadUserPositionAndReturn(userId, teamId);
      }
      await loadMatchHistory(fixtures, allTeams, currentUserPosition);

    } catch (err) {
      console.error('Error loading team data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load team data');
    } finally {
      setLoading(false);
    }
  };

  const loadUserPositionAndReturn = async (userId: string, teamId: number) => {
    try {
      const positions = await positionsService.getUserPositions(userId);
      const position = positions.find(p => p.team_id === teamId);
      setUserPosition(position || null);
      return position || null; // Return the position directly
    } catch (error) {
      console.error('Error loading user position:', error);
      return null;
    }
  };

  const loadMatchHistory = async (fixturesData: DatabaseFixture[], teamsData: DatabaseTeam[], currentUserPosition?: any) => {
    try {
      console.log('Loading match history for teamId:', teamId);
      console.log('Total fixtures:', fixturesData.length);
      
      const teamFixtures = fixturesData.filter(f => 
        f.home_team_id === teamId || f.away_team_id === teamId
      );
      
      console.log('Team fixtures:', teamFixtures.length);
      console.log('Team fixtures details:', teamFixtures.map(f => ({
        id: f.id,
        status: f.status,
        result: f.result,
        snapshot_home_cap: f.snapshot_home_cap,
        snapshot_away_cap: f.snapshot_away_cap
      })));

      const matchHistoryData = teamFixtures
        .filter(f => f.status === 'applied' && f.result !== 'pending' && f.snapshot_home_cap !== null && f.snapshot_away_cap !== null)
        .map(fixture => {
          const isHome = fixture.home_team_id === teamId;
          const opponentId = isHome ? fixture.away_team_id : fixture.home_team_id;
          const opponent = teamsData.find(t => t.id === opponentId);
          
          if (!opponent) {
            console.warn(`Could not find opponent team for fixture ${fixture.id}`);
            return null;
          }

          const team = teamsData.find(t => t.id === teamId);
          if (!team) {
            console.warn(`Could not find team for fixture ${fixture.id}`);
            return null;
          }

          let result: 'win' | 'loss' | 'draw';
          let priceImpact: number;
          let postMatchCap: number;
          let priceImpactPercent: number;

          const preMatchCap = fixture.snapshot_home_cap || team.market_cap;
          
          if (fixture.result === 'home_win') {
            if (isHome) {
              result = 'win';
              // Winner gets 10% of loser's market cap
              const loserCap = fixture.snapshot_away_cap || 0;
              priceImpact = loserCap * 0.10;
              postMatchCap = preMatchCap + priceImpact;
            } else {
              result = 'loss';
              // Loser loses 10% of their market cap
              priceImpact = -preMatchCap * 0.10;
              postMatchCap = preMatchCap + priceImpact;
            }
          } else if (fixture.result === 'away_win') {
            if (isHome) {
              result = 'loss';
              // Loser loses 10% of their market cap
              priceImpact = -preMatchCap * 0.10;
              postMatchCap = preMatchCap + priceImpact;
            } else {
              result = 'win';
              // Winner gets 10% of loser's market cap
              const loserCap = fixture.snapshot_home_cap || 0;
              priceImpact = loserCap * 0.10;
              postMatchCap = preMatchCap + priceImpact;
            }
          } else {
            result = 'draw';
            priceImpact = 0;
            postMatchCap = preMatchCap;
          }

          priceImpactPercent = preMatchCap > 0 ? (priceImpact / preMatchCap) * 100 : 0;

          // Calculate pre-match and post-match share prices
          const preMatchSharesOutstanding = team.shares_outstanding;
          const postMatchSharesOutstanding = team.shares_outstanding; // Assuming shares outstanding doesn't change from match results
          
          const preMatchSharePrice = preMatchSharesOutstanding > 0 ? preMatchCap / preMatchSharesOutstanding : 0;
          const postMatchSharePrice = postMatchSharesOutstanding > 0 ? postMatchCap / postMatchSharesOutstanding : 0;

          // Calculate user P/L if user has position
          const userPos = currentUserPosition || userPosition;
          let userPL = 0;
          if (userPos && userPos.quantity > 0) {
            const preMatchValue = userPos.quantity * preMatchSharePrice;
            const postMatchValue = userPos.quantity * postMatchSharePrice;
            userPL = postMatchValue - preMatchValue;
          } else {
            console.log(`No user position for ${team.name}:`, { userPosition: userPos, teamId });
          }

          const score = `${fixture.home_score || 0}-${fixture.away_score || 0}`;

          return {
            fixture,
            opponent,
            isHome,
            result,
            score,
            preMatchCap,
            postMatchCap,
            priceImpact,
            priceImpactPercent,
            preMatchSharePrice,
            postMatchSharePrice,
            userPL
          };
        })
        .filter(Boolean)
        .sort((a, b) => new Date(b.fixture.kickoff_at).getTime() - new Date(a.fixture.kickoff_at).getTime());

      console.log('Final match history data:', matchHistoryData.length);
      console.log('Match history details:', matchHistoryData);
      
      setMatchHistory(matchHistoryData);
    } catch (error) {
      console.error('Error loading match history:', error);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const getResultIcon = (result: string) => {
    switch (result) {
      case 'win':
        return <TrendingUp className="h-4 w-4 text-green-400" />;
      case 'loss':
        return <TrendingDown className="h-4 w-4 text-red-400" />;
      case 'draw':
        return <Minus className="h-4 w-4 text-yellow-400" />;
      default:
        return null;
    }
  };

  const getResultColor = (result: string) => {
    switch (result) {
      case 'win':
        return 'bg-green-600';
      case 'loss':
        return 'bg-red-600';
      case 'draw':
        return 'bg-yellow-600';
      default:
        return 'bg-gray-600';
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-gray-900 border-gray-700">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <TrendingUp className="h-5 w-5 text-green-400" />
            {teamName} - Match History & Share Price Impact
          </DialogTitle>
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-blue-400" />
            <span className="ml-2 text-gray-400">Loading team data...</span>
          </div>
        )}

        {error && (
          <div className="text-center py-8">
            <p className="text-red-400 mb-4">{error}</p>
            <Button
              onClick={loadTeamData}
              variant="outline"
              className="border-gray-600 text-gray-300 hover:bg-gray-800"
            >
              Retry
            </Button>
          </div>
        )}

        {!loading && (
          <div className="w-full space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Match History & Share Price Impact
                </CardTitle>
              </CardHeader>
              <CardContent>
                {matchHistory.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-gray-400">No completed matches found</p>
                    <p className="text-sm text-gray-500 mt-2">
                      Matches will appear here once they are completed and market cap transfers are applied.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {matchHistory.map((match, index) => (
                      <Card key={match.fixture.id} className="bg-gray-800 border-gray-700">
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-3">
                              <Badge variant="outline" className="text-xs">
                                {formatDate(match.fixture.kickoff_at)}
                              </Badge>
                              <span className="font-medium">
                                {match.isHome ? 'vs' : '@'} {match.opponent.name}
                              </span>
                              <span className="text-sm font-mono text-gray-300">
                                {match.score}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              {getResultIcon(match.result)}
                              <Badge className={getResultColor(match.result)}>
                                {match.result === 'win' ? 'W' : match.result === 'loss' ? 'L' : 'D'}
                              </Badge>
                            </div>
                          </div>
                          
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                            <div className="space-y-2">
                              <div className="text-gray-400">Market Cap Impact</div>
                              <div className="flex items-center gap-2">
                                <span className="text-gray-300">
                                  {formatCurrency(match.preMatchCap)} → {formatCurrency(match.postMatchCap)}
                                </span>
                                <span className={`text-xs ${match.priceImpactPercent > 0 ? 'text-green-400' : match.priceImpactPercent < 0 ? 'text-red-400' : 'text-gray-400'}`}>
                                  {match.priceImpactPercent > 0 ? '+' : ''}{match.priceImpactPercent.toFixed(1)}%
                                </span>
                              </div>
                            </div>
                            
                            <div className="space-y-2">
                              <div className="text-gray-400">Share Price</div>
                              <div className="flex items-center gap-2">
                                <span className="text-gray-300">
                                  {formatCurrency(match.preMatchSharePrice)} → {formatCurrency(match.postMatchSharePrice)}
                                </span>
                              </div>
                            </div>
                            
                            {userId && match.userPL !== 0 && (
                              <div className="space-y-2">
                                <div className="text-gray-400">Your P/L</div>
                                <div className={`font-medium ${match.userPL > 0 ? 'text-green-400' : 'text-red-400'}`}>
                                  {match.userPL > 0 ? '+' : ''}{formatCurrency(match.userPL)}
                                </div>
                              </div>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default TeamDetailsModal;