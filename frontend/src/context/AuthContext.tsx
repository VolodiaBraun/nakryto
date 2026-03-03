'use client';

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authApi } from '@/lib/api';
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
  login: (email: string, password: string) => Promise<void>;
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

  const login = async (email: string, password: string) => {
    const data: any = await authApi.login({ email, password });
    localStorage.setItem('accessToken', data.accessToken);
    localStorage.setItem('refreshToken', data.refreshToken);
    setUser(data.user);
    setRestaurant(data.restaurant);
  };

  const register = async (registerData: RegisterData) => {
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
    setUser(null);
    setRestaurant(null);
  };

  const can = (action: Permission): boolean => {
    if (!user) return false;
    return (PERMISSIONS[action] as readonly string[]).includes(user.role);
  };

  return (
    <AuthContext.Provider value={{ user, restaurant, isLoading, login, register, logout, refreshUser, can }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
