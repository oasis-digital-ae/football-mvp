// Runs every minute during typical PL match hours (11:00-03:00 UTC, covers matches running past midnight)
// Exits immediately if no live matches - avoids unnecessary API calls on non-match days

import type { HandlerEvent, HandlerResponse } from '@netlify/functions';
import { schedule } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';
import { processUpdate } from './update-matches';

function getEnvVar(...names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name];
    if (value) return value;
  }
  return undefined;
}

const SUPABASE_URL = getEnvVar('VITE_SUPABASE_URL', 'SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL');
const SUPABASE_SERVICE_KEY = getEnvVar('SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_KEY');

export const handler = schedule('* 0-3,11-23 * * *', async (event: HandlerEvent): Promise<HandlerResponse> => {
  console.log('🏈 update-matches-live: checking for live matches...');

  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
      console.log('⏭️ Missing env vars, skipping');
      return { statusCode: 200, body: JSON.stringify({ skipped: true, reason: 'missing_env' }) };
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Quick check: any fixtures that need updating?
    // 1) Live/closed with pending result - match in progress or just finished
    const { data: liveFixtures, error: liveError } = await supabase
      .from('fixtures')
      .select('id')
      .in('status', ['live', 'closed'])
      .or('result.is.null,result.eq.pending')
      .limit(1);

    if (liveError) {
      console.warn('⚠️ Error checking live fixtures:', liveError);
      return { statusCode: 200, body: JSON.stringify({ skipped: true, reason: 'db_error' }) };
    }

    // 2) Scheduled with kickoff in last 90 min - match may have started (we haven't fetched yet)
    let hasWork = (liveFixtures?.length ?? 0) > 0;
    if (!hasWork) {
      const ninetyMinutesAgo = new Date(Date.now() - 90 * 60 * 1000).toISOString();
      const now = new Date().toISOString();
      const { data: recentScheduled } = await supabase
        .from('fixtures')
        .select('id')
        .eq('status', 'scheduled')
        .gte('kickoff_at', ninetyMinutesAgo)
        .lte('kickoff_at', now) // Already kicked off
        .limit(1);
      hasWork = (recentScheduled?.length ?? 0) > 0;
    }

    if (!hasWork) {
      console.log('⏭️ No live matches - skipping update');
      return {
        statusCode: 200,
        body: JSON.stringify({
          skipped: true,
          reason: 'no_live_matches',
          timestamp: new Date().toISOString(),
        }),
      };
    }

    console.log('🔥 Live matches detected - running full update');
    const results = await processUpdate();

    return {
      statusCode: 200,
      body: JSON.stringify({
        updated: true,
        results,
        timestamp: new Date().toISOString(),
      }),
    };
  } catch (error) {
    console.error('❌ update-matches-live error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      }),
    };
  }
});
