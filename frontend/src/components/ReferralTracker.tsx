'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { referralApi } from '@/lib/api';

// Сохраняет ?ref=CODE в cookie на 30 дней
// При наличии accessToken также обновляет pendingReferralCode на сервере (last-touch)
export default function ReferralTracker() {
  const searchParams = useSearchParams();

  useEffect(() => {
    const ref = searchParams.get('ref');
    if (!ref) return;

    // Сохраняем в cookie на 30 дней
    const expires = new Date();
    expires.setDate(expires.getDate() + 30);
    document.cookie = `referral_code=${encodeURIComponent(ref)}; expires=${expires.toUTCString()}; path=/; SameSite=Lax`;

    // Если пользователь залогинен — обновляем last-touch на сервере
    const token = localStorage.getItem('accessToken');
    if (token) {
      referralApi.trackReferral(ref).catch(() => {});
    }
  }, [searchParams]);

  return null;
}

export function getReferralCodeFromCookie(): string {
  if (typeof document === 'undefined') return '';
  const match = document.cookie.match(/(?:^|;\s*)referral_code=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : '';
}
