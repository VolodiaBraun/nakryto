import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '@/context/AuthContext';
import { QueryProvider } from '@/context/QueryProvider';
import CookieBanner from '@/components/CookieBanner';

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
            {children}
            <CookieBanner />
          </AuthProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
