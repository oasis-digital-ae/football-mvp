import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '@/shared/lib/supabase';
import type { User } from '@supabase/supabase-js';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { walletService } from '@/shared/lib/services/wallet.service';
import { realtimeService } from '@/shared/lib/services/realtime.service';
import { logger } from '@/shared/lib/logger';

interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  birthday: string;
  country: string;
  phone: string;
  is_admin?: boolean;
}

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  walletBalance: number;
  loading: boolean;
  isAdmin: boolean;
  signUp: (email: string, password: string, userData: Omit<UserProfile, 'id' | 'email'>) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshWalletBalance: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [walletBalance, setWalletBalance] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  const ensureProfile = async (authUser: User) => {
    try {
      // Use upsert to handle existing profiles gracefully
      const { error } = await supabase
        .from('profiles')
        .upsert(
          { 
            id: authUser.id, 
            username: authUser.email ?? `user_${authUser.id.slice(0, 8)}` 
          },
          { 
            onConflict: 'id',
            ignoreDuplicates: false 
          }
        );
      
      if (error) {
        // If it's a duplicate key error, that's actually fine - profile already exists
        if (error.code === '23505') {
          console.log('Profile already exists, continuing...');
          return;
        }
        throw error;
      }
    } catch (e) {
      // Log only; do not block auth flow
      console.warn('ensureProfile failed:', e);
    }
  };

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        // Ensure a profiles row exists to satisfy FKs
        ensureProfile(session.user);
        fetchProfile(session.user.id);
      } else {
        setWalletBalance(0);
      }
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        ensureProfile(session.user);
        fetchProfile(session.user.id);
      } else {
        setProfile(null);
        setWalletBalance(0);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Set up wallet balance updates (realtime with polling fallback)
  useEffect(() => {
    if (!user) return;

    // Refresh balance immediately on login
    refreshWalletBalance();

    let channel: RealtimeChannel | null = null;
    let pollingInterval: NodeJS.Timeout | null = null;
    let isRealtimeActive = false;

    // Try to set up realtime subscription
    try {
      channel = realtimeService.subscribeToWalletBalance(user.id, (newBalance) => {
        isRealtimeActive = true;
        setWalletBalance(newBalance);
      });

      // Check if realtime is working after a delay
      setTimeout(() => {
        if (!isRealtimeActive && channel) {
          logger.warn('Wallet balance realtime not active (replication not enabled). Using polling fallback.');
          // Fallback to polling
          pollingInterval = setInterval(() => {
      refreshWalletBalance();
          }, 30000); // Poll every 30 seconds
        }
    }, 5000);
    } catch (error) {
      logger.warn('Failed to set up wallet balance realtime subscription:', error);
      // Start polling immediately if realtime fails
      pollingInterval = setInterval(() => {
        refreshWalletBalance();
      }, 30000); // Poll every 30 seconds
    }

    // Also refresh after key events (purchases, deposits) via event listener
    const handleWalletChange = () => {
      refreshWalletBalance();
    };
    window.addEventListener('wallet-balance-changed', handleWalletChange);

    // Cleanup
    return () => {
      if (channel) {
        realtimeService.unsubscribe(channel);
      }
      if (pollingInterval) {
        clearInterval(pollingInterval);
      }
      window.removeEventListener('wallet-balance-changed', handleWalletChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);


  const fetchProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (error) throw error;
      setProfile(data);
      
      // Fetch wallet balance
      const balance = await walletService.getBalance(userId);
      setWalletBalance(balance);
    } catch (error) {
      console.error('Error fetching profile:', error);
      setProfile(null);
      setWalletBalance(0);
    }
  };

  const refreshWalletBalance = async () => {
    if (user) {
      try {
        const balance = await walletService.getBalance(user.id);
        setWalletBalance(balance);
      } catch (error) {
        console.error('Error refreshing wallet balance:', error);
      }
    }
  };


  const signUp = async (email: string, password: string, userData: Omit<UserProfile, 'id' | 'email'>) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: userData
      }
    });

    if (error) throw error;
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) throw error;
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  return (
    <AuthContext.Provider value={{
      user,
      profile,
      walletBalance,
      loading,
      isAdmin: profile?.is_admin ?? false,
      signUp,
      signIn,
      signOut,
      refreshWalletBalance
    }}>
      {children}
    </AuthContext.Provider>
  );
};