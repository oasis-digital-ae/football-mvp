import React, { useState, useEffect } from 'react';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Badge } from '@/shared/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/components/ui/tabs';
import { teamsService, fixturesService, positionsService } from '@/shared/lib/database';
import { matchProcessingService } from '@/shared/lib/match-processing';
import { teamStateSnapshotService } from '@/shared/lib/team-state-snapshots';
import { useAuth } from '@/features/auth/contexts/AuthContext';
import { supabase } from '@/shared/lib/supabase';

const SeasonSimulation: React.FC = () => {
    const { user } = useAuth();
    const [isLoading, setIsLoading] = useState(false);
    const [simulationResults, setSimulationResults] = useState<string>('');
    const [availableGames, setAvailableGames] = useState<any[]>([]);
    const [playedGames, setPlayedGames] = useState<any[]>([]);
    const [selectedGameId, setSelectedGameId] = useState<string>('');
    const [nextGame, setNextGame] = useState<any>(null);
    const [teams, setTeams] = useState<any[]>([]);

    // Load available games on component mount
    useEffect(() => {
        loadAvailableGames();
    }, []);

    const loadAvailableGames = async () => {
        try {
            const [fixtures, teamsData] = await Promise.all([
                fixturesService.getAll(),
                teamsService.getAll()
            ]);
            
            setTeams(teamsData);
            
            if (fixtures) {
                
                
                // Separate played games (have snapshot data) from available games
                const playedGamesList = fixtures.filter(f => 
                    f.status === 'applied' && 
                    f.result !== 'pending' &&
                    f.snapshot_home_cap !== null &&
                    f.snapshot_away_cap !== null
                );
                
                // Get games that can be simulated (all games except played ones)
                const simulatableGames = fixtures.filter(f => 
                    !playedGamesList.some(pg => pg.id === f.id) // Exclude already played games
                );
                
                setPlayedGames(playedGamesList);
                setAvailableGames(simulatableGames);
                
                // Find the next game (earliest kickoff time)
                if (simulatableGames.length > 0) {
                    const sortedGames = simulatableGames.sort((a, b) => 
                        new Date(a.kickoff_at).getTime() - new Date(b.kickoff_at).getTime()
                    );
                    setNextGame(sortedGames[0]);
                    setSelectedGameId(sortedGames[0].id.toString());
                }
            }
        } catch (error) {
            console.error('Error loading available games:', error);
        }
    };

    const simulateSingleGame = async (gameId?: string) => {
        if (!user) {
            setSimulationResults('❌ You must be logged in to run simulation');
            return;
        }

        setIsLoading(true);
        setSimulationResults('');

        try {
            const gameToSimulate = gameId ? 
                availableGames.find(g => g.id === gameId) : 
                nextGame;

            if (!gameToSimulate) {
                setSimulationResults('❌ No game selected for simulation');
                return;
            }

            // Simulate realistic result based on market caps
            const teams = await teamsService.getAll();
            const homeTeam = teams.find(t => t.id === gameToSimulate.home_team_id);
            const awayTeam = teams.find(t => t.id === gameToSimulate.away_team_id);

            if (!homeTeam || !awayTeam) {
                setSimulationResults('❌ Team data not found');
                return;
            }

            const homeMarketCap = homeTeam.market_cap;
            const awayMarketCap = awayTeam.market_cap;
            
            
            // Higher market cap = slightly higher chance to score more goals
            const homeWinProb = homeMarketCap / (homeMarketCap + awayMarketCap);
            
            // Generate base scores (0-3 goals each)
            let homeScore = Math.floor(Math.random() * 4);
            let awayScore = Math.floor(Math.random() * 4);
            
            // Adjust scores slightly based on market cap difference (but keep it realistic)
            const marketCapDiff = Math.abs(homeMarketCap - awayMarketCap);
            const maxAdjustment = Math.min(1, Math.floor(marketCapDiff / 20)); // Max 1 goal adjustment
            
            if (homeWinProb > 0.6 && Math.random() < 0.3) {
                // Home team slightly favored, small chance to score 1 more
                homeScore = Math.min(3, homeScore + maxAdjustment);
            } else if (homeWinProb < 0.4 && Math.random() < 0.3) {
                // Away team slightly favored, small chance to score 1 more
                awayScore = Math.min(3, awayScore + maxAdjustment);
            }
            
            // Determine result based on actual scores
            let result: 'home_win' | 'away_win' | 'draw';
            if (homeScore > awayScore) {
                result = 'home_win';
            } else if (awayScore > homeScore) {
                result = 'away_win';
            } else {
                result = 'draw';
            }

            // Update the fixture with simulated result
            const { error } = await supabase
                .from('fixtures')
                .update({
                    status: 'applied',
                    result: result,
                    home_score: homeScore,
                    away_score: awayScore,
                    snapshot_home_cap: homeTeam.market_cap,
                    snapshot_away_cap: awayTeam.market_cap
                })
                .eq('id', gameToSimulate.id);

            if (error) {
                setSimulationResults(`❌ Error updating fixture: ${error.message}`);
            } else {
                // Process the match result immediately to update market caps
                try {
                    await teamsService.captureMarketCapSnapshot(gameToSimulate.id);
                    await teamsService.processMatchResult(gameToSimulate.id);
                    
                    // Reload teams to show updated market caps
                    const updatedTeams = await teamsService.getAll();
                    const updatedHomeTeam = updatedTeams.find(t => t.id === homeTeam.id);
                    const updatedAwayTeam = updatedTeams.find(t => t.id === awayTeam.id);
                    
                    let marketCapUpdate = '';
            if (updatedHomeTeam && updatedAwayTeam) {
                        const homePrice = updatedHomeTeam.shares_outstanding > 0 ? updatedHomeTeam.market_cap / updatedHomeTeam.shares_outstanding : 20;
                        const awayPrice = updatedAwayTeam.shares_outstanding > 0 ? updatedAwayTeam.market_cap / updatedAwayTeam.shares_outstanding : 20;
                        
                        marketCapUpdate = `\n📊 Market Cap Updates:\n`;
                        marketCapUpdate += `• ${homeTeam.name}: $${homeTeam.market_cap.toFixed(2)} → $${updatedHomeTeam.market_cap.toFixed(2)} (Price: $${homePrice.toFixed(2)})\n`;
                        marketCapUpdate += `• ${awayTeam.name}: $${awayTeam.market_cap.toFixed(2)} → $${updatedAwayTeam.market_cap.toFixed(2)} (Price: $${awayPrice.toFixed(2)})\n`;
                    }
                    
                    setSimulationResults(`✅ ${homeTeam.name} vs ${awayTeam.name}: ${homeScore}-${awayScore} (${result})${marketCapUpdate}\n\n🎉 Match processed! Market caps updated based on result.`);
                    
                    // Refresh fixtures in ClubValuesPage to update games played count
                    if ((window as any).refreshClubValuesFixtures) {
                        await (window as any).refreshClubValuesFixtures();
                    }
                    
                    // Refresh available games to move the played game to the played tab
            await loadAvailableGames();
                } catch (processError) {
                    setSimulationResults(`✅ ${homeTeam.name} vs ${awayTeam.name}: ${homeScore}-${awayScore} (${result})\n\n❌ Error processing match result: ${processError}`);
                }
            }

        } catch (error) {
            setSimulationResults(`❌ Simulation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        } finally {
            setIsLoading(false);
        }
    };

    const simulateNextGame = async () => {
        if (nextGame) {
            await simulateSingleGame(nextGame.id);
        } else {
            setSimulationResults('❌ No next game available');
        }
    };




    const resetAllProfilesAndInvestments = async () => {
        if (!user) return;

        // Show confirmation dialog
        const confirmed = window.confirm(
            '⚠️ WARNING: This will permanently delete ALL user profiles!\n\n' +
            'This action will:\n' +
            '• Delete all user profiles from the database\n' +
            '• Delete all user positions and investments (cascaded)\n' +
            '• Delete all user orders (cascaded)\n\n' +
            'This action CANNOT be undone!\n\n' +
            'Are you sure you want to continue?'
        );

        if (!confirmed) return;

        setIsLoading(true);
        setSimulationResults(''); // Clear previous results
        
        try {
            console.log('Starting profile deletion with TRUNCATE...');
            
            // First, let's check what exists before deletion
            const { data: profilesBefore, error: profilesBeforeError } = await supabase
                .from('profiles')
                .select('id, username')
                .limit(100);
            
            const { data: positionsBefore, error: positionsBeforeError } = await supabase
                .from('positions')
                .select('id, user_id')
                .limit(100);
            
            const { data: ordersBefore, error: ordersBeforeError } = await supabase
                .from('orders')
                .select('id, user_id')
                .limit(100);

            console.log('Before deletion:', {
                profiles: profilesBefore?.length || 0,
                positions: positionsBefore?.length || 0,
                orders: ordersBefore?.length || 0
            });

            // Use TRUNCATE to delete all profiles (cascades to positions and orders)
            const { error: truncateError } = await supabase
                .rpc('truncate_profiles_table');

            console.log('TRUNCATE result:', { truncateError });

            // Note: total_ledger is not touched by this reset function

            // Verify deletion by checking what's left
            const { data: profilesAfter, error: profilesAfterError } = await supabase
                .from('profiles')
                .select('id')
                .limit(10);
            
            const { data: positionsAfter, error: positionsAfterError } = await supabase
                .from('positions')
                .select('id')
                .limit(10);
            
            const { data: ordersAfter, error: ordersAfterError } = await supabase
                .from('orders')
                .select('id')
                .limit(10);

            console.log('After deletion:', {
                profiles: profilesAfter?.length || 0,
                positions: positionsAfter?.length || 0,
                orders: ordersAfter?.length || 0
            });

            // Check for errors and provide feedback
            if (truncateError) {
                console.error('Error truncating profiles table:', truncateError);
                setSimulationResults(`❌ Error deleting profiles: ${truncateError.message}`);
            } else {
                const profilesDeleted = (profilesBefore?.length || 0) - (profilesAfter?.length || 0);
                const positionsDeleted = (positionsBefore?.length || 0) - (positionsAfter?.length || 0);
                const ordersDeleted = (ordersBefore?.length || 0) - (ordersAfter?.length || 0);
                
                setSimulationResults(`✅ Successfully deleted all profiles and investments!\n🗑️ Profiles deleted: ${profilesDeleted}\n📊 Positions deleted: ${positionsDeleted}\n📋 Orders deleted: ${ordersDeleted}\n\nBefore: P:${profilesBefore?.length || 0}, Pos:${positionsBefore?.length || 0}, O:${ordersBefore?.length || 0}\nAfter: P:${profilesAfter?.length || 0}, Pos:${positionsAfter?.length || 0}, O:${ordersAfter?.length || 0}`);
            }
            
        } catch (error) {
            console.error('Unexpected error during reset:', error);
            setSimulationResults(`❌ Unexpected error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        } finally {
            setIsLoading(false);
        }
    };
    
    const resetMarketplaceComplete = async () => {
        if (!user) return;

        setIsLoading(true);
        try {
            // Call the complete reset function
            const { data, error } = await supabase.rpc('reset_marketplace_complete');
            
            if (error) {
                throw error;
            }
            
            setSimulationResults(`✅ ${data}`);
            
            // Refresh available games to show updated data
            await loadAvailableGames();
            
        } catch (error) {
            console.error('Error resetting marketplace:', error);
            setSimulationResults(`❌ Marketplace reset failed: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
            setIsLoading(false);
        }
    };
    
    const resetMarketCapsOnly = async () => {
        if (!user) return;

        setIsLoading(true);
        try {
            // Reset market caps
            await teamsService.resetMarketCapsOnly();
            
            // Reset shares outstanding to 5 for all teams (individual updates for better error handling)
            const teams = await teamsService.getAll();
            let sharesUpdateSuccess = 0;
            let sharesUpdateErrors = 0;
            
            for (const team of teams) {
                const { error } = await supabase
                    .from('teams')
                    .update({
                        shares_outstanding: 5,
                        total_shares: 5,
                        available_shares: 5
                    })
                    .eq('id', team.id);
                
                if (error) {
                    sharesUpdateErrors++;
                } else {
                    sharesUpdateSuccess++;
                }
            }
            
            
            // Reset all fixtures to scheduled status and clear snapshot data
            const { error: fixturesError, data: fixturesData } = await supabase
                .from('fixtures')
                .update({
                    status: 'scheduled',
                    result: 'pending',
                    home_score: null,
                    away_score: null,
                    snapshot_home_cap: null,
                    snapshot_away_cap: null
                })
                .neq('id', 0); // Update all fixtures
            
            // TRUNCATE the entire team_state_snapshots table for a fresh start
            const { error: snapshotsError } = await supabase
                .from('team_state_snapshots')
                .delete()
                .neq('id', 0); // Delete all snapshots (truncate equivalent)
            
            // Create fresh initial snapshots for all teams using direct SQL
            // This bypasses the function and creates snapshots directly
            let initialSnapshotsCreated = 0;
            for (const team of teams) {
                try {
                    const { error } = await supabase
                        .from('team_state_snapshots')
                        .insert({
                            team_id: team.id,
                            snapshot_type: 'initial',
                            trigger_event_type: 'manual',
                            market_cap: team.market_cap,
                            shares_outstanding: team.shares_outstanding,
                            current_share_price: team.shares_outstanding > 0 ? team.market_cap / team.shares_outstanding : 20.00,
                            price_impact: 0,
                            shares_traded: 0,
                            trade_amount: 0,
                            effective_at: new Date().toISOString()
                        });
                    
                    if (!error) {
                        initialSnapshotsCreated++;
                    } else {
                        console.error(`Failed to create initial snapshot for team ${team.id}:`, error);
                    }
                } catch (error) {
                    console.error(`Failed to create initial snapshot for team ${team.id}:`, error);
                }
            }
            
            if (fixturesError || sharesUpdateErrors > 0 || snapshotsError) {
                setSimulationResults(`💰 Market caps reset to $100! 📊 Shares reset: ${sharesUpdateSuccess}/${teams.length} successful! ⚠️ ${sharesUpdateErrors} teams failed to update shares. 📈 Snapshots: ${initialSnapshotsCreated}/${teams.length} created.\n`);
            } else {
                setSimulationResults('💰 Market caps reset to $100! 📊 Shares outstanding reset to 5! ⚽ All games reset to scheduled status. 📈 All snapshots TRUNCATED and fresh initial snapshots created!\n');
            }
            
            // Refresh available games to show updated data
            await loadAvailableGames();
        } catch (error) {
            console.error('Market cap reset error:', error);
            setSimulationResults(`❌ Market cap reset failed: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="p-6 space-y-6">
            {/* Per-Game Simulation Card */}
            <Card>
                <CardHeader>
                    <CardTitle>⚽ Per-Game Simulation</CardTitle>
                </CardHeader>
                <CardContent>
                    <Tabs defaultValue="available" className="w-full">
                        <TabsList className="grid w-full grid-cols-2">
                            <TabsTrigger value="available">Available Games ({availableGames.length})</TabsTrigger>
                            <TabsTrigger value="played">Games Played ({playedGames.length})</TabsTrigger>
                        </TabsList>
                        
                        <TabsContent value="available" className="space-y-4">
                            <div className="flex gap-4">
                            <Select value={selectedGameId} onValueChange={setSelectedGameId}>
                                    <SelectTrigger className="flex-1">
                                        <SelectValue placeholder="Select a game to simulate" />
                                </SelectTrigger>
                                <SelectContent>
                                        {availableGames.map((game) => {
                                            const homeTeam = teams.find(t => t.id === game.home_team_id);
                                            const awayTeam = teams.find(t => t.id === game.away_team_id);
                                            return (
                                        <SelectItem key={game.id} value={game.id}>
                                                    {homeTeam?.name || 'Home'} vs {awayTeam?.name || 'Away'}
                                        </SelectItem>
                                            );
                                        })}
                                </SelectContent>
                            </Select>
                                <Button
                                    onClick={() => simulateSingleGame(selectedGameId)}
                                    disabled={isLoading || !selectedGameId}
                                >
                                    {isLoading ? 'Simulating...' : 'Simulate Selected Game'}
                                </Button>
                        <Button
                            onClick={simulateNextGame}
                            disabled={isLoading || !nextGame}
                                    variant="outline"
                        >
                            {isLoading ? 'Simulating...' : 'Simulate Next Game'}
                        </Button>
                            </div>
                            
                            {/* Debug Info */}
                            <div className="text-sm text-gray-400 space-y-2">
                                <p>Available games: {availableGames.length}</p>
                                <p>Teams loaded: {teams.length}</p>
                                {availableGames.length === 0 && (
                                    <p className="text-yellow-400">No games available for simulation. All games may have been played.</p>
                                )}
                        <Button
                                    onClick={loadAvailableGames}
                                    disabled={isLoading}
                                    variant="secondary"
                                    size="sm"
                                >
                                    🔄 Refresh Games
                        </Button>
                    </div>
                        </TabsContent>
                        
                        <TabsContent value="played" className="space-y-4">
                            <div className="max-h-96 overflow-y-auto">
                                {playedGames.length === 0 ? (
                                    <p className="text-gray-400 text-center py-8">No games have been played yet.</p>
                                ) : (
                                    <div className="space-y-2">
                                        {playedGames.map((game) => {
                                            const homeTeam = teams.find(t => t.id === game.home_team_id);
                                            const awayTeam = teams.find(t => t.id === game.away_team_id);
                                            const result = game.result === 'home_win' ? 'Home Win' : 
                                                         game.result === 'away_win' ? 'Away Win' : 'Draw';
                                            const resultColor = game.result === 'home_win' ? 'text-green-400' : 
                                                              game.result === 'away_win' ? 'text-blue-400' : 'text-yellow-400';
                                            
                                            return (
                                                <div key={game.id} className="flex items-center justify-between p-3 bg-gray-800 rounded-lg">
                                                    <div className="flex items-center gap-3">
                                                        <Badge variant="outline" className="text-xs">
                                                            {new Date(game.kickoff_at).toLocaleDateString()}
                                                        </Badge>
                                                        <span className="font-medium">
                                                            {homeTeam?.name || 'Home'} vs {awayTeam?.name || 'Away'}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center gap-3">
                                                        <span className="text-sm">
                                                            {game.home_score || 0} - {game.away_score || 0}
                                                        </span>
                                                        <Badge className={`${resultColor} bg-transparent`}>
                                                            {result}
                                                        </Badge>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </TabsContent>
                    </Tabs>
                </CardContent>
            </Card>

            {/* Reset Market Caps Card */}
            <Card>
                <CardHeader>
                    <CardTitle>🔄 Reset Marketplace</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex gap-4 flex-wrap">
                        <Button
                            onClick={resetMarketplaceComplete}
                            disabled={isLoading}
                            variant="default"
                            className="bg-green-600 hover:bg-green-700"
                        >
                            {isLoading ? 'Resetting...' : '🔄 Complete Marketplace Reset'}
                        </Button>
                        <Button
                            onClick={resetMarketCapsOnly}
                            disabled={isLoading}
                            variant="secondary"
                            className="bg-blue-600 hover:bg-blue-700"
                        >
                            {isLoading ? 'Resetting...' : 'Reset Market Caps Only'}
                        </Button>
                        <Button
                            onClick={resetAllProfilesAndInvestments}
                            disabled={isLoading}
                            variant="destructive"
                            className="bg-red-600 hover:bg-red-700"
                        >
                            {isLoading ? 'Resetting...' : 'Reset All Profiles & Investments'}
                        </Button>
                    </div>

                    <div className="text-sm text-gray-400">
                        <p><strong>🔄 Complete Marketplace Reset:</strong></p>
                        <ul className="list-disc list-inside ml-4 space-y-1">
                            <li>All team market caps to $100</li>
                            <li>All shares outstanding to 5</li>
                            <li>All fixtures reset to pending</li>
                            <li>Clear ALL ledger data (total_ledger)</li>
                            <li>Clear ALL transfer data (transfers_ledger)</li>
                            <li>Clear ALL orders and positions</li>
                            <li>Create fresh initial ledger entries</li>
                        </ul>
                        <p className="mt-2 text-red-400">⚠️ This will delete ALL user data and investments</p>
                        
                        <p className="mt-4"><strong>Reset Market Caps Only:</strong></p>
                        <ul className="list-disc list-inside ml-4 space-y-1">
                            <li>All team market caps to $100</li>
                            <li>All shares outstanding to 5</li>
                            <li>All games to scheduled status</li>
                            <li>Clear all match scores and snapshots</li>
                            <li>Clear all team state snapshots (except initial)</li>
                            <li>Recreate fresh initial snapshots</li>
                        </ul>
                        <p className="mt-2 text-yellow-400">⚠️ User investments will be preserved</p>
                        
                        <p className="mt-4"><strong>Reset All Profiles & Investments:</strong></p>
                        <ul className="list-disc list-inside ml-4 space-y-1">
                            <li>Delete ALL user profiles from database</li>
                            <li>Delete ALL user positions</li>
                            <li>Delete ALL user orders</li>
                            <li>Clear all team state snapshots (except initial)</li>
                        </ul>
                        <p className="mt-2 text-red-400">⚠️ This action CANNOT be undone!</p>
                    </div>
                </CardContent>
            </Card>

            {/* Results Display */}
            {simulationResults && (
                <Card>
                    <CardHeader>
                        <CardTitle>📊 Simulation Results</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <pre className="whitespace-pre-wrap text-sm font-mono bg-gray-800 p-4 rounded-lg overflow-auto max-h-96">
                            {simulationResults}
                        </pre>
                    </CardContent>
                </Card>
            )}
        </div>
    );
};

export default SeasonSimulation;