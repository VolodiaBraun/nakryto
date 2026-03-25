'use client';

import { useQuery } from '@tanstack/react-query';
import { billingApi } from '@/lib/api';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';

export function PlanLimitBanner() {
  const { user } = useAuth();

  const { data } = useQuery({
    queryKey: ['billing', 'limit-status'],
    queryFn: () => billingApi.getLimitStatus() as Promise<any>,
    staleTime: 60_000,
    enabled: !!user,
  });

  if (!data) return null;

  const { bookingLimitExceeded, planExpiresSoon, planExpiresAt, bookingsUsed, bookingLimit, plan } = data;

  if (!bookingLimitExceeded && !planExpiresSoon) return null;

  if (bookingLimitExceeded) {
    return (
      <div className="bg-red-50 border-b border-red-200 px-4 py-2.5 flex items-center justify-between gap-4 text-sm">
        <div className="flex items-center gap-2 text-red-800">
          <span>🚫</span>
          <span>
            Достигнут лимит броней на этот месяц ({bookingsUsed}/{bookingLimit}).
            Онлайн-бронирование гостями приостановлено.
          </span>
        </div>
        {user?.role === 'OWNER' && (
          <Link
            href="/dashboard/billing"
            className="text-red-700 font-medium hover:text-red-900 underline underline-offset-2 flex-shrink-0"
          >
            Обновить тариф →
          </Link>
        )}
      </div>
    );
  }

  if (planExpiresSoon && planExpiresAt) {
    const daysLeft = Math.ceil((new Date(planExpiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return (
      <div className="bg-amber-50 border-b border-amber-200 px-4 py-2.5 flex items-center justify-between gap-4 text-sm">
        <div className="flex items-center gap-2 text-amber-800">
          <span>⏳</span>
          <span>
            Тариф {plan} истекает через {daysLeft} {daysLeft === 1 ? 'день' : daysLeft < 5 ? 'дня' : 'дней'}.
            После истечения будут применены ограничения бесплатного тарифа.
          </span>
        </div>
        {user?.role === 'OWNER' && (
          <Link
            href="/dashboard/billing"
            className="text-amber-700 font-medium hover:text-amber-900 underline underline-offset-2 flex-shrink-0"
          >
            Продлить →
          </Link>
        )}
      </div>
    );
  }

  return null;
}
