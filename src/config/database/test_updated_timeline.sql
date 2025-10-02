-- Test the updated timeline function
SELECT 'Updated Timeline Test' as test_type, 
       event_order,
       event_type,
       event_date,
       description,
       market_cap_before,
       market_cap_after,
       share_price_before,
       share_price_after,
       price_impact
FROM get_team_complete_timeline(37)
LIMIT 5;

