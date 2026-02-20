import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Button } from '@/shared/components/ui/button';
import { Alert, AlertDescription } from '@/shared/components/ui/alert';
import { Badge } from '@/shared/components/ui/badge';
import { seasonManagementService, SeasonInfo } from '@/shared/lib/season-management.service';
import { useToast } from '@/shared/hooks/use-toast';
import { RefreshCw, Calendar, Database, AlertTriangle, CheckCircle } from 'lucide-react';

export const SeasonUpdatePanel: React.FC = () => {
  const { toast } = useToast();
  const [seasonStatus, setSeasonStatus] = useState<{
    apiSeason: SeasonInfo | null;
    dbSeason: number | null;
    needsUpdate: boolean;
    message: string;
  } | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const loadSeasonStatus = async () => {
    try {
      setIsLoading(true);
      const status = await seasonManagementService.getSeasonStatus();
      setSeasonStatus(status);
    } catch (error) {
      console.error('Error loading season status:', error);
      toast({
        title: 'Error',
        description: 'Failed to load season status',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSeasonUpdate = async () => {
    try {
      setIsUpdating(true);
      const result = await seasonManagementService.updateToNewSeason();
      
      if (result.success) {
        toast({
          title: 'Success',
          description: result.message,
        });
        await loadSeasonStatus(); // Refresh status
      } else {
        toast({
          title: 'Error',
          description: result.message,
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error updating season:', error);
      toast({
        title: 'Error',
        description: 'Failed to update season',
        variant: 'destructive',
      });
    } finally {
      setIsUpdating(false);
    }
  };

  useEffect(() => {
    loadSeasonStatus();
  }, []);

  if (isLoading) {
    return (
      <Card className="bg-gray-800/50 border-gray-700">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-white">
            <Calendar className="h-5 w-5" />
            Season Management
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="h-6 w-6 animate-spin text-gray-400" />
            <span className="ml-2 text-gray-400">Loading season status...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!seasonStatus) {
    return (
      <Card className="bg-gray-800/50 border-gray-700">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-white">
            <Calendar className="h-5 w-5" />
            Season Management
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Unable to load season status
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-gray-800/50 border-gray-700">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-white">
          <Calendar className="h-5 w-5" />
          Season Management
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Current Status */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-blue-400" />
              <span className="text-sm font-medium text-gray-300">Database Season</span>
            </div>
            <div className="flex items-center gap-2">
              {seasonStatus.dbSeason ? (
                <Badge variant="outline" className="text-green-400 border-green-400">
                  {seasonStatus.dbSeason}
                </Badge>
              ) : (
                <Badge variant="outline" className="text-red-400 border-red-400">
                  No Data
                </Badge>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-blue-400" />
              <span className="text-sm font-medium text-gray-300">API Season</span>
            </div>
            <div className="flex items-center gap-2">
              {seasonStatus.apiSeason ? (
                <Badge variant="outline" className="text-blue-400 border-blue-400">
                  {seasonStatus.apiSeason.id}
                </Badge>
              ) : (
                <Badge variant="outline" className="text-red-400 border-red-400">
                  Unavailable
                </Badge>
              )}
            </div>
          </div>
        </div>

        {/* Update Status */}
        {seasonStatus.needsUpdate ? (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <div className="space-y-2">
                <p className="font-medium">Season Update Required</p>
                <p className="text-sm">{seasonStatus.message}</p>
                <div className="mt-3">
                  <Button
                    onClick={handleSeasonUpdate}
                    disabled={isUpdating}
                    className="bg-red-600 hover:bg-red-700 text-white"
                  >
                    {isUpdating ? (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                        Updating...
                      </>
                    ) : (
                      <>
                        <Calendar className="h-4 w-4 mr-2" />
                        Update to New Season
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </AlertDescription>
          </Alert>
        ) : (
          <Alert className="border-green-500 bg-green-500/10">
            <CheckCircle className="h-4 w-4 text-green-500" />
            <AlertDescription className="text-green-400">
              <div className="space-y-1">
                <p className="font-medium">Season Up to Date</p>
                <p className="text-sm">{seasonStatus.message}</p>
              </div>
            </AlertDescription>
          </Alert>
        )}        {/* Buy Window Info */}
        <div className="bg-gray-700/50 rounded-lg p-3 border border-gray-600">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="h-4 w-4 text-yellow-400" />
            <span className="text-sm font-medium text-gray-300">Buy Window Configuration</span>
          </div>
          <p className="text-xs text-gray-400">
            Trading closes 15 minutes before match kickoff. This applies to all teams and is automatically enforced.
          </p>
        </div>

        {/* Refresh Button */}
        <div className="flex justify-end">
          <Button
            onClick={loadSeasonStatus}
            disabled={isLoading}
            variant="outline"
            size="sm"
            className="border-gray-600 text-gray-300 hover:bg-gray-700"
          >
            {isLoading ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                Refreshing...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh Status
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default SeasonUpdatePanel;

