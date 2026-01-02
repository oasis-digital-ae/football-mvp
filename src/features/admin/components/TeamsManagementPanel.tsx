// Teams management panel component
import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/components/ui/table';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Badge } from '@/shared/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/components/ui/tabs';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { 
  TrendingUp, 
  TrendingDown,
  Search, 
  Eye, 
  Edit,
  Download,
  RefreshCw,
  AlertCircle,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Users,
  BarChart3
} from 'lucide-react';
import { teamsAdminService, type TeamWithMetrics, type TeamPerformance } from '@/shared/lib/services/teams-admin.service';
import { formatCurrency } from '@/shared/lib/formatters';
import { useToast } from '@/shared/hooks/use-toast';
import TeamLogo from '@/shared/components/TeamLogo';

type SortField = 'name' | 'market_cap' | 'share_price' | 'available_shares' | 'total_invested' | 'price_change_24h';
type SortDirection = 'asc' | 'desc';

export const TeamsManagementPanel: React.FC = () => {
  const [teams, setTeams] = useState<TeamWithMetrics[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<TeamPerformance | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<SortField>('market_cap');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editMarketCap, setEditMarketCap] = useState('');
  const [editReason, setEditReason] = useState('');
  const [updating, setUpdating] = useState(false);
  const { toast } = useToast();

  const loadTeams = async () => {
    try {
      setLoading(true);
      const teamsList = await teamsAdminService.getAllTeamsWithMetrics();
      setTeams(teamsList);
    } catch (error) {
      console.error('Error loading teams:', error);
      toast({
        title: 'Error',
        description: 'Failed to load teams',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTeams();
  }, []);

  const handleTeamClick = async (teamId: number) => {
    setLoadingDetails(true);
    setIsDetailModalOpen(true);
    try {
      const performance = await teamsAdminService.getTeamPerformance(teamId);
      setSelectedTeam(performance);
    } catch (error) {
      console.error('Error loading team details:', error);
      toast({
        title: 'Error',
        description: 'Failed to load team details',
        variant: 'destructive'
      });
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleEditMarketCap = async () => {
    if (!selectedTeam || !editMarketCap) return;
    
    const newCap = parseFloat(editMarketCap);
    if (isNaN(newCap) || newCap <= 0) {
      toast({
        title: 'Invalid Amount',
        description: 'Please enter a valid positive market cap',
        variant: 'destructive'
      });
      return;
    }

    if (!editReason.trim()) {
      toast({
        title: 'Reason Required',
        description: 'Please provide a reason for this adjustment',
        variant: 'destructive'
      });
      return;
    }

    setUpdating(true);
    try {
      await teamsAdminService.updateTeamMarketCap(selectedTeam.team_id, newCap, editReason);
      toast({
        title: 'Success',
        description: `Market cap updated for ${selectedTeam.team_name}`
      });
      setEditMarketCap('');
      setEditReason('');
      setIsEditModalOpen(false);
      await loadTeams();
      // Reload team details
      const performance = await teamsAdminService.getTeamPerformance(selectedTeam.team_id);
      setSelectedTeam(performance);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update market cap',
        variant: 'destructive'
      });
    } finally {
      setUpdating(false);
    }
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const filteredAndSortedTeams = useMemo(() => {
    let filtered = teams.filter(team =>
      team.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      team.short_name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    filtered.sort((a, b) => {
      let aValue: any;
      let bValue: any;

      switch (sortField) {
        case 'name':
          aValue = a.name.toLowerCase();
          bValue = b.name.toLowerCase();
          break;
        case 'market_cap':
          aValue = a.market_cap;
          bValue = b.market_cap;
          break;
        case 'share_price':
          aValue = a.share_price;
          bValue = b.share_price;
          break;
        case 'available_shares':
          aValue = a.available_shares;
          bValue = b.available_shares;
          break;
        case 'total_invested':
          aValue = a.total_invested;
          bValue = b.total_invested;
          break;
        case 'price_change_24h':
          aValue = a.price_change_24h;
          bValue = b.price_change_24h;
          break;
        default:
          return 0;
      }

      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return filtered;
  }, [teams, searchTerm, sortField, sortDirection]);

  const handleExportCSV = () => {
    const headers = [
      'Team Name',
      'Market Cap',
      'Share Price',
      'Available Shares',
      'Total Shares',
      'Total Invested',
      '24h Change',
      '24h Change %'
    ];

    const csvData = filteredAndSortedTeams.map(team => [
      team.name,
      team.market_cap,
      team.share_price,
      team.available_shares,
      team.total_shares,
      team.total_invested,
      team.price_change_24h,
      team.price_change_percent_24h.toFixed(2) + '%'
    ]);

    const csvContent = [
      headers.join(','),
      ...csvData.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `teams-export-${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) {
      return <ArrowUpDown className="h-4 w-4" />;
    }
    return sortDirection === 'asc' ? 
      <ArrowUp className="h-4 w-4" /> : 
      <ArrowDown className="h-4 w-4" />;
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Teams & Market
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Teams & Market
              <Badge variant="secondary">{filteredAndSortedTeams.length} teams</Badge>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={loadTeams}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
              <Button variant="outline" size="sm" onClick={handleExportCSV}>
                <Download className="h-4 w-4 mr-2" />
                Export CSV
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Search */}
          <div className="mb-4">
            <div className="relative max-w-sm">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search teams..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8"
              />
            </div>
          </div>

          {/* Table */}
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <Button variant="ghost" onClick={() => handleSort('name')} className="h-auto p-0 font-medium">
                      Team <SortIcon field="name" />
                    </Button>
                  </TableHead>
                  <TableHead className="text-center">
                    <Button variant="ghost" onClick={() => handleSort('market_cap')} className="h-auto p-0 font-medium">
                      Market Cap <SortIcon field="market_cap" />
                    </Button>
                  </TableHead>
                  <TableHead className="text-center">
                    <Button variant="ghost" onClick={() => handleSort('share_price')} className="h-auto p-0 font-medium">
                      Share Price <SortIcon field="share_price" />
                    </Button>
                  </TableHead>
                  <TableHead className="text-center">
                    <Button variant="ghost" onClick={() => handleSort('available_shares')} className="h-auto p-0 font-medium">
                      Available <SortIcon field="available_shares" />
                    </Button>
                  </TableHead>
                  <TableHead className="text-center">
                    <Button variant="ghost" onClick={() => handleSort('total_invested')} className="h-auto p-0 font-medium">
                      Total Invested <SortIcon field="total_invested" />
                    </Button>
                  </TableHead>
                  <TableHead className="text-center">
                    <Button variant="ghost" onClick={() => handleSort('price_change_24h')} className="h-auto p-0 font-medium">
                      24h Change <SortIcon field="price_change_24h" />
                    </Button>
                  </TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAndSortedTeams.map((team) => (
                  <TableRow key={team.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <TeamLogo teamName={team.name} externalId={team.external_id} size="sm" />
                        <div>
                          <p className="font-medium">{team.name}</p>
                          <p className="text-xs text-muted-foreground">{team.short_name}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="font-medium font-mono">{formatCurrency(team.market_cap)}</div>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="font-medium font-mono">{formatCurrency(team.share_price)}</div>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="font-medium font-mono">{team.available_shares} / {team.total_shares}</div>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="font-medium font-mono">{formatCurrency(team.total_invested)}</div>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        {team.price_change_24h >= 0 ? (
                          <TrendingUp className="h-4 w-4 text-green-600" />
                        ) : (
                          <TrendingDown className="h-4 w-4 text-red-600" />
                        )}
                        <span className={`font-mono ${team.price_change_24h >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {team.price_change_24h >= 0 ? '+' : ''}{formatCurrency(team.price_change_24h)} 
                          ({team.price_change_percent_24h >= 0 ? '+' : ''}{team.price_change_percent_24h.toFixed(2)}%)
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleTeamClick(team.id)}
                      >
                        <Eye className="h-4 w-4 mr-1" />
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {filteredAndSortedTeams.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              {searchTerm ? 'No teams found matching your search.' : 'No teams found.'}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Team Detail Modal */}
      <Dialog open={isDetailModalOpen} onOpenChange={setIsDetailModalOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Team Details: {selectedTeam?.team_name || 'Loading...'}
            </DialogTitle>
          </DialogHeader>

          {loadingDetails ? (
            <div className="space-y-4">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-40 w-full" />
            </div>
          ) : selectedTeam ? (
            <Tabs defaultValue="overview" className="w-full">
              <TabsList>
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="performance">Performance</TabsTrigger>
                <TabsTrigger value="holders">Top Holders</TabsTrigger>
                <TabsTrigger value="matches">Match History</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm">Market Data</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-sm text-muted-foreground">Market Cap:</span>
                        <span className="font-medium">{formatCurrency(
                          teams.find(t => t.id === selectedTeam.team_id)?.market_cap || 0
                        )}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-muted-foreground">Share Price:</span>
                        <span className="font-medium">{formatCurrency(
                          teams.find(t => t.id === selectedTeam.team_id)?.share_price || 0
                        )}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-muted-foreground">Available Shares:</span>
                        <span className="font-medium">
                          {teams.find(t => t.id === selectedTeam.team_id)?.available_shares || 0} / 1000
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-muted-foreground">Total Invested:</span>
                        <span className="font-medium">{formatCurrency(
                          teams.find(t => t.id === selectedTeam.team_id)?.total_invested || 0
                        )}</span>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm">Actions</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Button
                        variant="outline"
                        className="w-full"
                        onClick={() => {
                          const team = teams.find(t => t.id === selectedTeam.team_id);
                          setEditMarketCap(team?.market_cap.toString() || '0');
                          setIsEditModalOpen(true);
                        }}
                      >
                        <Edit className="h-4 w-4 mr-2" />
                        Adjust Market Cap
                      </Button>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="performance" className="space-y-4 mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Market Cap History</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {selectedTeam.market_cap_history.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No history available</p>
                      ) : (
                        selectedTeam.market_cap_history.map((entry, index) => (
                          <div key={index} className="flex items-center justify-between p-2 border rounded">
                            <div>
                              <p className="text-sm font-medium">{formatCurrency(entry.market_cap)}</p>
                              <p className="text-xs text-muted-foreground">
                                {new Date(entry.date).toLocaleDateString()}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm">{formatCurrency(entry.share_price)}</p>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="holders" className="space-y-4 mt-4">
                <div className="space-y-2">
                  {selectedTeam.top_holders.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No holders</p>
                  ) : (
                    selectedTeam.top_holders.map((holder, index) => (
                      <Card key={index}>
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-medium">{holder.username}</p>
                              <p className="text-sm text-muted-foreground">
                                {holder.quantity} shares
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="font-medium">{formatCurrency(holder.current_value)}</p>
                              <p className="text-sm text-muted-foreground">
                                Invested: {formatCurrency(holder.total_invested)}
                              </p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))
                  )}
                </div>
              </TabsContent>

              <TabsContent value="matches" className="space-y-4 mt-4">
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {selectedTeam.match_results.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No match results</p>
                  ) : (
                    selectedTeam.match_results.map((match) => (
                      <Card key={match.fixture_id}>
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="flex items-center gap-2">
                                <Badge variant={
                                  match.result === 'win' ? 'default' :
                                  match.result === 'loss' ? 'destructive' : 'secondary'
                                }>
                                  {match.result.toUpperCase()}
                                </Badge>
                                <p className="font-medium">vs {match.opponent}</p>
                              </div>
                              <p className="text-xs text-muted-foreground">
                                {new Date(match.date).toLocaleDateString()}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-medium">
                                {formatCurrency(match.market_cap_before)} → {formatCurrency(match.market_cap_after)}
                              </p>
                              <p className={`text-xs ${match.change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {match.change >= 0 ? '+' : ''}{formatCurrency(match.change)} 
                                ({match.change_percent >= 0 ? '+' : ''}{match.change_percent.toFixed(2)}%)
                              </p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))
                  )}
                </div>
              </TabsContent>
            </Tabs>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Edit Market Cap Modal */}
      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adjust Market Cap</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">New Market Cap</label>
              <Input
                type="number"
                placeholder="Enter new market cap"
                value={editMarketCap}
                onChange={(e) => setEditMarketCap(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Reason</label>
              <Input
                placeholder="Reason for adjustment"
                value={editReason}
                onChange={(e) => setEditReason(e.target.value)}
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setIsEditModalOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleEditMarketCap} disabled={updating || !editMarketCap || !editReason}>
                {updating ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : null}
                Update
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};




