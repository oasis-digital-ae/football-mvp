// Audit log viewer component for admin dashboard
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/components/ui/table';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { 
  Download, 
  Search, 
  Filter, 
  AlertCircle,
  User,
  Shield,
  Activity,
  Calendar
} from 'lucide-react';
import { supabase } from '@/shared/lib/supabase';
import { formatCurrency } from '@/shared/lib/formatters';

interface AuditLogEntry {
  id: number;
  user_id: string | null;
  action: string;
  table_name: string;
  record_id: number | null;
  new_values: any;
  created_at: string;
  profiles?: {
    username: string;
    full_name: string;
  };
}

export const AuditLogViewer: React.FC = () => {
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [actionFilter, setActionFilter] = useState<string>('all');
  const [tableFilter, setTableFilter] = useState<string>('all');

  const fetchAuditLogs = async () => {
    try {
      setLoading(true);
      setError(null);

      let query = supabase
        .from('audit_log')
        .select(`
          *,
          profiles(username, full_name)
        `)
        .order('created_at', { ascending: false })
        .limit(1000);

      // Apply filters
      if (actionFilter !== 'all') {
        query = query.eq('action', actionFilter);
      }

      if (tableFilter !== 'all') {
        query = query.eq('table_name', tableFilter);
      }

      const { data, error: fetchError } = await query;

      if (fetchError) throw fetchError;

      setAuditLogs(data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch audit logs');
      console.error('Error fetching audit logs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAuditLogs();
  }, [actionFilter, tableFilter]);

  const filteredLogs = auditLogs.filter(log => {
    if (!searchTerm) return true;
    
    const searchLower = searchTerm.toLowerCase();
    return (
      log.action.toLowerCase().includes(searchLower) ||
      log.table_name.toLowerCase().includes(searchLower) ||
      (log.profiles?.username?.toLowerCase().includes(searchLower)) ||
      (log.profiles?.full_name?.toLowerCase().includes(searchLower)) ||
      JSON.stringify(log.new_values).toLowerCase().includes(searchLower)
    );
  });

  const handleExportCSV = () => {
    if (filteredLogs.length === 0) return;

    const headers = [
      'ID',
      'Timestamp',
      'User',
      'Action',
      'Table',
      'Record ID',
      'Details'
    ];

    const csvData = filteredLogs.map(log => [
      log.id,
      new Date(log.created_at).toISOString(),
      log.profiles?.username || 'System',
      log.action,
      log.table_name,
      log.record_id || '',
      JSON.stringify(log.new_values)
    ]);

    const csvContent = [
      headers.join(','),
      ...csvData.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `audit-logs-${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getActionBadge = (action: string) => {
    if (action.includes('purchase')) {
      return <Badge variant="default" className="bg-green-100 text-green-800">Purchase</Badge>;
    }
    if (action.includes('match')) {
      return <Badge variant="default" className="bg-blue-100 text-blue-800">Match</Badge>;
    }
    if (action.includes('admin')) {
      return <Badge variant="default" className="bg-purple-100 text-purple-800">Admin</Badge>;
    }
    if (action.includes('security')) {
      return <Badge variant="destructive">Security</Badge>;
    }
    return <Badge variant="outline">{action}</Badge>;
  };

  const getActionIcon = (action: string) => {
    if (action.includes('purchase') || action.includes('financial')) {
      return <Activity className="h-4 w-4 text-green-600" />;
    }
    if (action.includes('admin')) {
      return <Shield className="h-4 w-4 text-purple-600" />;
    }
    if (action.includes('security')) {
      return <AlertCircle className="h-4 w-4 text-red-600" />;
    }
    return <User className="h-4 w-4 text-gray-600" />;
  };

  const formatDetails = (newValues: any) => {
    if (!newValues) return 'No details';
    
    // Format financial data
    if (newValues.total_amount) {
      return `Amount: ${formatCurrency(newValues.total_amount)}, Shares: ${newValues.shares || newValues.quantity}`;
    }
    
    // Format match data
    if (newValues.home_team_id && newValues.away_team_id) {
      return `Match: ${newValues.home_score || 0} - ${newValues.away_score || 0}`;
    }
    
    // Format admin data
    if (newValues.admin_action) {
      return `Admin Action: ${newValues.action || 'Unknown'}`;
    }
    
    return JSON.stringify(newValues, null, 2).substring(0, 100) + '...';
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Audit Logs</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="flex items-center space-x-4">
                <Skeleton className="h-4 w-4" />
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-48" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Audit Logs</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center space-x-2 text-destructive">
            <AlertCircle className="h-4 w-4" />
            <span>{error}</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Calendar className="h-5 w-5" />
            <span>Audit Logs</span>
            <Badge variant="secondary">{filteredLogs.length} entries</Badge>
          </div>
          <Button variant="outline" size="sm" onClick={handleExportCSV}>
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Filters */}
        <div className="flex items-center space-x-4 mb-6">
          <div className="flex-1 max-w-sm">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search logs..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8"
              />
            </div>
          </div>
          
          <Select value={actionFilter} onValueChange={setActionFilter}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Filter by action" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Actions</SelectItem>
              <SelectItem value="share_purchase">Share Purchases</SelectItem>
              <SelectItem value="match_result_processed">Match Results</SelectItem>
              <SelectItem value="dashboard_viewed">Admin Access</SelectItem>
              <SelectItem value="data_exported">Data Exports</SelectItem>
            </SelectContent>
          </Select>

          <Select value={tableFilter} onValueChange={setTableFilter}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Filter by table" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Tables</SelectItem>
              <SelectItem value="orders">Orders</SelectItem>
              <SelectItem value="fixtures">Fixtures</SelectItem>
              <SelectItem value="admin_panel">Admin Panel</SelectItem>
              <SelectItem value="financial_transactions">Financial</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Audit Logs Table */}
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Timestamp</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Table</TableHead>
                <TableHead>Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredLogs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell>
                    <div className="text-sm">
                      {new Date(log.created_at).toLocaleDateString()}
                      <br />
                      <span className="text-muted-foreground">
                        {new Date(log.created_at).toLocaleTimeString()}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center space-x-2">
                      {getActionIcon(log.action)}
                      <span className="text-sm font-medium">
                        {log.profiles?.username || 'System'}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {getActionBadge(log.action)}
                  </TableCell>
                  <TableCell>
                    <span className="text-sm font-mono">{log.table_name}</span>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm max-w-md">
                      {formatDetails(log.new_values)}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {filteredLogs.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            {searchTerm || actionFilter !== 'all' || tableFilter !== 'all' 
              ? 'No audit logs found matching your filters.' 
              : 'No audit logs found.'}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

