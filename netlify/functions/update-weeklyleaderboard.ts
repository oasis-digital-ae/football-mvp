import type { HandlerEvent, HandlerResponse } from "@netlify/functions";
import { schedule } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";
import Decimal from 'decimal.js';

// Import centralized calculation utilities
import {
  calculateWeeklyReturn,
  calculateLeaderboard,
  toLeaderboardDbFormat,
  validateLeaderboardEntries,
  type UserLeaderboardData
} from "../../src/shared/lib/utils/leaderboard-calculations";
import { toDecimal } from "../../src/shared/lib/utils/decimal";

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
 * Helper: Convert cents (bigint) to dollars with FULL PRECISION
 * CRITICAL: Do NOT round during intermediate calculations
 * Only round when displaying or storing final results
 */
function fromCents(cents: number | null | undefined): number {
  if (cents === null || cents === undefined) return 0;
  // Keep full precision - let Decimal.js handle it
  return new Decimal(cents).dividedBy(100).toNumber();
}

/**
 * Helper: Convert Decimal to number with FULL PRECISION
 * Used for intermediate calculations to avoid rounding errors
 */
function toNumber(value: Decimal): number {
  return value.toNumber();
}

async function calculatePortfolioAtTimestamp(
  userId: string,
  timestamp: string
): Promise<number> {

  // 1️⃣ Get all FILLED orders before timestamp
  // Use executed_at if available, otherwise fall back to created_at
  const { data: orders, error: ordersError } = await supabase
  .from("orders")
  .select("team_id, order_type, quantity, executed_at, created_at")
  .eq("user_id", userId)
  .eq("status", "FILLED");

  if (ordersError) {
    console.error(`❌ Error fetching orders for ${userId}:`, ordersError);
    return 0;
  }

  if (!orders || orders.length === 0) {
    return 0;
  }

  // Filter orders by timestamp (executed_at or created_at)
  const ordersBeforeTimestamp = orders.filter(order => {
    const orderTime = order.executed_at || order.created_at;
    return orderTime <= timestamp;
  });

  if (ordersBeforeTimestamp.length === 0) {
    return 0;
  }

  // 2️⃣ Reconstruct quantity per team
  const teamQuantities = new Map<number, Decimal>();

  for (const order of ordersBeforeTimestamp) {
    const currentQty = teamQuantities.get(order.team_id) ?? new Decimal(0);
    const qty = new Decimal(order.quantity); // quantity is INTEGER, NOT cents

    if (order.order_type === "BUY") {
      teamQuantities.set(order.team_id, currentQty.plus(qty));
    } else {
      teamQuantities.set(order.team_id, currentQty.minus(qty));
    }
  }

  // 3️⃣ Calculate portfolio value
  let portfolioValue = new Decimal(0);

  for (const [teamId, quantity] of teamQuantities.entries()) {

    if (quantity.lte(0)) continue;

    const { data: ledger } = await supabase
      .from("total_ledger")
      .select("share_price_after")
      .eq("team_id", teamId)
      .lte("event_date", timestamp)
      .order("event_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    let price: Decimal;

    if (ledger?.share_price_after) {
      // share_price_after is BIGINT cents
      price = new Decimal(ledger.share_price_after).dividedBy(100);
    } else {
      // fallback to launch price from teams table
      const { data: team } = await supabase
        .from("teams")
        .select("launch_price")
        .eq("id", teamId)
        .single();

      price = new Decimal(team?.launch_price ?? 2000).dividedBy(100);
    }

    portfolioValue = portfolioValue.plus(price.times(quantity));
  }

  return portfolioValue.toNumber(); // full precision
}

/**
 * Fetch user wallet and portfolio data for leaderboard calculation
 * Uses the same calculation logic as the frontend for consistency
 */
async function fetchUserLeaderboardData(
  weekStart: string,
  weekEnd: string
): Promise<UserLeaderboardData[]> {
  console.log("📊 Fetching user data for leaderboard calculation...");

  // Get all users with profiles
  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id, full_name, wallet_balance");

  if (profilesError) {
    console.error("❌ Failed to fetch profiles:", profilesError);
    throw profilesError;
  }

  if (!profiles || profiles.length === 0) {
    console.log("⚠️ No users found");
    return [];
  }
  console.log(`  Found ${profiles.length} users`);
  
  // Process each user
  const userData: UserLeaderboardData[] = [];

  for (const profile of profiles) {
    const userId = profile.id;    // 1. Get wallet balance at start and end of week
    // Calculate wallet balance by summing all transactions up to that point
    // Deposits/sales ADD to wallet, purchases SUBTRACT from wallet
    
    // Start: Calculate wallet balance from ALL transactions BEFORE week_start
    const { data: startTransactions } = await supabase
      .from("wallet_transactions")
      .select("amount_cents, type")
      .eq("user_id", userId)
      .lt("created_at", weekStart)
      .order("created_at", { ascending: true });

    let startWalletBalance = 0;
    if (startTransactions && startTransactions.length > 0) {
      for (const tx of startTransactions) {
        const amount = fromCents(tx.amount_cents);
        if (tx.type === "deposit" || tx.type === "sale") {
          startWalletBalance += amount;
        } else if (tx.type === "purchase") {
          startWalletBalance -= amount;
        }
      }
    }

    // End: Calculate wallet balance from ALL transactions BEFORE week_end
    const { data: endTransactions } = await supabase
      .from("wallet_transactions")
      .select("amount_cents, type")
      .eq("user_id", userId)
      .lt("created_at", weekEnd)
      .order("created_at", { ascending: true });

    let endWalletBalance = 0;
    if (endTransactions && endTransactions.length > 0) {
      for (const tx of endTransactions) {
        const amount = fromCents(tx.amount_cents);
        if (tx.type === "deposit" || tx.type === "sale") {
          endWalletBalance += amount;
        } else if (tx.type === "purchase") {
          endWalletBalance -= amount;
        }
      }
    }
    
    const startWalletValue = startWalletBalance;
    const endWalletValue = endWalletBalance;

    // 2. Reconstruct portfolio at start and end using orders + ledger
    const startPortfolioValue = await calculatePortfolioAtTimestamp(userId, weekStart);
    const endPortfolioValue = await calculatePortfolioAtTimestamp(userId, weekEnd);

    // 3. Calculate deposits during the week
    const { data: deposits } = await supabase
      .from("wallet_transactions")
      .select("amount_cents")
      .eq("user_id", userId)
      .eq("type", "deposit")
      .gte("created_at", weekStart)
      .lt("created_at", weekEnd);

    const depositsWeek = (deposits || []).reduce((sum, tx) => sum + fromCents(tx.amount_cents), 0);

    // 4. Calculate account values using Decimal.js
    const startAccountValue = new Decimal(startWalletValue).plus(new Decimal(startPortfolioValue)).toNumber();
    const endAccountValue = new Decimal(endWalletValue).plus(new Decimal(endPortfolioValue)).toNumber();

    // 5. Determine if user should be included in leaderboard
    // Include if ANY of these conditions are met:
    // - Has starting account value (existing user)
    // - Has ending account value (made trades/received deposits)
    // - Made deposits this week (new user who deposited)
    const hasActivity = startAccountValue > 0 || endAccountValue > 0 || depositsWeek > 0;
    
    // Special handling for mid-week joiners:
    // If user joined mid-week (start = 0) but has deposits and trades (end > deposits),
    // they should be included    const isMidWeekJoiner = startAccountValue === 0 && depositsWeek > 0;
    const hasTradingActivity = endAccountValue > depositsWeek; // Traded, not just deposited

    if (hasActivity) {
      // Calculate weekly return to check for anomalies
      const weeklyReturn = calculateWeeklyReturn(startAccountValue, endAccountValue, depositsWeek);
        // Debug logging for users with extreme returns
      if (Math.abs(weeklyReturn) > 5) { // More than 500% return
        console.log(`⚠️ Extreme return detected for user ${profile.full_name || userId}:`);
        console.log(`  Start Wallet: $${startWalletValue.toFixed(2)}`);
        console.log(`  Start Portfolio: $${startPortfolioValue.toFixed(2)}`);
        console.log(`  Start Account: $${startAccountValue.toFixed(2)}`);
        console.log(`  End Wallet: $${endWalletValue.toFixed(2)}`);
        console.log(`  End Portfolio: $${endPortfolioValue.toFixed(2)}`);
        console.log(`  End Account: $${endAccountValue.toFixed(2)}`);
        console.log(`  Deposits: $${depositsWeek.toFixed(2)}`);
        console.log(`  Calculated Return: ${(weeklyReturn * 100).toFixed(2)}%`);
        console.log(`  Week Start: ${weekStart}`);
        console.log(`  Week End: ${weekEnd}`);
      }
      
      userData.push({
        user_id: userId,
        full_name: profile.full_name,
        start_wallet_value: startWalletValue,
        start_portfolio_value: startPortfolioValue,
        start_account_value: startAccountValue,
        end_wallet_value: endWalletValue,
        end_portfolio_value: endPortfolioValue,
        end_account_value: endAccountValue,
        deposits_week: depositsWeek
      });
    }
  }
  console.log(`  Processed ${userData.length} users with account activity`);
  return userData;
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
   * Step 1: Fetch user data and compute leaderboard using TypeScript
   * This ensures calculations match the frontend exactly (using Decimal.js)
   */
  const userData = await fetchUserLeaderboardData(weekStartStr, weekEndStr);

  if (userData.length === 0) {
    console.log("⚠️ No users with account activity for this week");
    return { statusCode: 200, body: "No users to process" };
  }

  // Calculate leaderboard using centralized calculation logic
  const leaderboardEntries = calculateLeaderboard(userData);

  // Validate calculations
  const validationErrors = validateLeaderboardEntries(leaderboardEntries);
  if (validationErrors.length > 0) {
    console.error("❌ Validation errors:", validationErrors);
    return { statusCode: 500, body: "Validation failed" };
  }

  console.log(`✅ Calculated leaderboard for ${leaderboardEntries.length} users`);
  console.log(`  Top 3: ${leaderboardEntries.slice(0, 3).map(e => `${e.full_name || 'Unknown'}: ${(e.weekly_return * 100).toFixed(2)}%`).join(', ')}`);


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
   * Convert to database format (cents for bigint storage)
   */
  const rows = leaderboardEntries.map((entry) => ({
    ...toLeaderboardDbFormat(entry),
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