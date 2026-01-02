import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import { footballApiService } from '@/shared/lib/football-api';
import type { Standing } from '@/shared/lib/football-api';
import ClickableTeamName from '@/shared/components/ClickableTeamName';
import { Trophy, TrendingUp, TrendingDown, Minus, Loader2 } from 'lucide-react';

const StandingsPage: React.FC = () => {
  const [standings, setStandings] = useState<Standing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const season = 2025; // Fixed to 2025-26 season

  useEffect(() => {
    loadStandings();
  }, []);

  const loadStandings = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const premierLeagueData = await footballApiService.getPremierLeagueData(season);
      setStandings(premierLeagueData.standings);
    } catch (err) {
      console.error('Error loading standings:', err);
      setError(err instanceof Error ? err.message : 'Failed to load standings');
    } finally {
      setLoading(false);
    }
  };

  const getPositionChange = (currentPosition: number, previousPosition?: number) => {
    if (!previousPosition) return null;
    const change = previousPosition - currentPosition;
    if (change > 0) return { direction: 'up', change };
    if (change < 0) return { direction: 'down', change: Math.abs(change) };
    return { direction: 'same', change: 0 };
  };

  const getPositionIcon = (position: number) => {
    if (position <= 4) return <Trophy className="h-4 w-4 text-yellow-500" />;
    if (position <= 6) return <Trophy className="h-4 w-4 text-gray-400" />;
    if (position >= 18) return <TrendingDown className="h-4 w-4 text-red-500" />;
    return null;
  };

  const getPositionBadge = (position: number) => {
    if (position <= 4) return <Badge className="bg-yellow-100 text-yellow-800 text-[10px] py-0 px-1.5 h-4 leading-4 !inline-flex items-center justify-center rounded">Champions League</Badge>;
    if (position === 5) return <Badge className="bg-blue-100 text-blue-800 text-[10px] py-0 px-1.5 h-4 leading-4 !inline-flex items-center justify-center rounded">Europa League</Badge>;
    if (position === 6) return <Badge className="bg-purple-100 text-purple-800 text-[10px] py-0 px-1.5 h-4 leading-4 !inline-flex items-center justify-center rounded">Conference League</Badge>;
    if (position >= 18) return <Badge variant="destructive" className="text-[10px] py-0 px-1.5 h-4 leading-4 !inline-flex items-center justify-center rounded">Relegation Zone</Badge>;
    return null;
  };

  const formatGoalDifference = (gd: number) => {
    return gd > 0 ? `+${gd}` : gd.toString();
  };

  if (loading) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin" />
            <span className="ml-2">Loading Premier League standings...</span>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="text-center py-12">
            <p className="text-red-500 mb-4">{error}</p>
            <Button onClick={loadStandings} variant="outline">
              Try Again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 space-y-6 w-full max-w-full overflow-x-hidden">
      <div>
        <h1 className="text-3xl font-bold text-white">Premier League Standings</h1>
        <p className="text-gray-400 mt-1">Season 2025-26</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5" />
            League Table
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto w-full max-w-full">
            <table className="trading-table w-full">
              <thead>
                <tr>
                  <th className="w-12 px-3" style={{ textAlign: 'left' }}>Pos</th>
                  <th className="min-w-[200px] px-3" style={{ textAlign: 'left' }}>Team</th>
                  <th className="w-16 px-3" style={{ textAlign: 'center' }}>P</th>
                  <th className="w-16 px-3" style={{ textAlign: 'center' }}>W</th>
                  <th className="w-16 px-3" style={{ textAlign: 'center' }}>D</th>
                  <th className="w-16 px-3" style={{ textAlign: 'center' }}>L</th>
                  <th className="w-16 px-3" style={{ textAlign: 'center' }}>GF</th>
                  <th className="w-16 px-3" style={{ textAlign: 'center' }}>GA</th>
                  <th className="w-16 px-3" style={{ textAlign: 'center' }}>GD</th>
                  <th className="w-16 px-3" style={{ textAlign: 'center' }}>Pts</th>
                  <th className="px-3" style={{ textAlign: 'center', minWidth: '140px' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {standings.map((standing, index) => (
                  <tr 
                    key={standing.team.id}
                    className={`${
                      standing.position <= 4 ? 'bg-yellow-900/20' :
                      standing.position >= 18 ? 'bg-red-900/20' : ''
                    }`}
                  >
                    <td className="px-3 text-xs font-medium" style={{ color: 'hsl(var(--muted-foreground))', textAlign: 'left' }}>
                      <div className="flex items-center gap-2">
                        {getPositionIcon(standing.position)}
                        {standing.position}
                      </div>
                    </td>
                    <td className="px-3" style={{ textAlign: 'left' }}>
                      <div className="flex items-center gap-2">
                        <img 
                          src={standing.team.crest} 
                          alt={standing.team.name}
                          className="w-5 h-5 object-contain"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                        <ClickableTeamName
                          teamName={standing.team.name}
                          teamId={standing.team.id}
                          className="font-medium hover:text-trading-primary transition-colors"
                        />
                      </div>
                    </td>
                    <td className="px-3 text-xs" style={{ textAlign: 'center' }}>{standing.playedGames}</td>
                    <td className="px-3 text-xs text-green-400 font-medium" style={{ textAlign: 'center' }}>{standing.won}</td>
                    <td className="px-3 text-xs text-yellow-400" style={{ textAlign: 'center' }}>{standing.draw}</td>
                    <td className="px-3 text-xs text-red-400" style={{ textAlign: 'center' }}>{standing.lost}</td>
                    <td className="px-3 text-xs" style={{ textAlign: 'center' }}>{standing.goalsFor}</td>
                    <td className="px-3 text-xs" style={{ textAlign: 'center' }}>{standing.goalsAgainst}</td>
                    <td className="px-3 text-xs font-mono" style={{ textAlign: 'center' }}>
                      {formatGoalDifference(standing.goalDifference)}
                    </td>
                    <td className="px-3 text-xs font-semibold" style={{ textAlign: 'center' }}>{standing.points}</td>
                    <td className="px-3 text-xs" style={{ textAlign: 'center' }}>
                      {getPositionBadge(standing.position)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Card Layout */}
          <div className="md:hidden space-y-2 p-3">
            {standings.map((standing, index) => {
              const positionChange = getPositionChange(standing.position, standing.previousPosition);
              
              return (
                <div
                  key={standing.team.id}
                  className={`bg-gray-800/40 rounded-lg p-3 border ${
                    standing.position <= 4 ? 'border-yellow-500/30 bg-yellow-900/10' :
                    standing.position >= 18 ? 'border-red-500/30 bg-red-900/10' : 
                    'border-gray-700/30'
                  } touch-manipulation`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {getPositionIcon(standing.position)}
                        <span className="text-xs font-semibold text-gray-400 w-6">{standing.position}</span>
                      </div>
                      <img 
                        src={standing.team.crest} 
                        alt={standing.team.name}
                        className="w-5 h-5 object-contain flex-shrink-0"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                      <ClickableTeamName
                        teamName={standing.team.name}
                        teamId={standing.team.id}
                        className="font-medium text-sm text-white hover:text-trading-primary transition-colors truncate"
                      />
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <div className="text-right">
                        <div className="text-base font-bold text-white">{standing.points}</div>
                        <div className="text-[9px] text-gray-500">pts</div>
                      </div>
                      {getPositionBadge(standing.position)}
                    </div>
                  </div>
                  
                  {/* Stats Grid */}
                  <div className="grid grid-cols-4 gap-2 pt-2 border-t border-gray-700/20">
                    <div className="text-center">
                      <div className="text-[9px] text-gray-500 mb-0.5">P</div>
                      <div className="text-xs font-semibold text-white">{standing.playedGames}</div>
                    </div>
                    <div className="text-center">
                      <div className="text-[9px] text-gray-500 mb-0.5">W</div>
                      <div className="text-xs font-semibold text-green-400">{standing.won}</div>
                    </div>
                    <div className="text-center">
                      <div className="text-[9px] text-gray-500 mb-0.5">D</div>
                      <div className="text-xs font-semibold text-yellow-400">{standing.draw}</div>
                    </div>
                    <div className="text-center">
                      <div className="text-[9px] text-gray-500 mb-0.5">L</div>
                      <div className="text-xs font-semibold text-red-400">{standing.lost}</div>
                    </div>
                  </div>
                  
                  {/* Goals */}
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-gray-700/20 mt-2">
                    <div>
                      <div className="text-[9px] text-gray-500 mb-0.5">Goals For</div>
                      <div className="text-xs font-semibold text-white">{standing.goalsFor}</div>
                    </div>
                    <div>
                      <div className="text-[9px] text-gray-500 mb-0.5">Goal Diff</div>
                      <div className={`text-xs font-semibold font-mono ${
                        standing.goalDifference > 0 ? 'text-green-400' : 
                        standing.goalDifference < 0 ? 'text-red-400' : 'text-gray-400'
                      }`}>
                        {formatGoalDifference(standing.goalDifference)}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* League Information - Mobile Optimized */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 sm:gap-3 lg:gap-4">
        <Card>
          <CardHeader className="p-3 sm:p-4 lg:p-6">
            <CardTitle className="text-sm sm:text-base lg:text-lg flex items-center gap-2">
              <Trophy className="h-4 w-4 sm:h-5 sm:w-5 text-yellow-500" />
              Champions League
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 sm:p-4 lg:p-6 pt-0">
            <p className="text-xs sm:text-sm text-gray-400">
              Positions 1-4 qualify for the UEFA Champions League
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-3 sm:p-4 lg:p-6">
            <CardTitle className="text-sm sm:text-base lg:text-lg flex items-center gap-2">
              <Trophy className="h-4 w-4 sm:h-5 sm:w-5 text-blue-500" />
              Europa League
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 sm:p-4 lg:p-6 pt-0">
            <p className="text-xs sm:text-sm text-gray-400">
              Position 5 qualifies for the UEFA Europa League
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-3 sm:p-4 lg:p-6">
            <CardTitle className="text-sm sm:text-base lg:text-lg flex items-center gap-2">
              <TrendingDown className="h-4 w-4 sm:h-5 sm:w-5 text-red-500" />
              Relegation
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 sm:p-4 lg:p-6 pt-0">
            <p className="text-xs sm:text-sm text-gray-400">
              Positions 18-20 are relegated to the Championship
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default StandingsPage;

