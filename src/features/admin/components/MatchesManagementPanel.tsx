// Matches management panel component
import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/components/ui/table';
import { Button } from '@/shared/components/ui/button';
import { Badge } from '@/shared/components/ui/badge';
import { Input } from '@/shared/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { 
  Calendar,
  TrendingUp,
  TrendingDown,
  Search,
  RefreshCw,
  PlayCircle,
  Download,
  AlertCircle,
  CheckCircle,
  ArrowUpDown,
  ArrowUp,
  ArrowDown
} from 'lucide-react';
import { fixturesService, type DatabaseFixtureWithTeams } from '@/shared/lib/database';
import { matchProcessingService } from '@/shared/lib/match-processing';
import { footballIntegrationService } from '@/shared/lib/football-api';
import { useToast } from '@/shared/hooks/use-toast';
import { formatCurrency } from '@/shared/lib/formatters';
import TeamLogo from '@/shared/components/TeamLogo';

type SortField = 'kickoff_at' | 'home_team' | 'away_team' | 'status' | 'result';
type SortDirection = 'asc' | 'desc';

export const MatchesManagementPanel: React.FC = () => {
  const [fixtures, setFixtures] = useState<DatabaseFixtureWithTeams[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortField, setSortField] = useState<SortField>('kickoff_at');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const { toast } = useToast();

  const loadFixtures = async () => {
    try {
      setLoading(true);
      const fixturesData = await fixturesService.getAll();
      setFixtures(fixturesData);
    } catch (error) {
      console.error('Error loading fixtures:', error);
      toast({
        title: 'Error',
        description: 'Failed to load fixtures',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFixtures();
  }, []);

  const handleProcessAll = async () => {
    setProcessing(true);
    try {
      const result = await matchProcessingService.processAllCompletedFixturesForMarketCap();
      toast({
        title: 'Processing Complete',
        description: `Processed: ${result.processed}, Skipped: ${result.skipped}, Errors: ${result.errors.length}`,
        variant: result.errors.length > 0 ? 'destructive' : 'default'
      });
      await loadFixtures();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to process matches',
        variant: 'destructive'
      });
    } finally {
      setProcessing(false);
    }
  };

  const handleSyncFixtures = async () => {
    setSyncing(true);
    try {
      await footballIntegrationService.syncPremierLeagueFixtures();
      toast({
        title: 'Success',
        description: 'Fixtures synced successfully'
      });
      await loadFixtures();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to sync fixtures',
        variant: 'destructive'
      });
    } finally {
      setSyncing(false);
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

  const filteredAndSortedFixtures = useMemo(() => {
    let filtered = fixtures.filter(fixture => {
      const matchesSearch = !searchTerm || 
        fixture.home_team?.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        fixture.away_team?.name.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesStatus = statusFilter === 'all' || fixture.status === statusFilter;
      
      return matchesSearch && matchesStatus;
    });

    filtered.sort((a, b) => {
      let aValue: any;
      let bValue: any;

      switch (sortField) {
        case 'kickoff_at':
          aValue = new Date(a.kickoff_at).getTime();
          bValue = new Date(b.kickoff_at).getTime();
          break;
        case 'home_team':
          aValue = (a.home_team?.name || '').toLowerCase();
          bValue = (b.home_team?.name || '').toLowerCase();
          break;
        case 'away_team':
          aValue = (a.away_team?.name || '').toLowerCase();
          bValue = (b.away_team?.name || '').toLowerCase();
          break;
        case 'status':
          aValue = a.status;
          bValue = b.status;
          break;
        case 'result':
          aValue = a.result || '';
          bValue = b.result || '';
          break;
        default:
          return 0;
      }

      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return filtered;
  }, [fixtures, searchTerm, statusFilter, sortField, sortDirection]);

  const pendingFixtures = fixtures.filter(f => f.status === 'applied' && f.result !== 'pending').length;
  const scheduledFixtures = fixtures.filter(f => f.status === 'scheduled').length;

  const handleExportCSV = () => {
    const headers = [
      'Date',
      'Home Team',
      'Away Team',
      'Score',
      'Status',
      'Result',
      'Market Cap Impact'
    ];

    const csvData = filteredAndSortedFixtures.map(fixture => [
      new Date(fixture.kickoff_at).toISOString(),
      fixture.home_team?.name || 'Unknown',
      fixture.away_team?.name || 'Unknown',
      `${fixture.home_score || 0}-${fixture.away_score || 0}`,
      fixture.status,
      fixture.result || 'pending',
      'N/A' // Market cap impact would need to be calculated
    ]);

    const csvContent = [
      headers.join(','),
      ...csvData.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `fixtures-export-${new Date().toISOString().split('T')[0]}.csv`);
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

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'scheduled':
        return <Badge variant="outline" className="text-blue-400 border-blue-400/50">Scheduled</Badge>;
      case 'closed':
        return <Badge variant="outline" className="text-yellow-400 border-yellow-400/50 animate-pulse">Live</Badge>;
      case 'applied':
        return <Badge variant="outline" className="text-green-400 border-green-400/50">Finished</Badge>;
      case 'postponed':
        return <Badge variant="outline" className="text-red-400 border-red-400/50">Postponed</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Matches & Fixtures
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
    <div className="space-y-6">
      {/* Match Processing Panel */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <PlayCircle className="h-5 w-5" />
              Match Processing
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary">{pendingFixtures} pending</Badge>
              <Badge variant="outline">{scheduledFixtures} scheduled</Badge>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <Button
              onClick={handleProcessAll}
              disabled={processing || pendingFixtures === 0}
              className="flex-1"
            >
              {processing ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <PlayCircle className="h-4 w-4 mr-2" />
              )}
              {processing ? 'Processing...' : 'Process All Match Results'}
            </Button>
            <Button
              onClick={handleSyncFixtures}
              disabled={syncing}
              variant="outline"
              className="flex-1"
            >
              {syncing ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              {syncing ? 'Syncing...' : 'Sync Fixtures from API'}
            </Button>
          </div>
          {pendingFixtures > 0 && (
            <div className="bg-yellow-900/30 border border-yellow-600/50 text-yellow-300 p-3 rounded-md flex items-center space-x-2">
              <AlertCircle className="h-5 w-5" />
              <span>{pendingFixtures} completed fixtures need market cap processing</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Fixtures Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Fixtures Overview
              <Badge variant="secondary">{filteredAndSortedFixtures.length} fixtures</Badge>
            </div>
            <Button variant="outline" size="sm" onClick={handleExportCSV}>
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search teams..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="scheduled">Scheduled</SelectItem>
                <SelectItem value="closed">Live</SelectItem>
                <SelectItem value="applied">Finished</SelectItem>
                <SelectItem value="postponed">Postponed</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Table */}
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <Button variant="ghost" onClick={() => handleSort('kickoff_at')} className="h-auto p-0 font-medium">
                      Date <SortIcon field="kickoff_at" />
                    </Button>
                  </TableHead>
                  <TableHead>
                    <Button variant="ghost" onClick={() => handleSort('home_team')} className="h-auto p-0 font-medium">
                      Home Team <SortIcon field="home_team" />
                    </Button>
                  </TableHead>
                  <TableHead>Away Team</TableHead>
                  <TableHead className="text-center">Score</TableHead>
                  <TableHead className="text-center">
                    <Button variant="ghost" onClick={() => handleSort('status')} className="h-auto p-0 font-medium">
                      Status <SortIcon field="status" />
                    </Button>
                  </TableHead>
                  <TableHead className="text-center">
                    <Button variant="ghost" onClick={() => handleSort('result')} className="h-auto p-0 font-medium">
                      Result <SortIcon field="result" />
                    </Button>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAndSortedFixtures.map((fixture) => (
                  <TableRow key={fixture.id}>
                    <TableCell>
                      <div className="text-sm">
                        {new Date(fixture.kickoff_at).toLocaleDateString()}
                        <br />
                        <span className="text-muted-foreground">
                          {new Date(fixture.kickoff_at).toLocaleTimeString()}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <TeamLogo 
                          teamName={fixture.home_team?.name || 'Home'} 
                          externalId={fixture.home_team?.external_id ? parseInt(fixture.home_team.external_id) : undefined}
                          size="sm" 
                        />
                        <span className="font-medium">{fixture.home_team?.name || 'Home'}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <TeamLogo 
                          teamName={fixture.away_team?.name || 'Away'} 
                          externalId={fixture.away_team?.external_id ? parseInt(fixture.away_team.external_id) : undefined}
                          size="sm" 
                        />
                        <span className="font-medium">{fixture.away_team?.name || 'Away'}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      {fixture.status === 'applied' && fixture.home_score !== null ? (
                        <div className="flex items-center justify-center gap-2">
                          <span className={`font-bold ${
                            fixture.result === 'home_win' ? 'text-green-400' : 'text-gray-400'
                          }`}>
                            {fixture.home_score}
                          </span>
                          <span>-</span>
                          <span className={`font-bold ${
                            fixture.result === 'away_win' ? 'text-green-400' : 'text-gray-400'
                          }`}>
                            {fixture.away_score}
                          </span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {getStatusBadge(fixture.status)}
                    </TableCell>
                    <TableCell className="text-center">
                      {fixture.result && fixture.result !== 'pending' ? (
                        <Badge variant={
                          fixture.result === 'home_win' ? 'default' :
                          fixture.result === 'away_win' ? 'default' : 'secondary'
                        }>
                          {fixture.result === 'home_win' ? 'Home Win' :
                           fixture.result === 'away_win' ? 'Away Win' : 'Draw'}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {filteredAndSortedFixtures.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              {searchTerm || statusFilter !== 'all' 
                ? 'No fixtures found matching your filters.' 
                : 'No fixtures found.'}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};







