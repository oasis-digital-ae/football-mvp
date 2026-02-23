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
  first_name: string;
  last_name: string;
  full_name?: string; // Kept for backward compatibility
  birthday: string;
  country: string;
  phone: string;
  is_admin?: boolean;
  reffered_by?: string;
}

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  walletBalance: number;
  totalDeposits: number;
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
  const [totalDeposits, setTotalDeposits] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  const ensureProfile = async (authUser: User) => {
    try {
      // Use atomic RPC function to ensure profile exists
      const { error } = await supabase.rpc(
        'create_or_update_profile_atomic',
        {
          p_user_id: authUser.id,
          p_username: authUser.email ?? `user_${authUser.id.slice(0, 8)}`,
          p_first_name: null,
          p_last_name: null,
          p_email: authUser.email || null,
          p_birthday: null,
          p_country: null,
          p_phone: null
        }
      );
      
      if (error) {
        logger.warn('ensureProfile RPC failed:', error);
        // Fallback to direct upsert if RPC fails
        const { error: upsertError } = await supabase
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
        
        if (upsertError && upsertError.code !== '23505') {
          throw upsertError;
        }
      }
    } catch (e) {
      // Log only; do not block auth flow
      logger.warn('ensureProfile failed:', e);
    }
  };

  useEffect(() => {
    let mounted = true;
    let loadingTimeout: NodeJS.Timeout | null = null;

    // Set a timeout to ensure loading always resolves (max 10 seconds)
    loadingTimeout = setTimeout(() => {
      if (mounted) {
        logger.warn('Auth initialization timeout - forcing loading to false');
        setLoading(false);
      }
    }, 10000);

    // Get initial session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!mounted) return;
      
      setUser(session?.user ?? null);
      if (session?.user) {
        // Ensure a profiles row exists to satisfy FKs
        // Don't block on ensureProfile - it's not critical if it fails
        ensureProfile(session.user).catch(err => {
          logger.warn('ensureProfile error in getSession (non-blocking):', err);
        });
        
        // Fetch profile - this is critical, but don't block forever
        fetchProfile(session.user.id).catch(err => {
          logger.warn('fetchProfile error in getSession (non-blocking):', err);
          // Set defaults if fetch fails
          setProfile(null);
          setWalletBalance(0);
        });
      } else {
        setWalletBalance(0);
      }
      
      if (loadingTimeout) {
        clearTimeout(loadingTimeout);
        loadingTimeout = null;
      }
      if (mounted) {
        setLoading(false);
      }
    }).catch(err => {
      logger.error('getSession error:', err);
      if (loadingTimeout) {
        clearTimeout(loadingTimeout);
        loadingTimeout = null;
      }
      if (mounted) {
        setLoading(false);
      }
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!mounted) return;
      
      // Clear any existing timeout
      if (loadingTimeout) {
        clearTimeout(loadingTimeout);
        loadingTimeout = null;
      }
      
      setUser(session?.user ?? null);
      if (session?.user) {
        // Simplified: Just fetch profile, don't do complex checks
        // ensureProfile will check if profile exists before creating
        ensureProfile(session.user).catch(err => {
          logger.warn('ensureProfile error in onAuthStateChange (non-blocking):', err);
        });
        
        // Fetch profile - critical but non-blocking
        fetchProfile(session.user.id).catch(err => {
          logger.warn('fetchProfile error in onAuthStateChange (non-blocking):', err);
          // Set defaults if fetch fails
          setProfile(null);
          setWalletBalance(0);
        });
      } else {
        setProfile(null);
        setWalletBalance(0);
      }
      
      if (mounted) {
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
      if (loadingTimeout) {
        clearTimeout(loadingTimeout);
      }
      subscription.unsubscribe();
    };
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


  const fetchProfile = async (userId: string, retries = 3): Promise<void> => {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        // First, verify we have a valid session
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user || session.user.id !== userId) {
          logger.warn(`Session mismatch or missing for userId: ${userId}`);
          if (attempt < retries) {
            await new Promise(resolve => setTimeout(resolve, 1000 * attempt)); // Exponential backoff
            continue;
          }
          throw new Error('No valid session found');
        }

        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .maybeSingle();

        if (error) {
          // If it's a permission error, try using RPC function as fallback
          if (error.code === '42501' || error.message?.includes('permission') || error.message?.includes('policy')) {
            logger.warn(`Profile fetch permission error (attempt ${attempt}/${retries}):`, error);
            if (attempt < retries) {
              await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
              continue;
            }
          }
          logger.error('Error fetching profile:', error);
          throw error;
        }
          logger.debug('Profile fetched successfully:', { userId, isAdmin: data?.is_admin, hasData: !!data });
        setProfile(data);
        
        // Fetch wallet balance and total deposits - don't let errors block profile fetch
        try {
          const balance = await walletService.getBalance(userId);
          setWalletBalance(balance);
        } catch (balanceError) {
          logger.warn('Error fetching wallet balance:', balanceError);
          setWalletBalance(0);
        }

        try {
          const deposits = await walletService.getTotalDeposits(userId);
          setTotalDeposits(deposits);
        } catch (depositsError) {
          logger.warn('Error fetching total deposits:', depositsError);
          setTotalDeposits(0);
        }
        
        // Success - exit retry loop
        return;
      } catch (error: any) {
        logger.error(`Error fetching profile (attempt ${attempt}/${retries}):`, error);
        
        if (attempt === retries) {
          // Last attempt failed - set defaults and throw
          setProfile(null);
          setWalletBalance(0);
          throw error;
        }
        
        // Wait before retry with exponential backoff
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
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

      try {
        const deposits = await walletService.getTotalDeposits(user.id);
        setTotalDeposits(deposits);
      } catch (error) {
        console.error('Error refreshing total deposits:', error);
      }
    }
  };


  const signUp = async (email: string, password: string, userData: Omit<UserProfile, 'id' | 'email'>) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: userData,
        emailRedirectTo: `${window.location.origin}/`
      }
    });

    if (error) throw error;

    // After successful signup, create/update the profile with all user data
    // Note: data.user might be null if email confirmation is required
    if (data.user) {
      try {
        // Convert birthday string to date if provided
        const birthdayDate = userData.birthday ? new Date(userData.birthday).toISOString().split('T')[0] : null;
          // Use atomic RPC function to create/update profile
        // This ensures all fields are set atomically in a single transaction
        const { error: profileError } = await supabase.rpc(
          'create_or_update_profile_atomic',
          {
            p_user_id: data.user.id,
            p_username: email,
            p_first_name: userData.first_name || null,
            p_last_name: userData.last_name || null,
            p_email: email,
            p_birthday: birthdayDate,
            p_country: userData.country || null,
            p_phone: userData.phone || null,
            p_reffered_by: userData.reffered_by || null
          }
        );

        if (profileError) {
          // Log the error with details
          logger.error('Failed to save profile after signup:', {
            error: profileError,
            userId: data.user.id,
            hasFirstName: !!userData.first_name,
            hasLastName: !!userData.last_name,
            firstName: userData.first_name,
            lastName: userData.last_name
          });
          // Don't throw - auth user is created, but log the error for debugging
          console.error('Profile save error:', profileError);
        } else {
          logger.info('Profile saved successfully for user:', data.user.id);
        }
      } catch (profileErr) {
        logger.error('Error creating profile:', profileErr);
        // Ensure at least minimal profile exists
        try {
          await ensureProfile(data.user);
        } catch (ensureErr) {
          logger.error('Failed to create minimal profile:', ensureErr);
        }
      }
    } else {
      // User needs to verify email first - profile will be created after verification
      logger.info('User created but email verification required. Profile will be created after verification.');
    }
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
      totalDeposits,
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