import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, CardContent } from '@/shared/components/ui/card';
import { Button } from '@/shared/components/ui/button';
import { Badge } from '@/shared/components/ui/badge';
import { fixturesService } from '@/shared/lib/database';
import type { DatabaseFixtureWithTeams } from '@/shared/lib/database';
import ClickableTeamName from '@/shared/components/ClickableTeamName';
import TeamLogo from '@/shared/components/TeamLogo';
import { useAppContext } from '@/features/trading/contexts/AppContext';
import { PurchaseConfirmationModal } from './PurchaseConfirmationModal';
import { useToast } from '@/shared/hooks/use-toast';
import { useAuth } from '@/features/auth/contexts/AuthContext';

const MatchResultsPage: React.FC = () => {
  const { clubs, purchaseClub, refreshData } = useAppContext();
  const { toast } = useToast();
  const { refreshWalletBalance, user } = useAuth();  const [fixtures, setFixtures] = useState<DatabaseFixtureWithTeams[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'finished' | 'upcoming'>('upcoming');
  const [confirmationData, setConfirmationData] = useState<{
    clubId: string;
    clubName: string;
    externalId?: number;
    pricePerShare: number;
  } | null>(null);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [purchasingClubId, setPurchasingClubId] = useState<string | null>(null);

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
        return <Badge variant="outline" className="text-blue-400 border-blue-400/50 text-xs px-2 py-0.5">Scheduled</Badge>;
      case 'closed':
        return <Badge variant="outline" className="text-yellow-400 border-yellow-400/50 text-xs px-2 py-0.5 animate-pulse">Live</Badge>;
      case 'applied':
        return <Badge variant="outline" className="text-green-400 border-green-400/50 text-xs px-2 py-0.5">Finished</Badge>;
      case 'postponed':
        return <Badge variant="outline" className="text-red-400 border-red-400/50 text-xs px-2 py-0.5">Postponed</Badge>;
      default:
        return <Badge variant="outline" className="text-xs px-2 py-0.5">{status}</Badge>;
    }
  };  const filteredFixtures = fixtures.filter(fixture => {
    if (filter === 'finished') return fixture.status === 'applied';
    if (filter === 'upcoming') return fixture.status === 'scheduled' || fixture.status === 'closed';
    return true;
  });

  // Group fixtures by date
  const groupedFixtures = useMemo(() => {
    const groups: Record<string, DatabaseFixtureWithTeams[]> = {};
    
    // Group fixtures by date first
    filteredFixtures.forEach(fixture => {
      const date = new Date(fixture.kickoff_at);
      const dateKey = date.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });
      
      if (!groups[dateKey]) {
        groups[dateKey] = [];
      }
      groups[dateKey].push(fixture);
    });
    
    // Sort matches within each date group
    Object.keys(groups).forEach(dateKey => {
      groups[dateKey].sort((a, b) => {
        const aTime = new Date(a.kickoff_at).getTime();
        const bTime = new Date(b.kickoff_at).getTime();
        
        // If both are finished, sort in reverse chronological order (newest first)
        if (a.status === 'applied' && b.status === 'applied') {
          return bTime - aTime;
        }
        
        // Otherwise, sort in chronological order (oldest first)
        return aTime - bTime;
      });
    });
    
    // Sort date groups by date
    const groupEntries = Object.entries(groups).sort(([dateKeyA], [dateKeyB]) => {
      const dateA = new Date(dateKeyA);
      const dateB = new Date(dateKeyB);      // For finished matches, reverse chronological order (newest dates first)
      if (filter === 'finished') {
        return dateB.getTime() - dateA.getTime();
      }
      
      // For other filters, chronological order (oldest dates first)
      return dateA.getTime() - dateB.getTime();
    });
    
    // Build sorted groups object
    const sortedGroups: Record<string, DatabaseFixtureWithTeams[]> = {};
    groupEntries.forEach(([dateKey, fixtures]) => {
      sortedGroups[dateKey] = fixtures;
    });
    
    return sortedGroups;
  }, [filteredFixtures, filter]);

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      timeZone: 'Asia/Dubai'
    });
  };

  const formatDateHeader = (dateString: string) => {
    const date = new Date(dateString);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const dateStr = date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric' 
    });
    
    if (date.toDateString() === today.toDateString()) {
      return `Today, ${dateStr}`;
    } else if (date.toDateString() === tomorrow.toDateString()) {
      return `Tomorrow, ${dateStr}`;
    } else {
      return date.toLocaleDateString('en-US', { 
        weekday: 'short',
        month: 'short', 
        day: 'numeric' 
      });
    }
  };

  const handlePurchaseClick = useCallback((teamId: number, teamName: string, externalId?: number) => {
    // Prevent multiple clicks while a purchase is in progress
    if (isPurchasing) return;
    
    const club = clubs.find(c => c.id === teamId.toString());
    if (!club) {
      toast({
        title: "Team not found",
        description: "Unable to find team information. Please try again.",
        variant: "destructive",
      });
      return;
    }
    
    const pricePerShare = club.currentValue; // Use actual current value (NAV)
    
    setConfirmationData({
      clubId: teamId.toString(),
      clubName: teamName,
      externalId,
      pricePerShare
    });
  }, [clubs, isPurchasing, toast]);

  const confirmPurchase = useCallback(async (shares: number) => {
    if (!confirmationData || isPurchasing) return;
    
    setIsPurchasing(true);
    setPurchasingClubId(confirmationData.clubId);
    
    try {
      await purchaseClub(confirmationData.clubId, shares);
      setConfirmationData(null);
      
      // Immediately refresh wallet balance
      refreshWalletBalance();
      
      // Refresh all data (portfolio, clubs, etc.)
      await refreshData();
      
      // Double-check wallet balance after a short delay (for webhook updates)
      setTimeout(() => {
        refreshWalletBalance();
        refreshData();
      }, 1500);
      
      // Success toast is shown in AppContext.purchaseClub
    } catch (error: any) {
      console.error('Purchase failed:', error);
      
      // Extract user-friendly error message
      let errorMessage = 'An unknown error occurred';
      if (error?.message) {
        errorMessage = error.message;
      } else if (typeof error === 'string') {
        errorMessage = error;
      }
      
      // Show error toast with clear message
      toast({
        title: "Purchase Failed",
        description: errorMessage,
        variant: "destructive",
        duration: 5000,
      });
    } finally {
      setIsPurchasing(false);
      setPurchasingClubId(null);
    }
  }, [confirmationData, purchaseClub, toast, isPurchasing, refreshWalletBalance, refreshData]);

  if (loading) {
    return (
      <div className="p-4 lg:p-6 w-full max-w-full overflow-x-hidden">
        <Card className="trading-card">
          <CardContent className="p-8 text-center">
            <p className="text-gray-400">Loading fixtures...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-4 md:p-5 lg:p-6 space-y-4 sm:space-y-5 md:space-y-6 w-full max-w-full overflow-x-hidden">
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-white">Fixtures</h1>
          <p className="text-gray-400 mt-1 text-xs sm:text-sm">All matches and results</p>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="flex items-center space-x-2 text-xs text-gray-400">
            <div className="w-2 h-2 bg-trading-primary rounded-full animate-pulse"></div>
            <span>Live</span>
          </div>
          <Button 
            onClick={loadFixtures} 
            variant="outline" 
            size="sm"
            className="text-xs text-gray-300 hover:text-white hover:bg-white/10 touch-manipulation min-h-[44px] px-3"
          >
            Refresh
          </Button>
        </div>
      </div>      {/* Filter Controls */}
      <div className="flex flex-wrap gap-2">
        <Button 
          onClick={() => setFilter('all')} 
          variant={filter === 'all' ? 'default' : 'outline'}
          size="sm"
          className={`text-xs touch-manipulation min-h-[44px] px-3 ${
            filter === 'all' 
              ? 'bg-trading-primary hover:bg-trading-primary/80 text-white' 
              : 'text-gray-300 hover:text-white hover:bg-white/10'
          }`}
        >
          All ({fixtures.length})
        </Button>
        <Button 
          onClick={() => setFilter('finished')} 
          variant={filter === 'finished' ? 'default' : 'outline'}
          size="sm"
          className={`text-xs touch-manipulation min-h-[44px] px-3 ${
            filter === 'finished' 
              ? 'bg-trading-primary hover:bg-trading-primary/80 text-white' 
              : 'text-gray-300 hover:text-white hover:bg-white/10'
          }`}
        >
          Finished ({fixtures.filter(f => f.status === 'applied').length})
        </Button>
        <Button 
          onClick={() => setFilter('upcoming')} 
          variant={filter === 'upcoming' ? 'default' : 'outline'}
          size="sm"
          className={`text-xs touch-manipulation min-h-[44px] px-3 ${
            filter === 'upcoming' 
              ? 'bg-trading-primary hover:bg-trading-primary/80 text-white' 
              : 'text-gray-300 hover:text-white hover:bg-white/10'
          }`}
        >
          Upcoming ({fixtures.filter(f => f.status === 'scheduled' || f.status === 'closed').length})
        </Button>
      </div>

      {filteredFixtures.length === 0 ? (
        <Card className="trading-card">
          <CardContent className="p-12 text-center">
            <div className="w-16 h-16 bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>            </div>            <p className="text-gray-400 text-lg font-medium mb-2">
              {filter === 'all' 
                ? 'No fixtures found'
                : `No ${filter} fixtures found`
              }
            </p>
            <p className="text-gray-500 text-sm">
              {filter === 'all' 
                ? 'Sync fixtures from the Football API Test page to see matches.'
                : `There are no ${filter} matches at the moment.`
              }
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {Object.entries(groupedFixtures).map(([dateKey, dateFixtures]) => (
            <div key={dateKey} className="space-y-3">
              {/* Date Header */}
              <div className="flex items-center gap-3">
                <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">
                  {formatDateHeader(dateFixtures[0].kickoff_at)}
                </h2>
                <div className="flex-1 h-px bg-gray-700"></div>
                <span className="text-xs text-gray-500">
                  {dateFixtures.length} {dateFixtures.length === 1 ? 'match' : 'matches'}
                </span>
              </div>

              {/* Fixtures for this date */}
              <Card className="trading-card overflow-hidden">
                <CardContent className="p-0">
                  <div className="divide-y divide-gray-700/50">
                    {dateFixtures.map((fixture, idx) => (                      <div 
                        key={fixture.id} 
                        className={`p-3 sm:p-4 hover:bg-gray-800/30 transition-colors ${
                          fixture.status === 'closed' ? 'bg-red-500/5 border-l-4 border-l-red-500' : ''
                        }`}
                      >
                        {/* Mobile Layout */}
                        <div className="md:hidden space-y-3">
                          {/* Header: Matchday & Status */}
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div className="text-xs text-gray-500 font-mono">
                                MD{fixture.matchday}
                              </div>
                              {getStatusBadge(fixture.status)}
                            </div>
                            {fixture.status === 'scheduled' && fixture.buy_close_at && (
                              <div className="text-xs text-gray-500">
                                Closes {formatTime(fixture.buy_close_at)}
                              </div>
                            )}
                          </div>

                          {/* Match Display */}
                          <div className="bg-gray-800/40 rounded-lg p-3 border border-gray-700/30">
                            {/* Home Team Row */}
                            <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <TeamLogo 
                                teamName={fixture.home_team?.name || 'Home Team'} 
                                externalId={fixture.home_team?.external_id ? parseInt(fixture.home_team.external_id) : undefined}
                                size="sm" 
                              />
                              <ClickableTeamName
                                teamName={fixture.home_team?.name || 'Home Team'}
                                teamId={fixture.home_team_id}
                                externalId={fixture.home_team?.external_id ? parseInt(fixture.home_team.external_id) : undefined}
                                userId={user?.id}
                                variant="default"
                                className="text-sm font-semibold text-white hover:text-trading-primary transition-colors truncate text-left"
                              />                            </div>
                              {(fixture.status === 'applied' || fixture.status === 'closed') && fixture.home_score !== null ? (
                                <span className={`text-lg font-bold ml-2 ${
                                  fixture.status === 'applied' && fixture.result === 'home_win' ? 'text-green-400' : 
                                  fixture.status === 'applied' && fixture.result === 'away_win' ? 'text-gray-400' : 'text-white'
                                }`}>
                                  {fixture.home_score}
                                </span>
                              ) : (
                                fixture.home_team_id && (
                                  <Button
                                    onClick={() => handlePurchaseClick(
                                      fixture.home_team_id,
                                      fixture.home_team?.name || 'Home Team',
                                      fixture.home_team?.external_id ? parseInt(fixture.home_team.external_id) : undefined
                                    )}
                                    size="sm"
                                    disabled={isPurchasing || purchasingClubId === fixture.home_team_id.toString()}
                                    className="bg-[#10B981] hover:bg-[#059669] text-white font-medium px-3 py-1.5 text-xs rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed touch-manipulation min-h-[36px] ml-2 flex-shrink-0"
                                    title="Buy shares"
                                  >
                                    {isPurchasing && purchasingClubId === fixture.home_team_id.toString() ? '...' : 'Buy'}
                                  </Button>
                                )
                              )}
                            </div>                            {/* Score/Time Divider */}
                            {(fixture.status === 'applied' || fixture.status === 'closed') && fixture.home_score !== null && fixture.away_score !== null ? (
                              <div className="flex items-center justify-center py-2 mb-2">
                                <div className="flex items-center gap-2">
                                  <span className={`text-xl font-bold ${
                                    fixture.status === 'applied' && fixture.result === 'home_win' ? 'text-green-400' : 
                                    fixture.status === 'applied' && fixture.result === 'away_win' ? 'text-gray-400' : 'text-white'
                                  }`}>
                                    {fixture.home_score}
                                  </span>
                                  <span className="text-gray-500">-</span>
                                  <span className={`text-xl font-bold ${
                                    fixture.status === 'applied' && fixture.result === 'away_win' ? 'text-green-400' : 
                                    fixture.status === 'applied' && fixture.result === 'home_win' ? 'text-gray-400' : 'text-white'
                                  }`}>
                                    {fixture.away_score}
                                  </span>
                                </div>
                                {fixture.status === 'closed' && (
                                  <Badge variant="outline" className="ml-2 text-yellow-400 border-yellow-400/50 text-[10px] px-1.5 py-0 animate-pulse">
                                    LIVE
                                  </Badge>
                                )}
                              </div>
                            ) : (
                              <div className="text-center py-2 mb-2 border-y border-gray-700/30">
                                <span className="text-sm text-gray-400 font-mono">
                                  {formatTime(fixture.kickoff_at)}
                                </span>
                              </div>
                            )}

                            {/* Away Team Row */}
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2 flex-1 min-w-0">
                                <TeamLogo 
                                  teamName={fixture.away_team?.name || 'Away Team'} 
                                  externalId={fixture.away_team?.external_id ? parseInt(fixture.away_team.external_id) : undefined}
                                  size="sm" 
                                />
                                <ClickableTeamName
                                  teamName={fixture.away_team?.name || 'Away Team'}
                                  teamId={fixture.away_team_id}
                                  externalId={fixture.away_team?.external_id ? parseInt(fixture.away_team.external_id) : undefined}
                                  userId={user?.id}
                                  variant="default"
                                  className="text-sm font-semibold text-white hover:text-trading-primary transition-colors truncate text-left"
                                />                              </div>
                              {(fixture.status === 'applied' || fixture.status === 'closed') && fixture.away_score !== null ? (
                                <span className={`text-lg font-bold ml-2 ${
                                  fixture.status === 'applied' && fixture.result === 'away_win' ? 'text-green-400' : 
                                  fixture.status === 'applied' && fixture.result === 'home_win' ? 'text-gray-400' : 'text-white'
                                }`}>
                                  {fixture.away_score}
                                </span>
                              ) : (
                                fixture.away_team_id && (
                                  <Button
                                    onClick={() => handlePurchaseClick(
                                      fixture.away_team_id,
                                      fixture.away_team?.name || 'Away Team',
                                      fixture.away_team?.external_id ? parseInt(fixture.away_team.external_id) : undefined
                                    )}
                                    size="sm"
                                    disabled={isPurchasing || purchasingClubId === fixture.away_team_id.toString()}
                                    className="bg-[#10B981] hover:bg-[#059669] text-white font-medium px-3 py-1.5 text-xs rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed touch-manipulation min-h-[36px] ml-2 flex-shrink-0"
                                    title="Buy shares"
                                  >
                                    {isPurchasing && purchasingClubId === fixture.away_team_id.toString() ? '...' : 'Buy'}
                                  </Button>
                                )
                              )}
                            </div>
                          </div>
                        </div>{/* Desktop/Tablet Layout */}
                        <div className="hidden md:grid grid-cols-[140px_50px_1fr_32px_80px_32px_1fr_50px_120px] items-center gap-2">
                          {/* Left: Matchday & Status */}
                          <div className="flex items-center gap-3">
                            <div className="text-xs text-gray-500 font-mono">
                              MD{fixture.matchday}
                            </div>
                            {getStatusBadge(fixture.status)}
                          </div>                          {/* Home Buy Button */}
                          <div className="flex justify-end -mr-1">
                            {fixture.home_team_id && fixture.status !== 'applied' && fixture.status !== 'closed' && (
                              <Button
                                onClick={() => handlePurchaseClick(
                                  fixture.home_team_id,
                                  fixture.home_team?.name || 'Home Team',
                                  fixture.home_team?.external_id ? parseInt(fixture.home_team.external_id) : undefined
                                )}
                                size="sm"
                                disabled={isPurchasing || purchasingClubId === fixture.home_team_id.toString()}
                                className="bg-[#10B981] hover:bg-[#059669] text-white font-medium px-2 py-1 text-xs rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed h-7 touch-manipulation w-full"
                                title="Buy shares"
                              >
                                {isPurchasing && purchasingClubId === fixture.home_team_id.toString() ? '...' : 'Buy'}
                              </Button>
                            )}
                          </div>

                          {/* Home Team Name */}
                          <div className="flex items-center gap-2 justify-end overflow-hidden -ml-1">
                            <ClickableTeamName
                              teamName={fixture.home_team?.name || 'Home Team'}
                              teamId={fixture.home_team_id}
                              externalId={fixture.home_team?.external_id ? parseInt(fixture.home_team.external_id) : undefined}
                              userId={user?.id}
                              variant="default"
                              className="text-sm font-medium text-white hover:text-trading-primary transition-colors text-right truncate"
                            />
                          </div>

                          {/* Home Team Logo */}
                          <div className="flex justify-center">
                            <TeamLogo 
                              teamName={fixture.home_team?.name || 'Home Team'} 
                              externalId={fixture.home_team?.external_id ? parseInt(fixture.home_team.external_id) : undefined}
                              size="sm" 
                            />
                          </div>                          {/* Score/Time */}
                          <div className="flex items-center gap-2 justify-center">
                            {(fixture.status === 'applied' || fixture.status === 'closed') && fixture.home_score !== null && fixture.away_score !== null ? (
                              <>
                                <span className={`text-lg font-bold ${
                                  fixture.status === 'applied' && fixture.result === 'home_win' ? 'text-green-400' : 
                                  fixture.status === 'applied' && fixture.result === 'away_win' ? 'text-gray-400' : 'text-white'
                                }`}>
                                  {fixture.home_score}
                                </span>
                                <span className="text-gray-500 text-xs">-</span>
                                <span className={`text-lg font-bold ${
                                  fixture.status === 'applied' && fixture.result === 'away_win' ? 'text-green-400' : 
                                  fixture.status === 'applied' && fixture.result === 'home_win' ? 'text-gray-400' : 'text-white'
                                }`}>
                                  {fixture.away_score}
                                </span>
                              </>
                            ) : (
                              <span className="text-xs text-gray-500 font-mono">
                                {formatTime(fixture.kickoff_at)}
                              </span>
                            )}
                          </div>

                          {/* Away Team Logo */}
                          <div className="flex justify-center">
                            <TeamLogo 
                              teamName={fixture.away_team?.name || 'Away Team'} 
                              externalId={fixture.away_team?.external_id ? parseInt(fixture.away_team.external_id) : undefined}
                              size="sm" 
                            />
                          </div>
                          {/* Away Team Name */}
                          <div className="flex items-center gap-2 justify-start overflow-hidden -mr-1">
                            <ClickableTeamName
                              teamName={fixture.away_team?.name || 'Away Team'}
                              teamId={fixture.away_team_id}
                              externalId={fixture.away_team?.external_id ? parseInt(fixture.away_team.external_id) : undefined}
                              userId={user?.id}
                              variant="default"
                              className="text-sm font-medium text-white hover:text-trading-primary transition-colors text-left truncate"
                            />
                          </div>                          {/* Away Buy Button */}
                          <div className="flex justify-start -ml-1">
                            {fixture.away_team_id && fixture.status !== 'applied' && fixture.status !== 'closed' && (
                              <Button
                                onClick={() => handlePurchaseClick(
                                  fixture.away_team_id,
                                  fixture.away_team?.name || 'Away Team',
                                  fixture.away_team?.external_id ? parseInt(fixture.away_team.external_id) : undefined
                                )}
                                size="sm"
                                disabled={isPurchasing || purchasingClubId === fixture.away_team_id.toString()}
                                className="bg-[#10B981] hover:bg-[#059669] text-white font-medium px-2 py-1 text-xs rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed h-7 touch-manipulation w-full"
                                title="Buy shares"
                              >
                                {isPurchasing && purchasingClubId === fixture.away_team_id.toString() ? '...' : 'Buy'}
                              </Button>
                            )}
                          </div>

                          {/* Right: Buy Window Info (for scheduled matches) */}
                          <div className="min-w-[120px] text-right">
                            {fixture.status === 'scheduled' && fixture.buy_close_at && (
                              <div className="text-xs text-gray-500">
                                Closes {formatTime(fixture.buy_close_at)}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          ))}
        </div>
      )}

      {/* Purchase Confirmation Modal */}
      <PurchaseConfirmationModal
        isOpen={confirmationData !== null}
        onClose={() => setConfirmationData(null)}
        onConfirm={confirmPurchase}
        clubName={confirmationData?.clubName || ''}
        clubId={confirmationData?.clubId}
        externalId={confirmationData?.externalId}
        pricePerShare={confirmationData?.pricePerShare || 0}
        isProcessing={isPurchasing}
      />
    </div>
  );
};

export default MatchResultsPage;