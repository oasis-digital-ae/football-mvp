import React, { useEffect } from 'react';
import { useAppContext } from '@/features/trading/contexts/AppContext';
import { useAuth } from '@/features/auth/contexts/AuthContext';
import Navigation from './Navigation';
import ClubValuesPage from '../../trading/components/ClubValuesPage';
import PortfolioPage from '../../trading/components/PortfolioPage';
import MatchResultsPage from '../../trading/components/MatchResultsPage';
import StandingsPage from '../../trading/components/StandingsPage';
import SeasonSimulation from '../../trading/components/SeasonSimulation';
import { AdminDashboard } from '../../admin/components/AdminDashboard';

const AppLayout: React.FC = () => {
  const { currentPage, setCurrentPage } = useAppContext();
  const { isAdmin } = useAuth();

  // Redirect to marketplace if non-admin tries to access admin or simulation pages
  useEffect(() => {
    if ((currentPage === 'admin' || currentPage === 'season-simulation') && !isAdmin) {
      setCurrentPage('marketplace');
    }
  }, [currentPage, isAdmin, setCurrentPage]);

  const renderCurrentPage = () => {
    // Block admin and simulation access if user is not admin
    if ((currentPage === 'admin' || currentPage === 'season-simulation') && !isAdmin) {
      return <ClubValuesPage />;
    }

    switch (currentPage) {
      case 'marketplace':
      case 'club-values':
        return <ClubValuesPage />;
      case 'portfolio':
        return <PortfolioPage />;
      case 'match-results':
        return <MatchResultsPage />;
      case 'standings':
        return <StandingsPage />;
      case 'season-simulation':
        return <SeasonSimulation />;
      case 'admin':
        return <AdminDashboard />;
      default:
        return <ClubValuesPage />;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 w-full overflow-x-hidden pb-20 md:pb-0">
      <Navigation currentPage={currentPage} onPageChange={setCurrentPage} />
      <main className="max-w-7xl mx-auto w-full px-4 lg:px-6 overflow-x-hidden">
        {renderCurrentPage()}
      </main>
    </div>
  );
};

export default AppLayout;
