'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { superadminApi } from '@/lib/api';

interface SuperAdminContextValue {
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const SuperAdminContext = createContext<SuperAdminContextValue | null>(null);

export function SuperAdminProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('superadminToken');
    setIsAuthenticated(!!token);
    setIsLoading(false);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const data = await superadminApi.login({ email, password }) as { accessToken: string };
    localStorage.setItem('superadminToken', data.accessToken);
    setIsAuthenticated(true);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('superadminToken');
    setIsAuthenticated(false);
  }, []);

  return (
    <SuperAdminContext.Provider value={{ isAuthenticated, isLoading, login, logout }}>
      {children}
    </SuperAdminContext.Provider>
  );
}

export function useSuperAdmin() {
  const ctx = useContext(SuperAdminContext);
  if (!ctx) throw new Error('useSuperAdmin must be used inside SuperAdminProvider');
  return ctx;
}
