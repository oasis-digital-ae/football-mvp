import React from 'react';
import { useAppContext } from '@/contexts/AppContext';
import Navigation from './Navigation';
import ClubValuesPage from './ClubValuesPage';
import PortfolioPage from './PortfolioPage';
import MatchResultsPage from './MatchResultsPage';
import LaunchPage from './LaunchPage';

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
      case 'launch':
        return <LaunchPage />;
      default:
        return <ClubValuesPage />;
    }
  };

  return (
    <div className="min-h-screen bg-gray-900">
      <Navigation currentPage={currentPage} onPageChange={setCurrentPage} />
      <main className="max-w-7xl mx-auto">
        {renderCurrentPage()}
      </main>
    </div>
  );
};

export default AppLayout;
