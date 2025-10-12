import React from 'react';
import { useAppContext } from '@/features/trading/contexts/AppContext';
import Navigation from './Navigation';
import ClubValuesPage from '../../trading/components/ClubValuesPage';
import PortfolioPage from '../../trading/components/PortfolioPage';
import MatchResultsPage from '../../trading/components/MatchResultsPage';
import StandingsPage from '../../trading/components/StandingsPage';
import SeasonSimulation from '../../trading/components/SeasonSimulation';
import { AdminDashboard } from '../../admin/components/AdminDashboard';

const AppLayout: React.FC = () => {
  const { currentPage, setCurrentPage } = useAppContext();

  const renderCurrentPage = () => {
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
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
      <Navigation currentPage={currentPage} onPageChange={setCurrentPage} />
      <main className="max-w-7xl mx-auto">
        {renderCurrentPage()}
      </main>
    </div>
  );
};

export default AppLayout;
