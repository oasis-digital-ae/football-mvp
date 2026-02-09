import React, { useState } from 'react';
import { Button } from '@/shared/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/shared/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/shared/components/ui/alert-dialog';
import { useAuth } from '@/features/auth/contexts/AuthContext';
import { DepositModal } from '@/features/trading/components/DepositModal';
import { formatCurrency } from '@/shared/lib/formatters';
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
  Shield,
  Wallet,
  Menu,
  X,
  Mail,
  ChevronDown
} from 'lucide-react';

interface NavigationProps {
  currentPage: string;
  onPageChange: (page: string) => void;
}

const Navigation: React.FC<NavigationProps> = ({ currentPage, onPageChange }) => {  const { signOut, profile, walletBalance, refreshWalletBalance, isAdmin, user } = useAuth();
  const [depositModalOpen, setDepositModalOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [logoutDialogOpen, setLogoutDialogOpen] = useState(false);
    const allPages = [
    { id: 'marketplace', label: 'Marketplace', icon: TrendingUp },
    { id: 'portfolio', label: 'Portfolio', icon: Briefcase },
    { id: 'leaderboard', label: 'Leaderboard', icon: Trophy },
    { id: 'match-results', label: 'Fixtures', icon: Calendar },
    { id: 'standings', label: 'League Table', icon: BarChart3 },
    { id: 'season-simulation', label: 'Simulation', icon: Settings },
    { id: 'admin', label: 'Admin', icon: Shield }
  ];
  
  // Filter out admin and simulation pages if user is not admin
  const pages = allPages.filter(page => {
    if (page.id === 'admin' || page.id === 'season-simulation') {
      return isAdmin;
    }
    return true;
  });

  const handleSignOutClick = () => {
    setLogoutDialogOpen(true);
    setMobileMenuOpen(false); // Close mobile menu if open
  };

  const handleConfirmSignOut = async () => {
    try {
      setLogoutDialogOpen(false);
      await signOut();
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  return (
    <>
      <nav className="bg-gradient-primary border-b border-trading-primary/20 backdrop-blur-md sticky top-0 z-50 w-full">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center h-16 gap-2 md:gap-3">
            {/* Mobile Menu Button */}
            <Button
              variant="ghost"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden text-white hover:bg-white/10 p-2 flex-shrink-0"
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </Button>

            {/* Logo and Brand */}
            <div className="flex items-center space-x-2 flex-shrink-0">
              <div className="flex items-center justify-center w-9 h-9 lg:w-10 lg:h-10 bg-trading-primary rounded-full primary-glow flex-shrink-0">
                <Trophy className="w-5 h-5 lg:w-6 lg:h-6 text-white" />
              </div>
              <h1 className="text-base lg:text-lg xl:text-xl font-bold text-white whitespace-nowrap">
                <span className="hidden lg:inline">ACE</span>
                <span className="lg:hidden">ACE</span>
              </h1>
            </div>

          {/* Desktop Navigation - Horizontal Scrollable */}
          <div className="hidden md:flex items-center flex-1 justify-center min-w-0 px-2">
            <div className="flex items-center gap-0.25 overflow-x-auto scrollbar-hide max-w-full">
              <TooltipProvider>
                {pages.map((page) => {
                  const Icon = page.icon;
                  const isActive = currentPage === page.id;
                  
                  return (
                    <Tooltip key={page.id}>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          onClick={() => onPageChange(page.id)}
                          className={`
                            flex items-center gap-2 px-3 py-2 rounded-lg transition-all duration-200 flex-shrink-0
                            ${isActive 
                              ? 'bg-trading-primary text-white border border-trading-primary shadow-lg' 
                              : 'text-gray-300 hover:text-white hover:bg-white/10'
                            }
                          `}
                        >
                          <Icon className="w-4 h-4 flex-shrink-0" />
                          <span className="font-medium whitespace-nowrap text-sm hidden lg:inline">{page.label}</span>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="lg:hidden">
                        <p>{page.label}</p>
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </TooltipProvider>
            </div>
          </div>

          {/* User Menu - Desktop */}
          <div className="hidden md:flex items-center space-x-1 lg:space-x-2 flex-shrink-0 ml-auto">
            {profile && (
              <>
                <div className="hidden lg:flex items-center space-x-1.5 text-gray-300">
                  <div className="flex items-center space-x-1 px-2 py-1 bg-gray-700/50 rounded-lg border border-gray-600 flex-shrink-0">
                    <Wallet className="w-3.5 h-3.5 text-trading-primary flex-shrink-0" />
                    <span className="text-xs lg:text-sm font-semibold whitespace-nowrap">{formatCurrency(walletBalance)}</span>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        className="hidden xl:flex items-center space-x-1 px-1.5 text-gray-300 hover:text-white hover:bg-white/10 flex-shrink-0"
                      >
                        <User className="w-3.5 h-3.5 flex-shrink-0" />
                        <span className="text-xs lg:text-sm font-medium whitespace-nowrap truncate max-w-[100px]">
                          {profile.first_name || (profile.full_name ? profile.full_name.split(' ')[0] : 'User')}
                        </span>
                        <ChevronDown className="w-3 h-3 flex-shrink-0" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="bg-gray-800 border-gray-700 text-white w-56">
                      <div className="px-2 py-1.5 border-b border-gray-700/50">
                        <div className="flex items-center gap-2">
                          <User className="w-4 h-4 text-gray-400" />
                          <div className="flex flex-col min-w-0">
                            <span className="text-sm font-medium text-white truncate">
                              {profile.first_name || (profile.full_name ? profile.full_name.split(' ')[0] : 'User')}
                            </span>
                            <span className="text-xs text-gray-400 truncate flex items-center gap-1">
                              <Mail className="w-3 h-3 flex-shrink-0" />
                              {profile.email || user?.email || 'No email'}                        </span>
                      </div>
                    </div>
                  </div>
                  
                  <DropdownMenuItem
                    onClick={handleSignOutClick}
                    className="text-red-400 hover:text-red-300 hover:bg-red-900/20 cursor-pointer focus:text-red-300 focus:bg-red-900/20"
                  >
                    <LogOut className="w-4 h-4 mr-2" />
                    Sign Out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <Button
              onClick={() => setDepositModalOpen(true)}
                  className="flex items-center space-x-1 bg-trading-primary hover:bg-trading-primary/80 text-white px-1.5 lg:px-2.5 py-1 flex-shrink-0"
                  size="sm"
                >
                  <Wallet className="w-3 h-3 lg:w-3.5 lg:h-3.5 flex-shrink-0" />
                  <span className="text-xs lg:text-sm whitespace-nowrap hidden xl:inline">Deposit</span>
                </Button>
              </>
            )}
            {!profile && (
              <Button 
                variant="ghost" 
                onClick={handleSignOutClick} 
                className="text-gray-300 hover:text-white hover:bg-white/10 p-1.5 lg:p-2 flex-shrink-0"
                title="Sign Out"
              >
                <LogOut className="w-3.5 h-3.5 lg:w-4 lg:h-4" />
              </Button>
            )}
          </div>

          {/* Mobile Wallet & User Info */}
          {profile && (
            <div className="md:hidden flex items-center gap-1.5 ml-auto">
              {/* Wallet Balance */}
              <Button
                onClick={() => setDepositModalOpen(true)}
                className="flex items-center gap-1 bg-trading-primary hover:bg-trading-primary/80 text-white px-2 py-1.5 rounded-lg text-xs"
                size="sm"
              >
                <Wallet className="w-3.5 h-3.5" />
                <span className="font-semibold">{formatCurrency(walletBalance)}</span>
              </Button>
              
              {/* User Dropdown Menu - Mobile */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    className="flex items-center gap-1 text-white hover:bg-white/10 px-2 py-1.5 text-xs flex-shrink-0"
                  >
                    <User className="w-3.5 h-3.5 flex-shrink-0" />
                    <span className="font-medium whitespace-nowrap truncate max-w-[60px] sm:max-w-[80px]">
                      {profile.first_name || (profile.full_name ? profile.full_name.split(' ')[0] : 'User')}
                    </span>
                    <ChevronDown className="w-3 h-3 flex-shrink-0" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="bg-gray-800 border-gray-700 text-white w-56">
                  <div className="px-2 py-1.5 border-b border-gray-700/50">
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4 text-gray-400" />
                      <div className="flex flex-col min-w-0">
                        <span className="text-sm font-medium text-white truncate">
                          {profile.first_name || (profile.full_name ? profile.full_name.split(' ')[0] : 'User')}
                        </span>
                        <span className="text-xs text-gray-400 truncate flex items-center gap-1">
                          <Mail className="w-3 h-3 flex-shrink-0" />                        
                          {profile.email || user?.email || 'No email'}
                      </span>
                    </div>
                  </div>
                </div>
                
                <DropdownMenuItem
                  onClick={handleSignOutClick}
                  className="text-red-400 hover:text-red-300 hover:bg-red-900/20 cursor-pointer focus:text-red-300 focus:bg-red-900/20"
                >
                  <LogOut className="w-4 h-4 mr-2" />
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>

        {/* Mobile Menu Dropdown */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-gray-700/50 py-3">
            <div className="space-y-1">
              {pages.map((page) => {
                const Icon = page.icon;
                const isActive = currentPage === page.id;
                
                return (
                  <Button
                    key={page.id}
                    variant="ghost"
                    onClick={() => {
                      onPageChange(page.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`
                      w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 justify-start
                      ${isActive 
                        ? 'bg-trading-primary text-white' 
                        : 'text-gray-300 hover:text-white hover:bg-white/10'
                      }
                    `}
                  >
                    <Icon className="w-5 h-5" />
                    <span className="font-medium">{page.label}</span>
                  </Button>
                );
              })}
            </div>
          </div>
        )}
      </div>
      <DepositModal
        isOpen={depositModalOpen}
        onClose={() => setDepositModalOpen(false)}
        onSuccess={() => {
          setDepositModalOpen(false);
          // Refresh balance immediately, then poll for webhook update
          refreshWalletBalance();
          setTimeout(() => {
            refreshWalletBalance();
          }, 1500); // Give webhook time to process
        }}
      />

      {/* Logout Confirmation Dialog */}
      <AlertDialog open={logoutDialogOpen} onOpenChange={setLogoutDialogOpen}>
        <AlertDialogContent className="bg-gray-800 border-gray-700 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-lg sm:text-xl font-bold flex items-center gap-2">
              <LogOut className="w-5 h-5 text-red-400" />
              Sign Out
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm sm:text-base text-gray-300 pt-2">
              Are you sure you want to sign out? You'll need to sign in again to access your account.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2 sm:gap-3 pt-4">
            <AlertDialogCancel 
              onClick={() => setLogoutDialogOpen(false)}
              className="w-full sm:w-auto bg-gray-700 hover:bg-gray-600 text-white border-gray-600 order-2 sm:order-1 touch-manipulation min-h-[44px]"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmSignOut}
              className="w-full sm:w-auto bg-red-600 hover:bg-red-700 text-white order-1 sm:order-2 touch-manipulation min-h-[44px]"
            >
              Sign Out
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </nav>

    {/* Bottom Navigation Bar - Mobile Only */}
    <div className="md:hidden fixed bottom-0 left-0 right-0 bg-gray-900/95 backdrop-blur-md border-t border-gray-700/50 z-40 safe-area-inset-bottom">
      <div className="grid grid-cols-4 gap-1 px-2 py-2">
        {pages.slice(0, 4).map((page) => {
          const Icon = page.icon;
          const isActive = currentPage === page.id;
          
          return (
            <Button
              key={page.id}
              variant="ghost"
              onClick={() => onPageChange(page.id)}
              className={`
                flex flex-col items-center gap-1 p-2 rounded-lg transition-all duration-200 min-h-[60px]
                ${isActive 
                  ? 'bg-trading-primary/20 text-trading-primary' 
                  : 'text-gray-400 hover:text-white'
                }
              `}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[10px] font-medium leading-tight">{page.label}</span>
            </Button>
          );
        })}
      </div>
    </div>
    </>
  );
};

export default Navigation;