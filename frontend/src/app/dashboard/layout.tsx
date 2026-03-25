'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { Sidebar } from '@/components/layout/Sidebar';
import { PlanLimitBanner } from '@/components/billing/PlanLimitBanner';
import { authApi } from '@/lib/api';

function EmailVerificationBanner() {
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  const handleResend = async () => {
    setSending(true);
    try {
      await authApi.resendVerification();
      setSent(true);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="bg-amber-50 border-b border-amber-200 px-4 py-2.5 flex items-center justify-between gap-4 text-sm">
      <div className="flex items-center gap-2 text-amber-800">
        <span>⚠️</span>
        <span>
          Пожалуйста, подтвердите ваш email — проверьте почту и перейдите по ссылке из письма.
        </span>
      </div>
      <div className="flex items-center gap-3 flex-shrink-0">
        {sent ? (
          <span className="text-green-700 font-medium">✓ Письмо отправлено</span>
        ) : (
          <button
            onClick={handleResend}
            disabled={sending}
            className="text-amber-700 font-medium hover:text-amber-900 underline underline-offset-2 disabled:opacity-50"
          >
            {sending ? 'Отправляем...' : 'Отправить повторно'}
          </button>
        )}
        <button
          onClick={() => setDismissed(true)}
          className="text-amber-500 hover:text-amber-700 text-lg leading-none"
          title="Закрыть"
        >
          ×
        </button>
      </div>
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace('/login');
    }
  }, [user, isLoading, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-gray-500 text-sm">Загрузка...</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        {!user.emailVerified && <EmailVerificationBanner />}
        <PlanLimitBanner />
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
