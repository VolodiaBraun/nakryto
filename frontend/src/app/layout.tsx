import type { Metadata } from 'next';
import { Suspense } from 'react';
import './globals.css';
import { AuthProvider } from '@/context/AuthContext';
import { QueryProvider } from '@/context/QueryProvider';
import CookieBanner from '@/components/CookieBanner';
import ReferralTracker from '@/components/ReferralTracker';

export const metadata: Metadata = {
  title: 'Накрыто — бронирование столов',
  description: 'Визуальное бронирование столов для ресторанов',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>
        <QueryProvider>
          <AuthProvider>
            <Suspense fallback={null}>
              <ReferralTracker />
            </Suspense>
            {children}
            <CookieBanner />
          </AuthProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
