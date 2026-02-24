import type { HandlerEvent, HandlerResponse } from "@netlify/functions";
import { schedule } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";

/**
 * Helper function to get environment variables with fallbacks
 * Supports multiple naming conventions used across different platforms
 */
function getEnvVar(...names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name];
    if (value) return value;
  }
  return undefined;
}

// Support multiple environment variable naming conventions
const SUPABASE_URL = getEnvVar(
  'VITE_SUPABASE_URL',
  'SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_URL'
);
const SUPABASE_SERVICE_KEY = getEnvVar(
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_SERVICE_KEY',
  'VITE_SUPABASE_SERVICE_ROLE_KEY'
);

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  throw new Error(
    'Missing required environment variables: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY'
  );
}

/**
 * Supabase admin client
 * Uses service role key because this is a trusted backend job
 * and must bypass RLS.
 */
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

/**
 * Compute the COMPLETED leaderboard week (UAE time)
 *
 * IMPORTANT:
 * - This job runs on Monday 03:00 UAE time
 * - At that point, the previous week is fully complete
 * - So we ALWAYS compute the PREVIOUS Monday 03:00 → Monday 02:59 window
 *
 * Week definition:
 *   Monday 03:00 UAE → next Monday 02:59 UAE (exactly 7 days)
 *
 * Returned values are converted back to UTC
 * because Supabase stores timestamps in UTC.
 */
function getCompletedUAEWeekBounds() {
  const nowUTC = new Date();

  // Convert to UAE time (UTC +4)
  const nowUAE = new Date(nowUTC.getTime() + 4 * 60 * 60 * 1000);

  // Move back one full week to ensure we process the COMPLETED week
  nowUAE.setUTCDate(nowUAE.getUTCDate() - 7);

  const day = nowUAE.getUTCDay(); // 0 = Sunday
  const diffToMonday = (day === 0 ? -6 : 1) - day;

  // Monday 03:00 UAE
  const weekStartUAE = new Date(nowUAE);
  weekStartUAE.setUTCDate(nowUAE.getUTCDate() + diffToMonday);
  weekStartUAE.setUTCHours(3, 0, 0, 0);

  // Next Monday 02:59:59 UAE (exactly 7 days, matches DB format)
  const weekEndUAE = new Date(weekStartUAE);
  weekEndUAE.setUTCDate(weekStartUAE.getUTCDate() + 7);
  weekEndUAE.setUTCHours(2, 59, 59, 0);

  // Convert back to UTC before saving to DB
  return {
    week_start: new Date(weekStartUAE.getTime() - 4 * 60 * 60 * 1000),
    week_end: new Date(weekEndUAE.getTime() - 4 * 60 * 60 * 1000),
  };
}

/**
 * Weekly leaderboard scheduled function.
 * Schedule: Sunday 23:00 UTC = Monday 03:00 UAE
 * Uses schedule() wrapper so Netlify recognizes it as a scheduled function.
 * NOTE: Scheduled functions only run on PRODUCTION (published) deploys, not branch deploys.
 */
export const handler = schedule("0 23 * * 0", async (event: HandlerEvent): Promise<HandlerResponse> => {
  /**
   * Allow execution via:
   * - Netlify scheduled cron (body contains next_run)
   * - Manual: POST with header x-manual-run: true or query ?manual=true
   */
  const headers = event.headers || {};
  const manualHeader = headers["x-manual-run"] ?? headers["X-Manual-Run"];
  const manualQuery = event.queryStringParameters?.manual === "true";
  const isManual =
    event.httpMethod === "POST" &&
    (manualHeader === "true" || manualQuery);

  // Scheduled invocations send body: {"next_run":"..."} (per Netlify docs)
  const isScheduled = Boolean(
    (event as { cron?: boolean }).cron ||
    (event.body && typeof event.body === "string" && event.body.includes("next_run"))
  );

  if (!isScheduled && !isManual) {
    return { statusCode: 403, body: "Forbidden" };
  }

  console.log("🚀 Weekly Leaderboard Job Started");

  const { week_start, week_end } = getCompletedUAEWeekBounds();

  console.log("📅 Processing week:");
  console.log("  Week start (UTC):", week_start.toISOString());
  console.log("  Week end   (UTC):", week_end.toISOString());

  const weekStartStr = week_start.toISOString();
  const weekEndStr = week_end.toISOString();

  /**
   * Guard: prevent duplicate leaderboard generation
   * We check using a RANGE instead of exact timestamps
   * to avoid timezone and precision issues.
   */
  const { count } = await supabase
    .from("weekly_leaderboard")
    .select("id", { count: "exact", head: true })
    .gte("week_start", weekStartStr)
    .lt("week_start", weekEndStr);

  if (count && count > 0) {
    console.log("⚠️ Leaderboard already generated for this week");
    return { statusCode: 200, body: "Already processed" };
  }

  /**
   * Step 1: Compute leaderboard via SQL function
   */
  const { data, error } = await supabase.rpc(
    "generate_weekly_leaderboard_exact_v2",
    {
      p_week_start: weekStartStr,
      p_week_end: weekEndStr,
    }
  );

  if (error || !data || data.length === 0) {
    console.error("❌ Leaderboard computation failed", error);
    return { statusCode: 500, body: "Computation failed" };
  }

  /**
   * Step 2: Get next week_number (table has week_number column, RPC does not return it)
   */
  const { data: maxWeek } = await supabase
    .from("weekly_leaderboard")
    .select("week_number")
    .order("week_number", { ascending: false })
    .limit(1)
    .single();

  const nextWeekNumber = (maxWeek?.week_number ?? 0) + 1;
  console.log("  Week number:", nextWeekNumber);

  /**
   * Step 3: Insert new leaderboard rows
   * Table expects: user_id, rank, *values, week_start, week_end, week_number, is_latest
   */
  const rows = data.map((r: Record<string, unknown>) => ({
    ...r,
    week_start: weekStartStr,
    week_end: weekEndStr,
    week_number: nextWeekNumber,
    is_latest: true,
  }));

  const { error: insertError } = await supabase
    .from("weekly_leaderboard")
    .insert(rows);

  if (insertError) {
    console.error("❌ Insert failed", insertError);
    return { statusCode: 500, body: "Insert failed" };
  }

  /**
   * Step 4: Demote previous leaderboard entries (set is_latest = false)
   * Use week_start string for consistent comparison with timestamptz
   */
  const { error: demoteError } = await supabase
    .from("weekly_leaderboard")
    .update({ is_latest: false })
    .neq("week_start", weekStartStr);

  if (demoteError) {
    console.warn("⚠️ Demote previous failed (non-fatal):", demoteError);
  }

  console.log(`✅ Weekly leaderboard generated (${rows.length} users)`);

  return {
    statusCode: 200,
    body: "Weekly leaderboard generated successfully",
  };
});