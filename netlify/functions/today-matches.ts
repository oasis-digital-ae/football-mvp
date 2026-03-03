/**
 * Netlify Function: Fetch today's matches from Football Data API v4
 *
 * Use in Postman:
 *   GET http://localhost:8888/.netlify/functions/today-matches
 *
 * Optional query params:
 *   - date: TODAY | YESTERDAY | TOMORROW | YYYY-MM-DD (default: TODAY)
 *   - competitions: PL to filter Premier League only (default: PL)
 */

import type { Handler } from '@netlify/functions';

const FOOTBALL_API_BASE = 'https://api.football-data.org/v4';
const API_KEY = process.env.VITE_FOOTBALL_API_KEY;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: null };
  }

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method not allowed. Use GET.' }),
    };
  }

  if (!API_KEY) {
    return {
      statusCode: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'API key not configured',
        message: 'Set VITE_FOOTBALL_API_KEY in environment variables',
      }),
    };
  }

  try {
    const params = event.queryStringParameters || {};
    const date = params.date || 'TODAY';
    const competitions = params.competitions || 'PL';

    const apiUrl = `${FOOTBALL_API_BASE}/matches?date=${encodeURIComponent(date)}&competitions=${encodeURIComponent(competitions)}`;

    const response = await fetch(apiUrl, {
      headers: { 'X-Auth-Token': API_KEY },
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        statusCode: response.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: `Football API error: ${response.status}`,
          details: errorText,
        }),
      };
    }

    const data = await response.json();

    return {
      statusCode: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date,
        competitions,
        count: data.matches?.length ?? 0,
        matches: data.matches ?? [],
      }),
    };
  } catch (error: any) {
    console.error('today-matches error:', error);
    return {
      statusCode: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: error.message || 'Internal server error',
      }),
    };
  }
};
