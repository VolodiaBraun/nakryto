'use client';

import { useEffect, ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { SuperAdminProvider, useSuperAdmin } from '@/context/SuperAdminContext';

function AuthGate({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useSuperAdmin();
  const router = useRouter();
  const pathname = usePathname();
  const isLoginPage = pathname === '/superadmin/login';

  useEffect(() => {
    if (!isLoading && !isAuthenticated && !isLoginPage) {
      router.replace('/superadmin/login');
    }
  }, [isAuthenticated, isLoading, isLoginPage, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-gray-400 text-sm">Загрузка...</div>
      </div>
    );
  }

  if (!isAuthenticated && !isLoginPage) return null;

  return <>{children}</>;
}

export default function SuperAdminLayout({ children }: { children: ReactNode }) {
  return (
    <SuperAdminProvider>
      <AuthGate>{children}</AuthGate>
    </SuperAdminProvider>
  );
}
