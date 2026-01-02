import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog';
import { Badge } from '@/shared/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { formatCurrency } from '@/shared/lib/formatters';
import { fixturesService, teamsService } from '@/shared/lib/database';
import type { DatabaseFixture, DatabaseTeam } from '@/shared/lib/database';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { fromCents } from '@/shared/lib/utils/decimal';

interface MatchHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  clubId: string;
  clubName: string;
}

interface MatchWithPriceImpact {
  fixture: DatabaseFixture;
  opponent: string;
  isHome: boolean;
  result: 'win' | 'loss' | 'draw';
  score: string;
  preMatchCap: number;
  postMatchCap: number;
  priceImpact: number;
  priceImpactPercent: number;
}

export const MatchHistoryModal: React.FC<MatchHistoryModalProps> = ({
  isOpen,
  onClose,
  clubId,
  clubName
}) => {
  const [matches, setMatches] = useState<MatchWithPriceImpact[]>([]);
  const [loading, setLoading] = useState(false);
  const [teams, setTeams] = useState<DatabaseTeam[]>([]);

  useEffect(() => {
    if (isOpen && clubId) {
      loadMatchHistory();
    }
  }, [isOpen, clubId]);

  const loadMatchHistory = async () => {
    setLoading(true);
    try {
      // Load fixtures and teams
      const [fixturesData, teamsData] = await Promise.all([
        fixturesService.getAll(),
        teamsService.getAll()
      ]);

      setTeams(teamsData);

      // Filter fixtures for this club that have been completed
      const clubFixtures = fixturesData.filter(fixture => 
        (fixture.home_team_id === clubId || fixture.away_team_id === clubId) &&
        fixture.status === 'applied' && 
        fixture.result !== 'pending' &&
        fixture.snapshot_home_cap !== null &&
        fixture.snapshot_away_cap !== null
      );

      // Process each fixture to calculate price impacts
      const matchesWithImpacts: MatchWithPriceImpact[] = clubFixtures.map(fixture => {
        const isHome = fixture.home_team_id === clubId;
        const opponent = isHome ? 
          teamsData.find(t => t.id === fixture.away_team_id)?.name || 'Unknown' :
          teamsData.find(t => t.id === fixture.home_team_id)?.name || 'Unknown';

        // Get current team data to calculate current market cap
        const currentTeam = teamsData.find(t => t.id === clubId);
        const currentMarketCap = fromCents(currentTeam?.market_cap || 0).toNumber();

        // Calculate pre-match market cap from snapshot (convert from cents to dollars)
        const preMatchCap = fromCents(isHome ? 
          (fixture.snapshot_home_cap || 0) : 
          (fixture.snapshot_away_cap || 0)
        ).toNumber();

        // Calculate post-match market cap based on result
        let postMatchCap = preMatchCap;
        let result: 'win' | 'loss' | 'draw' = 'draw';
        let priceImpact = 0;
        let priceImpactPercent = 0;

        if (fixture.result === 'home_win') {
          if (isHome) {
            result = 'win';
            // Winner gets 10% of loser's market cap
            const loserCap = fromCents(fixture.snapshot_away_cap || 0).toNumber();
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
            const loserCap = fromCents(fixture.snapshot_home_cap || 0).toNumber();
            priceImpact = loserCap * 0.10;
            postMatchCap = preMatchCap + priceImpact;
          }
        } else {
          result = 'draw';
          priceImpact = 0;
          postMatchCap = preMatchCap;
        }

        priceImpactPercent = preMatchCap > 0 ? (priceImpact / preMatchCap) * 100 : 0;

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
          priceImpactPercent
        };
      });

      // Sort by kickoff date (most recent first)
      matchesWithImpacts.sort((a, b) => 
        new Date(b.fixture.kickoff_at).getTime() - new Date(a.fixture.kickoff_at).getTime()
      );

      setMatches(matchesWithImpacts);
    } catch (error) {
      console.error('Error loading match history:', error);
    } finally {
      setLoading(false);
    }
  };

  const getResultIcon = (result: 'win' | 'loss' | 'draw') => {
    switch (result) {
      case 'win':
        return <TrendingUp className="h-4 w-4 text-green-400" />;
      case 'loss':
        return <TrendingDown className="h-4 w-4 text-red-400" />;
      case 'draw':
        return <Minus className="h-4 w-4 text-gray-400" />;
    }
  };

  const getResultBadge = (result: 'win' | 'loss' | 'draw') => {
    switch (result) {
      case 'win':
        return <Badge className="bg-green-600 text-white">W</Badge>;
      case 'loss':
        return <Badge className="bg-red-600 text-white">L</Badge>;
      case 'draw':
        return <Badge className="bg-gray-600 text-white">D</Badge>;
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-gray-800 border-gray-700 text-white max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl flex items-center gap-2">
            {getResultIcon('win')}
            {clubName} - Match History & Share Price Impact
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="text-gray-400">Loading match history...</div>
          </div>
        ) : matches.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-400">No completed matches found</p>
            <p className="text-sm text-gray-500 mt-2">
              Matches will appear here once they are completed and market cap transfers are applied.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {matches.map((match, index) => (
              <Card key={match.fixture.id} className="bg-gray-700 border-gray-600">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="text-sm text-gray-400">
                        {formatDate(match.fixture.kickoff_at)}
                      </div>
                      <div className="font-medium">
                        {match.isHome ? 'vs' : '@'} {match.opponent}
                      </div>
                      <div className="text-sm font-mono text-gray-300">
                        {match.score}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {getResultBadge(match.result)}
                      <Badge variant="outline" className="text-xs">
                        Matchday {match.fixture.matchday}
                      </Badge>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                    <div className="space-y-1">
                      <div className="text-gray-400">Pre-Match Market Cap</div>
                      <div className="font-medium">{formatCurrency(match.preMatchCap)}</div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-gray-400">Post-Match Market Cap</div>
                      <div className="font-medium">{formatCurrency(match.postMatchCap)}</div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-gray-400">Price Impact</div>
                      <div className={`font-medium flex items-center gap-1 ${
                        match.priceImpact > 0 ? 'text-green-400' : 
                        match.priceImpact < 0 ? 'text-red-400' : 'text-gray-400'
                      }`}>
                        {getResultIcon(match.result)}
                        {match.priceImpact > 0 ? '+' : ''}{formatCurrency(match.priceImpact)}
                        <span className="text-xs">
                          ({match.priceImpactPercent > 0 ? '+' : ''}{match.priceImpactPercent.toFixed(2)}%)
                        </span>
                      </div>
                    </div>
                  </div>

                  {match.result !== 'draw' && (
                    <div className="mt-3 pt-3 border-t border-gray-600">
                      <div className="text-xs text-gray-400">
                        {match.result === 'win' 
                          ? `Gained 10% of ${match.opponent}'s market cap`
                          : `Lost 10% of own market cap`
                        }
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};