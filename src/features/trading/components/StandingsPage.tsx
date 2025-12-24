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
    <div className="p-6 space-y-6">
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
          <div className="overflow-x-auto">
            <table className="trading-table">
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
        </CardContent>
      </Card>

      {/* League Information */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Trophy className="h-5 w-5 text-yellow-500" />
              Champions League
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600">
              Positions 1-4 qualify for the UEFA Champions League
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Trophy className="h-5 w-5 text-blue-500" />
              Europa League
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600">
              Position 5 qualifies for the UEFA Europa League
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingDown className="h-5 w-5 text-red-500" />
              Relegation
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600">
              Positions 18-20 are relegated to the Championship
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default StandingsPage;

