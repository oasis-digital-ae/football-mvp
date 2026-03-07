// Scheduled background function to update match data from Football API
// Runs every 30 minutes automatically via Netlify scheduled functions
// Processes all fixtures in a single run
// Maximum execution time: 15 minutes (Netlify background function limit)

import type { HandlerEvent, HandlerResponse } from '@netlify/functions';
import { schedule } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';

// Helper function to get environment variables with fallbacks
function getEnvVar(...names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name];
    if (value) return value;
  }
  return undefined;
}

// Support multiple environment variable naming conventions
// Try VITE_ prefix first (for consistency with client), then without prefix
const SUPABASE_URL = getEnvVar('VITE_SUPABASE_URL', 'SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL');
const SUPABASE_SERVICE_KEY = getEnvVar('SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_KEY');
const API_KEY = getEnvVar('VITE_FOOTBALL_API_KEY', 'FOOTBALL_API_KEY');

// Football API configuration
const FOOTBALL_API_BASE_URL = 'https://api.football-data.org/v4';

interface MatchData {
  status: 'SCHEDULED' | 'LIVE' | 'IN_PLAY' | 'FINISHED' | 'PAUSED' | 'POSTPONED' | 'SUSPENDED' | 'CANCELLED';
  score: {
    fullTime: {
      home: number | null;
      away: number | null;
    };
    halfTime?: {
      home: number | null;
      away: number | null;
    };
    // For live matches, the API might provide current score in different fields
    duration?: string;
  };
}

interface FootballMatch {
  id: number;
  utcDate: string;
  status: string;
  matchday: number;
  homeTeam: { id: number; name: string };
  awayTeam: { id: number; name: string };
  score: {
    fullTime: {
      home: number | null;
      away: number | null;
    };
  };
}

// Helper functions for status conversion
function convertMatchStatus(status: string, score: any): 'home_win' | 'away_win' | 'draw' | 'pending' {
  if (status !== 'FINISHED') return 'pending';
  
  if (score?.fullTime?.home === null || score?.fullTime?.home === undefined) return 'pending';
  if (score?.fullTime?.away === null || score?.fullTime?.away === undefined) return 'pending';
  
  if (score.fullTime.home > score.fullTime.away) return 'home_win';
  if (score.fullTime.away > score.fullTime.home) return 'away_win';
  return 'draw';
}

function convertMatchStatusToFixtureStatus(status: string): 'scheduled' | 'live' | 'applied' | 'postponed' {
  switch (status) {
    case 'SCHEDULED':
    case 'TIMED': return 'scheduled';
    case 'LIVE':
    case 'IN_PLAY':
    case 'PAUSED': return 'live';
    case 'FINISHED': return 'applied';
    case 'POSTPONED':
    case 'SUSPENDED':
    case 'CANCELLED': return 'postponed';
    default: return 'scheduled';
  }
}

// Use schedule() wrapper to create a scheduled function
// This will run every 30 minutes automatically
export const handler = schedule('*/30 * * * *', async (event: HandlerEvent): Promise<HandlerResponse> => {
  console.log('🏈 Match update function started');
  const startTime = Date.now();
  
  try {
    // Await the processing to ensure it completes
    const results = await processUpdate();
    const duration = Date.now() - startTime;
    
    console.log(`✅ Match update completed in ${duration}ms:`, results);
    
    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Match update completed',
        results,
        duration: `${duration}ms`,
        timestamp: new Date().toISOString(),
      }),
    };
  } catch (error) {
    console.error('❌ Match update function error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Match update failed',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      }),
    };
  }
});

