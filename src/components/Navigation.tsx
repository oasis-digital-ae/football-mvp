import React from 'react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';

interface NavigationProps {
  currentPage: string;
  onPageChange: (page: string) => void;
}

const Navigation: React.FC<NavigationProps> = ({ currentPage, onPageChange }) => {
  const { signOut, profile } = useAuth();
  
  const pages = [
    { id: 'marketplace', label: 'Marketplace' },
    { id: 'portfolio', label: 'Portfolio' },
    { id: 'match-results', label: 'Match Results' },
    { id: 'launch', label: 'Launch' }
  ];

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  return (
    <nav className="bg-gray-800 border-b border-gray-700 p-4">
      <div className="max-w-7xl mx-auto flex justify-between items-center">
        <div className="flex space-x-1">
          {pages.map((page) => (
            <Button
              key={page.id}
              variant={currentPage === page.id ? "default" : "ghost"}
              onClick={() => onPageChange(page.id)}
              className={`${
                currentPage === page.id
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'text-gray-300 hover:text-white hover:bg-gray-700'
              }`}
            >
              {page.label}
            </Button>
          ))}
        </div>
        
        <div className="flex items-center space-x-4">
          {profile && (
            <span className="text-gray-300">Welcome, {profile.full_name}</span>
          )}
          <Button variant="ghost" onClick={handleSignOut} className="text-gray-300 hover:text-white">
            Sign Out
          </Button>
        </div>
      </div>
    </nav>
  );
};

export default Navigation;