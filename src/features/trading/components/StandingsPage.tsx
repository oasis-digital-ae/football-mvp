import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/components/ui/table';
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
    if (position <= 4) return <Badge className="bg-yellow-100 text-yellow-800">Champions League</Badge>;
    if (position === 5) return <Badge className="bg-blue-100 text-blue-800">Europa League</Badge>;
    if (position === 6) return <Badge className="bg-purple-100 text-purple-800">Conference League</Badge>;
    if (position >= 18) return <Badge variant="destructive">Relegation Zone</Badge>;
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
        <CardContent>
          <div className="overflow-x-auto">
            <Table className="bg-gray-800">
              <TableHeader>
                <TableRow className="border-gray-700 hover:bg-gray-700">
                  <TableHead className="w-12 text-gray-300">Pos</TableHead>
                  <TableHead className="min-w-[200px] text-gray-300">Team</TableHead>
                  <TableHead className="w-16 text-center text-gray-300">P</TableHead>
                  <TableHead className="w-16 text-center text-gray-300">W</TableHead>
                  <TableHead className="w-16 text-center text-gray-300">D</TableHead>
                  <TableHead className="w-16 text-center text-gray-300">L</TableHead>
                  <TableHead className="w-16 text-center text-gray-300">GF</TableHead>
                  <TableHead className="w-16 text-center text-gray-300">GA</TableHead>
                  <TableHead className="w-16 text-center text-gray-300">GD</TableHead>
                  <TableHead className="w-16 text-center text-gray-300">Pts</TableHead>
                  <TableHead className="w-32 text-gray-300">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {standings.map((standing, index) => (
                  <TableRow 
                    key={standing.team.id}
                    className={`border-gray-700 hover:bg-gray-700 ${
                      standing.position <= 4 ? 'bg-yellow-900/20' :
                      standing.position >= 18 ? 'bg-red-900/20' : ''
                    }`}
                  >
                    <TableCell className="font-medium text-white">
                      <div className="flex items-center gap-2">
                        {getPositionIcon(standing.position)}
                        {standing.position}
                      </div>
                    </TableCell>
                    <TableCell className="text-white">
                      <div className="flex items-center gap-3">
                        <img 
                          src={standing.team.crest} 
                          alt={standing.team.name}
                          className="w-6 h-6 object-contain"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                        <ClickableTeamName
                          teamName={standing.team.name}
                          teamId={standing.team.id}
                          className="font-medium hover:text-blue-400 text-white"
                        />
                      </div>
                    </TableCell>
                    <TableCell className="text-center text-white">{standing.playedGames}</TableCell>
                    <TableCell className="text-center text-green-400 font-medium">{standing.won}</TableCell>
                    <TableCell className="text-center text-yellow-400">{standing.draw}</TableCell>
                    <TableCell className="text-center text-red-400">{standing.lost}</TableCell>
                    <TableCell className="text-center text-white">{standing.goalsFor}</TableCell>
                    <TableCell className="text-center text-white">{standing.goalsAgainst}</TableCell>
                    <TableCell className="text-center font-mono text-white">
                      {formatGoalDifference(standing.goalDifference)}
                    </TableCell>
                    <TableCell className="text-center font-bold text-lg text-white">{standing.points}</TableCell>
                    <TableCell className="text-white">
                      {getPositionBadge(standing.position)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
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

