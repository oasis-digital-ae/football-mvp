import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Badge } from '@/shared/components/ui/badge';
import { formatCurrency, formatNumber } from '@/shared/lib/formatters';
import { cashInjectionTracker, type CashInjectionWithDetails } from '@/shared/lib/cash-injection-tracker';
import { Calendar, DollarSign, TrendingUp, Users, ArrowRight } from 'lucide-react';

interface CashInjectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  teamId: number;
  teamName: string;
}

export const CashInjectionModal: React.FC<CashInjectionModalProps> = ({
  isOpen,
  onClose,
  teamId,
  teamName
}) => {
  const [injections, setInjections] = useState<CashInjectionWithDetails[]>([]);
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<{
    totalInjections: number;
    totalAmount: number;
    averageInjection: number;
    largestInjection: number;
    injectionCount: number;
  } | null>(null);

  useEffect(() => {
    if (isOpen && teamId) {
      loadCashInjections();
    }
  }, [isOpen, teamId]);

  const loadCashInjections = async () => {
    setLoading(true);
    try {
      const [injectionsData, summaryData] = await Promise.all([
        cashInjectionTracker.getTeamInjections(teamId),
        cashInjectionTracker.getTeamInjectionSummary(teamId)
      ]);
      
      setInjections(injectionsData);
      setSummary(summaryData);
    } catch (error) {
      console.error('Error loading cash injections:', error);
    } finally {
      setLoading(false);
    }
  };

  const getInjectionIcon = (amount: number) => {
    if (amount >= 1000) return '💰';
    if (amount >= 500) return '💵';
    if (amount >= 100) return '💸';
    return '💳';
  };

  const getInjectionSize = (amount: number) => {
    if (amount >= 1000) return 'Large';
    if (amount >= 500) return 'Medium';
    if (amount >= 100) return 'Small';
    return 'Micro';
  };

  const getInjectionSizeColor = (amount: number) => {
    if (amount >= 1000) return 'bg-green-500';
    if (amount >= 500) return 'bg-blue-500';
    if (amount >= 100) return 'bg-yellow-500';
    return 'bg-gray-500';
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Cash Injections - {teamName}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Summary Cards */}
            {summary && (
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-gray-500">Total Injections</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{summary.totalInjections}</div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-gray-500">Total Amount</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-green-600">
                      {formatCurrency(summary.totalAmount)}
                    </div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-gray-500">Average Injection</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {formatCurrency(summary.averageInjection)}
                    </div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-gray-500">Largest Injection</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-blue-600">
                      {formatCurrency(summary.largestInjection)}
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Cash Injections Timeline */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Cash Injection Timeline
                </CardTitle>
              </CardHeader>
              <CardContent>
                {injections.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <DollarSign className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No cash injections recorded yet</p>
                    <p className="text-sm">Cash injections will appear here when users purchase shares</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {injections.map((injection, index) => (
                      <div key={injection.id} className="border rounded-lg p-4 hover:bg-gray-50">
                        <div className="flex items-start justify-between">
                          <div className="flex items-start gap-3">
                            <div className="text-2xl">
                              {getInjectionIcon(injection.amount)}
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2">
                                <Badge className={getInjectionSizeColor(injection.amount)}>
                                  {getInjectionSize(injection.amount)}
                                </Badge>
                                <span className="text-sm text-gray-500">
                                  {new Date(injection.created_at).toLocaleDateString()}
                                </span>
                              </div>
                              
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <span className="font-semibold text-lg">
                                    {formatCurrency(injection.amount)}
                                  </span>
                                  <span className="text-sm text-gray-500">
                                    ({formatNumber(injection.shares_purchased)} shares @ {formatCurrency(injection.price_per_share)})
                                  </span>
                                </div>
                                
                                <div className="flex items-center gap-2 text-sm text-gray-600">
                                  <Users className="h-4 w-4" />
                                  <span>by {injection.user_email}</span>
                                </div>
                                
                                <div className="flex items-center gap-2 text-sm text-gray-600">
                                  <TrendingUp className="h-4 w-4" />
                                  <span>
                                    Market cap: {formatCurrency(injection.market_cap_before)} → {formatCurrency(injection.market_cap_after)}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                          
                          <div className="text-right">
                            <div className="text-sm text-gray-500 mb-1">Market Cap Impact</div>
                            <div className="text-lg font-semibold text-green-600">
                              +{formatCurrency(injection.amount)}
                            </div>
                            <div className="text-xs text-gray-500">
                              {((injection.amount / injection.market_cap_before) * 100).toFixed(1)}% increase
                            </div>
                          </div>
                        </div>
                        
                        {/* Fixture Context */}
                        {(injection.fixture_before || injection.fixture_after) && (
                          <div className="mt-3 pt-3 border-t border-gray-200">
                            <div className="flex items-center gap-2 text-sm text-gray-600">
                              <Calendar className="h-4 w-4" />
                              <span>Between matches:</span>
                              {injection.fixture_before && (
                                <span>
                                  vs {injection.fixture_before.opponent} ({injection.fixture_before.result})
                                </span>
                              )}
                              {injection.fixture_before && injection.fixture_after && (
                                <ArrowRight className="h-3 w-3" />
                              )}
                              {injection.fixture_after && (
                                <span>
                                  vs {injection.fixture_after.opponent}
                                </span>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};