async function processUpdate() {
  const results = {
    checked: 0,
    updated: 0,
    errors: 0,
    snapshots: 0,
    fixturesSynced: 0,
  };

  try {
    // Validate required environment variables
    if (!SUPABASE_URL) {
      throw new Error('Missing SUPABASE_URL. Please set VITE_SUPABASE_URL, SUPABASE_URL, or NEXT_PUBLIC_SUPABASE_URL in Netlify environment variables.');
    }

    if (!SUPABASE_SERVICE_KEY) {
      throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY. Please set SUPABASE_SERVICE_ROLE_KEY in Netlify environment variables.');
    }

    if (!API_KEY) {
      throw new Error('Missing FOOTBALL_API_KEY. Please set VITE_FOOTBALL_API_KEY or FOOTBALL_API_KEY in Netlify environment variables.');
    }

    // Initialize Supabase client
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Sync fixtures from API (run every 30 minutes)
    // Check if we should sync fixtures (run sync if last sync was more than 30 minutes ago, or never)
    const shouldSyncFixtures = await shouldRunFixtureSync(supabase);
    if (shouldSyncFixtures) {
      try {
        console.log('🔄 Syncing fixtures from Football API...');
        const syncResult = await syncFixturesFromAPI(supabase);
        results.fixturesSynced = syncResult;
        console.log(`✅ Synced ${syncResult} fixtures from API`);
      } catch (error) {
        console.error('❌ Error syncing fixtures:', error);
        results.errors++;
        // Don't throw - continue with match updates even if sync fails
      }
    } else {
      console.log('⏭️ Skipping fixture sync (last sync was less than 30 minutes ago)');
    }

    // Get fixtures that need updates
    // - Status is scheduled or closed
    // - Kickoff within last 2 hours or next 48 hours
    const now = new Date();
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
    const twoDaysLater = new Date(now.getTime() + 48 * 60 * 60 * 1000);    // Get fixtures that need updating (scheduled, live, or recently finished)
    const { data: fixtures, error: fetchError } = await supabase
      .from('fixtures')
      .select('*')
      .in('status', ['scheduled', 'live', 'closed']) // Include 'closed' for backward compatibility
      .gte('kickoff_at', twoHoursAgo.toISOString())
      .lte('kickoff_at', twoDaysLater.toISOString());

    if (fetchError) {
      console.error('❌ Error fetching fixtures:', fetchError);
      throw new Error(`Failed to fetch fixtures: ${fetchError.message}`);
    }

    if (!fixtures || fixtures.length === 0) {
      console.log('✅ No fixtures need updating');
      return results;
    }

    console.log(`📊 Checking ${fixtures.length} fixtures...`);

    // Process each fixture
    for (const fixture of fixtures) {
      try {
        // Skip fixtures without external_id
        if (!fixture.external_id) {
          continue;
        }        results.checked++;

        const kickoffTime = new Date(fixture.kickoff_at);
        const buyCloseTime = new Date(kickoffTime.getTime() - 15 * 60 * 1000);
        const timeToBuyClose = buyCloseTime.getTime() - now.getTime();

        // Capture snapshots 15 min before kickoff
        if (fixture.status === 'scheduled' && (fixture.snapshot_home_cap === null || fixture.snapshot_away_cap === null)) {
          if (timeToBuyClose <= 5 * 60 * 1000 && timeToBuyClose >= -5 * 60 * 1000) {
            console.log(`📸 Capturing snapshots for fixture ${fixture.id}`);
            
            // Get current market caps
            const { data: homeTeam } = await supabase
              .from('teams')
              .select('market_cap')
              .eq('id', fixture.home_team_id)
              .single();

            const { data: awayTeam } = await supabase
              .from('teams')
              .select('market_cap')
              .eq('id', fixture.away_team_id)
              .single();

            // Update fixture with snapshots
            await supabase
              .from('fixtures')
              .update({
                snapshot_home_cap: homeTeam?.market_cap || 100,
                snapshot_away_cap: awayTeam?.market_cap || 100,
              })
              .eq('id', fixture.id);

            results.snapshots++;
          }
        }        // Update match data for fixtures that are potentially live or recently finished
        // Check matches from 30 min before kickoff until 3 hours after kickoff
        // This ensures we catch matches that start late or go into extra time
        const thirtyMinBeforeKickoff = new Date(kickoffTime.getTime() - 30 * 60 * 1000);
        const threeHoursAfterKickoff = new Date(kickoffTime.getTime() + 3 * 60 * 60 * 1000);
        
        if (now >= thirtyMinBeforeKickoff && now <= threeHoursAfterKickoff) {
          console.log(`🔥 Updating match fixture ${fixture.id} (${fixture.status})`);

          // Fetch from Football API
          const response = await fetch(`${FOOTBALL_API_BASE_URL}/matches/${fixture.external_id}`, {
            headers: {
              'X-Auth-Token': API_KEY,
            },
          });

          if (!response.ok) {
            console.error(`❌ Failed to fetch match ${fixture.external_id} from API`);
            results.errors++;
            continue;
          }

          const matchData: MatchData = await response.json();          // Convert API status to database status
          let newStatus = fixture.status;
          let newResult = fixture.result;
          let homeScore = fixture.home_score;
          let awayScore = fixture.away_score;

          if (matchData.status === 'FINISHED') {
            newStatus = 'applied';
            // Determine result based on scores
            if (matchData.score.fullTime.home !== null && matchData.score.fullTime.away !== null) {
              homeScore = matchData.score.fullTime.home;
              awayScore = matchData.score.fullTime.away;
              
              if (homeScore > awayScore) newResult = 'home_win';
              else if (awayScore > homeScore) newResult = 'away_win';
              else newResult = 'draw';
            }
          } else if (matchData.status === 'IN_PLAY' || matchData.status === 'LIVE' || matchData.status === 'PAUSED') {
            newStatus = 'live';
            // For live matches, use fullTime scores (they contain current score during the match)
            // The API provides live scores in the fullTime field even though the match isn't finished
            if (matchData.score.fullTime.home !== null && matchData.score.fullTime.away !== null) {
              homeScore = matchData.score.fullTime.home;
              awayScore = matchData.score.fullTime.away;
            }
            // Result stays 'pending' during live matches
            newResult = 'pending';
          }

          // Update fixture if status, result, or scores changed
          if (newStatus !== fixture.status || 
              newResult !== fixture.result || 
              homeScore !== fixture.home_score || 
              awayScore !== fixture.away_score) {
            
            await supabase
              .from('fixtures')
              .update({
                status: newStatus,
                result: newResult,
                home_score: homeScore,
                away_score: awayScore,
                updated_at: now.toISOString(),
              })
              .eq('id', fixture.id);

            console.log(`✅ Updated fixture ${fixture.id}: ${fixture.status} -> ${newStatus}, Result: ${newResult}, Score: ${homeScore}-${awayScore}`);
            results.updated++;
          }
        }

      } catch (error) {
        console.error(`❌ Error processing fixture ${fixture.id}:`, error);
        results.errors++;
      }
    }

    console.log(`✅ Match update complete: ${results.updated} updated, ${results.snapshots} snapshots, ${results.fixturesSynced} fixtures synced, ${results.errors} errors`);

    return results;
  } catch (error) {
    console.error('❌ Fatal error in match update function:', error);
    results.errors++;
    throw error; // Re-throw to be caught by handler
  }
}

