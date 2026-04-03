'use client';

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { authApi, referralApi } from '@/lib/api';
import type { User, Restaurant } from '@/types';

const PERMISSIONS = {
  manageSettings:      ['OWNER'],
  manageHalls:         ['OWNER'],
  manageStaff:         ['OWNER'],
  manageClosedPeriods: ['OWNER', 'MANAGER'],
  viewStats:           ['OWNER', 'MANAGER'],
} as const;

type Permission = keyof typeof PERMISSIONS;

interface AuthContextValue {
  user: User | null;
  restaurant: Restaurant | null;
  isLoading: boolean;
  isPartner: boolean;
  login: (email: string, password: string) => Promise<{ userType: string }>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  can: (action: Permission) => boolean;
}

interface RegisterData {
  email: string;
  password: string;
  name: string;
  restaurantName: string;
  slug: string;
}

const AuthContext = createContext<AuthContextValue>(null!);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const queryClient = useQueryClient();

  const refreshUser = useCallback(async () => {
    const token = localStorage.getItem('accessToken');
    if (!token) { setIsLoading(false); return; }

    try {
      const data: any = await authApi.me();
      setUser(data.user);
      setRestaurant(data.restaurant);
    } catch {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      setUser(null);
      setRestaurant(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { refreshUser(); }, [refreshUser]);

  const login = async (email: string, password: string): Promise<{ userType: string }> => {
    queryClient.clear();
    const data: any = await authApi.login({ email, password });
    localStorage.setItem('accessToken', data.accessToken);
    localStorage.setItem('refreshToken', data.refreshToken);
    setUser(data.user);
    setRestaurant(data.restaurant);

    // Last-touch: если в cookie есть реф-код — обновляем pendingReferralCode (только для ресторанов)
    const refCookie = document.cookie.match(/(?:^|;\s*)referral_code=([^;]+)/)?.[1];
    if (refCookie && data.user?.userType === 'RESTAURANT_OWNER' && data.user?.role === 'OWNER') {
      referralApi.trackReferral(decodeURIComponent(refCookie)).catch(() => {});
    }

    return { userType: data.user?.userType ?? 'RESTAURANT_OWNER' };
  };

  const register = async (registerData: RegisterData) => {
    queryClient.clear();
    const data: any = await authApi.register(registerData);
    localStorage.setItem('accessToken', data.accessToken);
    localStorage.setItem('refreshToken', data.refreshToken);
    setUser(data.user);
    setRestaurant(data.restaurant);
  };

  const logout = async () => {
    try { await authApi.logout(); } catch {}
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    queryClient.clear();
    setUser(null);
    setRestaurant(null);
  };

  const can = (action: Permission): boolean => {
    if (!user) return false;
    if (user.userType === 'PARTNER') return false; // партнёры не имеют прав в дашборде ресторана
    return (PERMISSIONS[action] as readonly string[]).includes(user.role);
  };

  const isPartner = user?.userType === 'PARTNER';

  return (
    <AuthContext.Provider value={{ user, restaurant, isLoading, isPartner, login, register, logout, refreshUser, can }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
