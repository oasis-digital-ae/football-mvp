// Main admin dashboard component
import React, { useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/components/ui/tabs';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import { Shield, AlertTriangle, RefreshCw, Users, TrendingUp, BarChart3, Calendar, DollarSign, Database } from 'lucide-react';
import { DashboardOverview } from './DashboardOverview';
import { UsersManagementPanel } from './UsersManagementPanel';
import { TradingActivityTable } from './TradingActivityTable';
import { TeamsManagementPanel } from './TeamsManagementPanel';
import { MatchesManagementPanel } from './MatchesManagementPanel';
import { FinancialOverviewPanel } from './FinancialOverviewPanel';
import { AuditLogViewer } from './AuditLogViewer';
import { AdminErrorBoundary } from './AdminErrorBoundary';
import { adminService } from '@/shared/lib/services/admin.service';
import { useAuth } from '@/features/auth/contexts/AuthContext';
import { useAppContext } from '@/features/trading/contexts/AppContext';

export const AdminDashboard: React.FC = () => {
  const { user, isAdmin } = useAuth();
  const { setCurrentPage } = useAppContext();

  // Redirect if user is not admin
  useEffect(() => {
    if (!isAdmin) {
      setCurrentPage('marketplace');
    }
  }, [isAdmin, setCurrentPage]);

  // Log admin dashboard access
  useEffect(() => {
    if (user && isAdmin) {
      adminService.logAdminAction('dashboard_viewed', {
        userId: user.id,
        timestamp: new Date().toISOString()
      });
    }
  }, [user, isAdmin]);

  // Don't render if user is not admin
  if (!isAdmin) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            <span>Access Denied</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            You do not have permission to access the admin panel.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <AdminErrorBoundary>
      <div className="min-h-screen bg-background">
        {/* Header */}
        <div className="border-b bg-card">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              <div className="flex items-center space-x-3">
                <div className="flex items-center justify-center w-10 h-10 bg-primary rounded-full">
                  <Shield className="w-6 h-6 text-primary-foreground" />
                </div>
                <div>
                  <h1 className="text-xl font-bold">Admin Dashboard</h1>
                  <p className="text-sm text-muted-foreground">
                    System overview and user management
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <Badge variant="secondary" className="bg-green-100 text-green-800">
                  Admin Access
                </Badge>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.location.reload()}
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Refresh All
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Tabs defaultValue="dashboard" className="space-y-6">
            <TabsList className="grid w-full grid-cols-7">
              <TabsTrigger value="dashboard" className="flex items-center gap-2">
                <Shield className="h-4 w-4" />
                <span className="hidden sm:inline">Dashboard</span>
              </TabsTrigger>
              <TabsTrigger value="users" className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                <span className="hidden sm:inline">Users & Wallets</span>
              </TabsTrigger>
              <TabsTrigger value="trading" className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                <span className="hidden sm:inline">Trading Activity</span>
              </TabsTrigger>
              <TabsTrigger value="teams" className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                <span className="hidden sm:inline">Teams & Market</span>
              </TabsTrigger>
              <TabsTrigger value="matches" className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                <span className="hidden sm:inline">Matches & Fixtures</span>
              </TabsTrigger>
              <TabsTrigger value="financial" className="flex items-center gap-2">
                <DollarSign className="h-4 w-4" />
                <span className="hidden sm:inline">Financial Overview</span>
              </TabsTrigger>
              <TabsTrigger value="audit" className="flex items-center gap-2">
                <Database className="h-4 w-4" />
                <span className="hidden sm:inline">System & Audit</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="dashboard" className="space-y-6">
              <DashboardOverview />
            </TabsContent>

            <TabsContent value="users" className="space-y-6">
              <UsersManagementPanel />
            </TabsContent>

            <TabsContent value="trading" className="space-y-6">
              <TradingActivityTable />
            </TabsContent>

            <TabsContent value="teams" className="space-y-6">
              <TeamsManagementPanel />
            </TabsContent>

            <TabsContent value="matches" className="space-y-6">
              <MatchesManagementPanel />
            </TabsContent>

            <TabsContent value="financial" className="space-y-6">
              <FinancialOverviewPanel />
            </TabsContent>

            <TabsContent value="audit" className="space-y-6">
              <AuditLogViewer />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </AdminErrorBoundary>
  );
};
