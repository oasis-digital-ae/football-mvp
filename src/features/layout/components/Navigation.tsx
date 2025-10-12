import React from 'react';
import { Button } from '@/shared/components/ui/button';
import { useAuth } from '@/features/auth/contexts/AuthContext';
import { 
  Trophy, 
  Briefcase, 
  TrendingUp, 
  Calendar, 
  BarChart3, 
  Play, 
  Settings,
  LogOut,
  User,
  Shield
} from 'lucide-react';

interface NavigationProps {
  currentPage: string;
  onPageChange: (page: string) => void;
}

const Navigation: React.FC<NavigationProps> = ({ currentPage, onPageChange }) => {
  const { signOut, profile } = useAuth();
  
  const pages = [
    { id: 'marketplace', label: 'Marketplace', icon: TrendingUp },
    { id: 'portfolio', label: 'Portfolio', icon: Briefcase },
    { id: 'match-results', label: 'Fixtures', icon: Calendar },
    { id: 'standings', label: 'League Table', icon: BarChart3 },
    { id: 'season-simulation', label: 'Simulation', icon: Settings },
    { id: 'admin', label: 'Admin', icon: Shield }
  ];

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  return (
    <nav className="bg-gradient-primary border-b border-trading-primary/20 backdrop-blur-md sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo and Brand */}
          <div className="flex items-center space-x-3">
            <div className="flex items-center justify-center w-10 h-10 bg-trading-primary rounded-full primary-glow">
              <Trophy className="w-6 h-6 text-white" />
            </div>
            <div className="hidden sm:block">
              <h1 className="text-xl font-bold text-white gradient-text">
                Premier League Trading
              </h1>
            </div>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-1">
            {pages.map((page) => {
              const Icon = page.icon;
              const isActive = currentPage === page.id;
              
              return (
                <Button
                  key={page.id}
                  variant="ghost"
                  onClick={() => onPageChange(page.id)}
                  className={`
                    flex items-center space-x-2 px-4 py-2 rounded-lg transition-all duration-200
                    ${isActive 
                      ? 'bg-trading-primary text-white border border-trading-primary shadow-lg' 
                      : 'text-gray-300 hover:text-white hover:bg-white/10'
                    }
                  `}
                >
                  <Icon className="w-4 h-4" />
                  <span className="font-medium">{page.label}</span>
                </Button>
              );
            })}
          </div>

          {/* User Menu */}
          <div className="flex items-center space-x-3">
            {profile && (
              <div className="hidden sm:flex items-center space-x-2 text-gray-300">
                <User className="w-4 h-4" />
                <span className="text-sm font-medium">{profile.full_name}</span>
              </div>
            )}
            <Button 
              variant="ghost" 
              onClick={handleSignOut} 
              className="text-gray-300 hover:text-white hover:bg-white/10 p-2"
              title="Sign Out"
            >
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Mobile Navigation */}
        <div className="md:hidden pb-3">
          <div className="grid grid-cols-2 gap-1">
            {pages.map((page) => {
              const Icon = page.icon;
              const isActive = currentPage === page.id;
              
              return (
                <Button
                  key={page.id}
                  variant="ghost"
                  onClick={() => onPageChange(page.id)}
                  className={`
                    flex flex-col items-center space-y-1 p-2 rounded-md transition-all duration-200 min-h-[60px]
                    ${isActive 
                      ? 'bg-trading-primary text-white border border-trading-primary' 
                      : 'text-gray-300 hover:text-white hover:bg-white/10'
                    }
                  `}
                >
                  <Icon className="w-4 h-4" />
                  <span className="text-xs font-medium leading-tight">{page.label}</span>
                </Button>
              );
            })}
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navigation;