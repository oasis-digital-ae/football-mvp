import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Button } from '@/shared/components/ui/button';
import { Badge } from '@/shared/components/ui/badge';
import { fixturesService } from '@/shared/lib/database';
import type { DatabaseFixture } from '@/shared/lib/database';
import ClickableTeamName from '@/shared/components/ClickableTeamName';
import TeamLogo from '@/shared/components/TeamLogo';

const MatchResultsPage: React.FC = () => {
  const [fixtures, setFixtures] = useState<DatabaseFixture[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'finished' | 'upcoming'>('all');

  useEffect(() => {
    loadFixtures();
  }, []);

  const loadFixtures = async () => {
    try {
      setLoading(true);
      const fixturesData = await fixturesService.getAll();
      setFixtures(fixturesData);
    } catch (error) {
      console.error('Error loading fixtures:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'scheduled':
        return <Badge variant="outline" className="text-blue-400 border-blue-400">Scheduled</Badge>;
      case 'closed':
        return <Badge variant="outline" className="text-yellow-400 border-yellow-400">Live</Badge>;
      case 'applied':
        return <Badge variant="outline" className="text-green-400 border-green-400">Finished</Badge>;
      case 'postponed':
        return <Badge variant="outline" className="text-red-400 border-red-400">Postponed</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getResultBadge = (result: string) => {
    switch (result) {
      case 'home_win':
        return <Badge variant="default" className="bg-green-600">Home Win</Badge>;
      case 'away_win':
        return <Badge variant="default" className="bg-blue-600">Away Win</Badge>;
      case 'draw':
        return <Badge variant="default" className="bg-gray-600">Draw</Badge>;
      case 'pending':
        return <Badge variant="outline" className="text-gray-400">Pending</Badge>;
      default:
        return <Badge variant="outline">{result}</Badge>;
    }
  };

  const filteredFixtures = fixtures.filter(fixture => {
    if (filter === 'finished') return fixture.status === 'applied';
    if (filter === 'upcoming') return fixture.status === 'scheduled';
    return true;
  });

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <div className="p-6">
        <Card className="bg-gray-800 border-gray-700">
          <CardContent className="p-8 text-center">
            <p className="text-gray-400">Loading fixtures...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-4 lg:p-6 space-y-4 sm:space-y-6">
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white gradient-text">Match Results</h1>
          <p className="text-gray-400 mt-1 text-sm sm:text-base">Track fixtures, results, and market impacts</p>
        </div>
        <div className="flex items-center space-x-2 text-sm text-gray-400">
          <div className="w-2 h-2 bg-trading-primary rounded-full animate-pulse"></div>
          <span>Live Updates</span>
        </div>
      </div>

      {/* Filter Controls */}
      <Card className="trading-card">
        <CardContent className="p-3 sm:p-4">
          <div className="flex flex-wrap gap-2 justify-center sm:justify-start">
            <Button 
              onClick={() => setFilter('all')} 
              variant={filter === 'all' ? 'default' : 'outline'}
              className={`text-sm font-semibold ${
                filter === 'all' 
                  ? 'bg-gradient-success hover:bg-gradient-success/80 text-white' 
                  : 'text-gray-300 hover:text-white hover:bg-white/10'
              }`}
            >
              All ({fixtures.length})
            </Button>
            <Button 
              onClick={() => setFilter('finished')} 
              variant={filter === 'finished' ? 'default' : 'outline'}
              className={`text-sm font-semibold ${
                filter === 'finished' 
                  ? 'bg-gradient-success hover:bg-gradient-success/80 text-white' 
                  : 'text-gray-300 hover:text-white hover:bg-white/10'
              }`}
            >
              Finished ({fixtures.filter(f => f.status === 'applied').length})
            </Button>
            <Button 
              onClick={() => setFilter('upcoming')} 
              variant={filter === 'upcoming' ? 'default' : 'outline'}
              className={`text-sm font-semibold ${
                filter === 'upcoming' 
                  ? 'bg-gradient-success hover:bg-gradient-success/80 text-white' 
                  : 'text-gray-300 hover:text-white hover:bg-white/10'
              }`}
            >
              Upcoming ({fixtures.filter(f => f.status === 'scheduled').length})
            </Button>
            <Button 
              onClick={loadFixtures} 
              variant="outline" 
              className="text-sm font-semibold text-gray-300 hover:text-white hover:bg-white/10"
            >
              Refresh
            </Button>
          </div>
        </CardContent>
      </Card>

      {filteredFixtures.length === 0 ? (
        <Card className="trading-card">
          <CardContent className="p-12 text-center">
            <div className="w-16 h-16 bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <p className="text-gray-400 text-lg font-medium mb-2">
              {filter === 'all' 
                ? 'No fixtures found'
                : `No ${filter} fixtures found`
              }
            </p>
            <p className="text-gray-500 text-sm">
              {filter === 'all' 
                ? 'Sync fixtures from the Football API Test page to see matches.'
                : 'Try selecting a different filter or sync more fixtures.'
              }
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredFixtures
            .sort((a, b) => new Date(a.kickoff_at).getTime() - new Date(b.kickoff_at).getTime())
            .map((fixture) => (
            <Card key={fixture.id} className="trading-card group">
              <CardContent className="p-4 sm:p-6">
                {/* Mobile-first header layout */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4 sm:mb-6">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-xs sm:text-sm text-gray-400 font-medium bg-gray-700/50 px-2 sm:px-3 py-1 rounded-full">
                      Matchday {fixture.matchday}
                    </div>
                    {getStatusBadge(fixture.status)}
                    {fixture.result !== 'pending' && getResultBadge(fixture.result)}
                  </div>
                  <div className="text-xs sm:text-sm text-gray-400 font-medium">
                    {formatDate(fixture.kickoff_at)}
                  </div>
                </div>
                
                {/* Mobile-first match content */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  {/* Home Team */}
                  <div className="flex-1 text-center sm:text-left">
                    <div className="text-sm sm:text-lg font-semibold text-white flex items-center justify-center sm:justify-start gap-2 sm:gap-3">
                      <div className="team-logo-container">
                        <TeamLogo 
                          teamName={fixture.home_team?.name || 'Home Team'} 
                          externalId={fixture.home_team?.external_id ? parseInt(fixture.home_team.external_id) : undefined}
                          size="sm" 
                        />
                      </div>
                      <ClickableTeamName
                        teamName={fixture.home_team?.name || 'Home Team'}
                        teamId={fixture.home_team?.external_id ? parseInt(fixture.home_team.external_id) : undefined}
                        className="hover:text-trading-primary transition-colors duration-200 text-xs sm:text-base"
                      />
                    </div>
                  </div>
                  
                  {/* Score Section */}
                  <div className="flex items-center justify-center gap-3 sm:gap-6">
                    <div className="text-2xl sm:text-4xl font-bold text-white bg-gradient-card px-3 sm:px-4 py-2 rounded-lg">
                      {fixture.home_score !== null ? fixture.home_score : '-'}
                    </div>
                    <div className="text-gray-400 font-semibold text-sm sm:text-base">vs</div>
                    <div className="text-2xl sm:text-4xl font-bold text-white bg-gradient-card px-3 sm:px-4 py-2 rounded-lg">
                      {fixture.away_score !== null ? fixture.away_score : '-'}
                    </div>
                  </div>
                  
                  {/* Away Team */}
                  <div className="flex-1 text-center sm:text-right">
                    <div className="text-sm sm:text-lg font-semibold text-white flex items-center justify-center sm:justify-end gap-2 sm:gap-3">
                      <ClickableTeamName
                        teamName={fixture.away_team?.name || 'Away Team'}
                        teamId={fixture.away_team?.external_id ? parseInt(fixture.away_team.external_id) : undefined}
                        className="hover:text-trading-primary transition-colors duration-200 text-xs sm:text-base"
                      />
                      <div className="team-logo-container">
                        <TeamLogo 
                          teamName={fixture.away_team?.name || 'Away Team'} 
                          externalId={fixture.away_team?.external_id ? parseInt(fixture.away_team.external_id) : undefined}
                          size="sm" 
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {fixture.status === 'scheduled' && (
                  <div className="mt-4 sm:mt-6 pt-3 sm:pt-4 border-t border-trading-primary/30">
                    <div className="text-center">
                      <div className="inline-flex items-center gap-2 bg-gradient-warning/20 text-warning px-3 sm:px-4 py-2 rounded-full text-xs sm:text-sm font-semibold">
                        <svg className="w-3 h-3 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Buy window closes: {formatDate(fixture.buy_close_at)}
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default MatchResultsPage;