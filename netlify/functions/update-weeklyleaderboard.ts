import { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";

/**
 * Supabase admin client
 * Uses service role key because this is a trusted backend job
 * and must bypass RLS.
 */
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Compute the COMPLETED leaderboard week (UAE time)
 *
 * IMPORTANT:
 * - This job runs on Monday 00:01 UAE time
 * - At that point, the previous week is fully complete
 * - So we ALWAYS compute the PREVIOUS Monday → Sunday window
 *
 * Week definition:
 *   Monday 00:00 UAE → next Monday 00:00 UAE
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

  // Monday 00:00 UAE
  const weekStartUAE = new Date(nowUAE);
  weekStartUAE.setUTCDate(nowUAE.getUTCDate() + diffToMonday);
  weekStartUAE.setUTCHours(0, 0, 0, 0);

  // Next Monday 00:00 UAE
  const weekEndUAE = new Date(weekStartUAE);
  weekEndUAE.setUTCDate(weekStartUAE.getUTCDate() + 7);

  // Convert back to UTC before saving to DB
  return {
    week_start: new Date(weekStartUAE.getTime() - 4 * 60 * 60 * 1000),
    week_end: new Date(weekEndUAE.getTime() - 4 * 60 * 60 * 1000),
  };
}

export const handler: Handler = async (event: any) => {
  /**
   * Allow execution ONLY via:
   * - Netlify scheduled cron
   * - Manual admin trigger (POST with header)
   */
  const isManual =
    event.httpMethod === "POST" &&
    event.headers["x-manual-run"] === "true";

  if (!event?.cron && !isManual) {
    return { statusCode: 403, body: "Forbidden" };
  }

  console.log("🚀 Weekly Leaderboard Job Started");

  const { week_start, week_end } = getCompletedUAEWeekBounds();

  console.log("📅 Processing week:");
  console.log("  Week start (UTC):", week_start.toISOString());
  console.log("  Week end   (UTC):", week_end.toISOString());

  /**
   * Guard: prevent duplicate leaderboard generation
   * We check using a RANGE instead of exact timestamps
   * to avoid timezone and precision issues.
   */
  const { count } = await supabase
    .from("weekly_leaderboard")
    .select("id", { count: "exact", head: true })
    .gte("week_start", week_start)
    .lt("week_start", week_end);

  if (count && count > 0) {
    console.log("⚠️ Leaderboard already generated for this week");
    return { statusCode: 200, body: "Already processed" };
  }

  /**
   * Step 1: Compute leaderboard via SQL function
   */
  const { data, error } = await supabase.rpc(
    "generate_weekly_leaderboard",
    {
      p_week_start: week_start.toISOString(),
      p_week_end: week_end.toISOString(),
    }
  );

  if (error || !data || data.length === 0) {
    console.error("❌ Leaderboard computation failed", error);
    return { statusCode: 500, body: "Computation failed" };
  }

  /**
   * Step 2: Insert new leaderboard rows
   */
  const rows = data.map((r: any) => ({
    ...r,
    week_start,
    week_end,
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
   * Step 3: Safely demote previous leaderboard entries
   * (Only after new rows are successfully inserted)
   */
  await supabase
    .from("weekly_leaderboard")
    .update({ is_latest: false })
    .neq("week_start", week_start);

  console.log(`✅ Weekly leaderboard generated (${rows.length} users)`);

  return {
    statusCode: 200,
    body: "Weekly leaderboard generated successfully",
  };
};