// Check if we should run fixture sync (every 30 minutes)
async function shouldRunFixtureSync(supabase: any): Promise<boolean> {
  try {
    // Check when fixtures were last updated
    const { data: latestFixture } = await supabase
      .from('fixtures')
      .select('updated_at')
      .order('updated_at', { ascending: false })
      .limit(1)
      .single();

    if (!latestFixture || !latestFixture.updated_at) {
      // No fixtures exist, should sync
      return true;
    }

    const lastUpdate = new Date(latestFixture.updated_at);
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
    
    // Sync if last update was more than 30 minutes ago
    return lastUpdate < thirtyMinutesAgo;
  } catch (error) {
    // On error, run sync to be safe
    console.warn('⚠️ Error checking sync status, will sync fixtures:', error);
    return true;
  }
}

// Sync fixtures from Football API
async function syncFixturesFromAPI(supabase: any): Promise<number> {
  // Fetch Premier League matches for current season (2025)
  const response = await fetch(`${FOOTBALL_API_BASE_URL}/competitions/PL/matches?season=2025`, {
    headers: {
      'X-Auth-Token': API_KEY!,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch fixtures from API: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  const matches: FootballMatch[] = data.matches || [];

  if (matches.length === 0) {
    console.log('⚠️ No matches returned from API');
    return 0;
  }

  // Log matchday distribution for debugging
  const matchdayCounts = new Map<number, number>();
  matches.forEach(match => {
    const count = matchdayCounts.get(match.matchday) || 0;
    matchdayCounts.set(match.matchday, count + 1);
  });
  const matchdays = Array.from(matchdayCounts.keys()).sort((a, b) => a - b);
  console.log(`📊 Fetched ${matches.length} matches from API. Matchdays: ${matchdays.join(', ')}`);
  console.log(`📊 Matchday distribution: ${Array.from(matchdayCounts.entries()).map(([md, count]) => `MD${md}:${count}`).join(', ')}`);

  // Get teams for mapping
  const { data: teams, error: teamsError } = await supabase
    .from('teams')
    .select('id, name, external_id');

  if (teamsError || !teams || teams.length === 0) {
    throw new Error('Failed to fetch teams from database');
  }

  // Create team mapping by name
  const teamMapping = new Map<string, number>();
  teams.forEach((team: any) => {
    teamMapping.set(team.name, team.id);
  });
  // Prepare fixture data for upsert
  const fixtureData: Array<{
    external_id: string;
    home_team_id: number;
    away_team_id: number;
    kickoff_at: string;
    buy_close_at: string;
    status: 'scheduled' | 'live' | 'applied' | 'postponed';
    result: 'home_win' | 'away_win' | 'draw' | 'pending';
    home_score: number;
    away_score: number;
    matchday: number;
    season: number;
    updated_at: string;
  }> = [];
  let skippedCount = 0;

  for (const match of matches) {
    const homeTeamId = teamMapping.get(match.homeTeam.name);
    const awayTeamId = teamMapping.get(match.awayTeam.name);

    if (!homeTeamId || !awayTeamId) {
      console.warn(`⚠️ Skipping match: teams not found for ${match.homeTeam.name} vs ${match.awayTeam.name}`);
      skippedCount++;
      continue;    }

    const kickoffTime = new Date(match.utcDate);
    const buyCloseTime = new Date(kickoffTime.getTime() - 15 * 60 * 1000);

    fixtureData.push({
      external_id: match.id.toString(),
      home_team_id: homeTeamId,
      away_team_id: awayTeamId,
      kickoff_at: kickoffTime.toISOString(),
      buy_close_at: buyCloseTime.toISOString(),
      status: convertMatchStatusToFixtureStatus(match.status),
      result: convertMatchStatus(match.status, match.score),
      home_score: match.score?.fullTime?.home || 0,
      away_score: match.score?.fullTime?.away || 0,
      matchday: match.matchday,
      season: 2025,
      updated_at: new Date().toISOString(),
    });
  }

  if (fixtureData.length === 0) {
    console.log('⚠️ No fixtures to sync after team mapping');
    return 0;
  }

  // Upsert fixtures - update all fields including dates when fixture already exists
  const { data: upsertedFixtures, error: upsertError } = await supabase
    .from('fixtures')
    .upsert(fixtureData, {
      onConflict: 'external_id',
      ignoreDuplicates: false,
    })
    .select('id, external_id');

  if (upsertError) {
    throw new Error(`Failed to upsert fixtures: ${upsertError.message}`);
  }

  const syncedCount = upsertedFixtures?.length || 0;
  
  // Log synced matchday distribution
  const syncedMatchdayCounts = new Map<number, number>();
  fixtureData.forEach(fixture => {
    const count = syncedMatchdayCounts.get(fixture.matchday) || 0;
    syncedMatchdayCounts.set(fixture.matchday, count + 1);
  });
  const syncedMatchdays = Array.from(syncedMatchdayCounts.keys()).sort((a, b) => a - b);
  console.log(`✅ Synced ${syncedCount} fixtures. Matchdays synced: ${syncedMatchdays.join(', ')}`);
  
  if (skippedCount > 0) {
    console.log(`⚠️ Skipped ${skippedCount} fixtures due to team mapping issues`);
  }

  return syncedCount;
}

// Note: Schedule is configured using schedule() wrapper above
// and also in netlify.toml for redundancy

