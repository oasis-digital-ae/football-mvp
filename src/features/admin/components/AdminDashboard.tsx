// Main admin dashboard component
import React, { useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/components/ui/tabs';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import { Shield, AlertTriangle, RefreshCw } from 'lucide-react';
import { SystemStatsCard } from './SystemStatsCard';
import { UserInvestmentsTable } from './UserInvestmentsTable';
import { TradeHistoryTable } from './TradeHistoryTable';
import { SystemActivityCard } from './SystemActivityCard';
import { AuditLogViewer } from './AuditLogViewer';
import { AdminErrorBoundary } from './AdminErrorBoundary';
import { adminService } from '@/shared/lib/services/admin.service';
import { useAuth } from '@/features/auth/contexts/AuthContext';

export const AdminDashboard: React.FC = () => {
  const { user } = useAuth();

  useEffect(() => {
    // Log admin dashboard access
    if (user) {
      adminService.logAdminAction('dashboard_viewed', {
        userId: user.id,
        timestamp: new Date().toISOString()
      });
    }
  }, [user]);

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
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview">System Overview</TabsTrigger>
            <TabsTrigger value="users">User Investments</TabsTrigger>
            <TabsTrigger value="trades">Trade History</TabsTrigger>
            <TabsTrigger value="audit">Audit Logs</TabsTrigger>
          </TabsList>

            <TabsContent value="overview" className="space-y-6">
              <SystemStatsCard />
              
              {/* Additional Overview Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Quick Actions</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Button variant="outline" className="w-full justify-start">
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Refresh System Data
                    </Button>
                    <Button variant="outline" className="w-full justify-start">
                      <Shield className="h-4 w-4 mr-2" />
                      View Audit Logs
                    </Button>
                    <Button variant="outline" className="w-full justify-start">
                      <AlertTriangle className="h-4 w-4 mr-2" />
                      System Health Check
                    </Button>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">System Activity</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <SystemActivityCard />
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="users" className="space-y-6">
              <UserInvestmentsTable />
            </TabsContent>

            <TabsContent value="trades" className="space-y-6">
              <TradeHistoryTable />
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
