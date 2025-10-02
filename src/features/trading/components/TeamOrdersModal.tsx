import React, { useState, useEffect } from 'react';
import { OrderWithImpact, TeamOrdersData } from '@/shared/lib/services/types';
import { TeamOrdersService } from '@/shared/lib/services/team-orders.service';
import { supabase } from '@/shared/lib/supabase';

interface TeamOrdersModalProps {
  teamId: number;
  teamName: string;
  isOpen: boolean;
  onClose: () => void;
}

export const TeamOrdersModal: React.FC<TeamOrdersModalProps> = ({
  teamId,
  teamName,
  isOpen,
  onClose
}) => {
  const [teamData, setTeamData] = useState<TeamOrdersData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && teamId) {
      loadTeamOrders();
    }
  }, [isOpen, teamId]);

  const loadTeamOrders = async () => {
    if (!teamId) return;
    
    setLoading(true);
    setError(null);

    try {
      // Get orders with impact
      const ordersWithImpact = await TeamOrdersService.getTeamOrdersWithImpact(teamId);
      
      // Get team data
      const { data: team } = await supabase
        .from('teams')
        .select('*')
        .eq('id', teamId)
        .single();

      // Get market cap timeline
      const marketCapTimeline = await TeamOrdersService.getTeamMarketCapTimeline(teamId);

      const totalCashAdded = ordersWithImpact.reduce((sum, order) => sum + order.cash_added_to_market_cap, 0);
      const totalSharesTraded = ordersWithImpact.reduce((sum, order) => sum + order.quantity, 0);

      setTeamData({
        team: team!,
        orders: ordersWithImpact,
        total_cash_added: totalCashAdded,
        total_shares_traded: totalSharesTraded,
        market_cap_timeline: marketCapTimeline
      });

    } catch (err) {
      console.error('Error loading team orders:', err);
      setError(err instanceof Error ? err.message : 'Failed to load team orders');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          {/* Header */}
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-gray-900">
              {teamName} - Share Orders
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 text-2xl"
            >
              ×
            </button>
          </div>

          {loading && (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
              <p className="mt-2 text-gray-600">Loading orders...</p>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-4 mb-4">
              <p className="text-red-600">{error}</p>
            </div>
          )}

          {teamData && (
            <>
              {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="bg-blue-50 p-4 rounded-lg">
                  <h3 className="text-sm font-medium text-blue-900">Total Cash Added</h3>
                  <p className="text-2xl font-bold text-blue-700">
                    ${teamData.total_cash_added.toLocaleString()}
                  </p>
                  <p className="text-sm text-blue-600">to market cap</p>
                </div>
                
                <div className="bg-green-50 p-4 rounded-lg">
                  <h3 className="text-sm font-medium text-green-900">Total Shares Traded</h3>
                  <p className="text-2xl font-bold text-green-700">
                    {teamData.total_shares_traded.toLocaleString()}
                  </p>
                  <p className="text-sm text-green-600">shares purchased</p>
                </div>
                
                <div className="bg-purple-50 p-4 rounded-lg">
                  <h3 className="text-sm font-medium text-purple-900">Current Market Cap</h3>
                  <p className="text-2xl font-bold text-purple-700">
                    ${teamData.team.market_cap.toLocaleString()}
                  </p>
                  <p className="text-sm text-purple-600">total value</p>
                </div>
              </div>

              {/* Orders Timeline */}
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Order History & Impact</h3>
                
                {teamData.orders.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <p>No orders found for this team</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {teamData.orders.map((order, index) => (
                      <div key={order.id} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                        <div className="flex justify-between items-start mb-3">
                          <div>
                            <h4 className="font-medium text-gray-900">
                              Order #{order.id} - {order.quantity} shares @ ${order.price_per_share}
                            </h4>
                            <p className="text-sm text-gray-600">
                              {new Date(order.executed_at || order.updated_at).toLocaleDateString()} at{' '}
                              {new Date(order.executed_at || order.updated_at).toLocaleTimeString()}
                            </p>
                          </div>
                          <div className="text-right'>
                            <div className="text-lg font-bold text-green-600">
                              +${order.cash_added_to_market_cap.toLocaleString()}
                            </div>
                            <div className="text-sm text-gray-500">cash added</div>
                          </div>
                        </div>
                        
                        {/* Market Cap Impact */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                          <div>
                            <p className="font-medium text-gray-700">Market Cap Before</p>
                            <p className="text-lg font-semibold">${order.market_cap_before.toLocaleString()}</p>
                          </div>
                          <div>
                            <p className="font-medium text-gray-700">Market Cap After</p>
                            <p className="text-lg font-semibold">${order.market_cap_after.toLocaleString()}</p>
                          </div>
                          <div>
                            <p className="font-medium text-gray-700">Share Price Before</p>
                            <p className="text-lg font-semibold">${order.share_price_before.toFixed(2)}</p>
                          </div>
                          <div>
                            <p className="font-medium text-gray-700">Share Price After</p>
                            <p className="text-lg font-semibold">${order.share_price_after.toFixed(2)}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Market Cap Timeline */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Market Cap Timeline</h3>
                <div className="bg-white border border-gray-200 rounded-lg">
                  <div className="divide-y divide-gray-200">
                    {teamData.market_cap_timeline.map((event, index) => (
                      <div key={index} className="p-4">
                        <div className="flex justify-between items-center">
                          <div>
                            <p className="font-medium text-gray-900">{event.description}</p>
                            <p className="text-sm text-gray-500">
                              {new Date(event.date).toLocaleDateString()}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm text-gray-600">
                              ${event.market_cap_before.toLocaleString()} → ${event.market_cap_after.toLocaleString()}
                            </p>
                            {event.cash_added && (
                              <p className="text-sm text-green-600 font-medium">
                                +${event.cash_added.toLocaleString()} added
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
