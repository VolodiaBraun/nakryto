'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';

  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setMessage('Ссылка недействительна — токен отсутствует');
      return;
    }

    fetch(`${API_URL}/api/auth/verify-email?token=${encodeURIComponent(token)}`)
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (res.ok) {
          setStatus('success');
          setMessage(json.message || 'Email успешно подтверждён');
        } else {
          setStatus('error');
          setMessage(json.error?.message || json.message || 'Ссылка недействительна или уже использована');
        }
      })
      .catch(() => {
        setStatus('error');
        setMessage('Не удалось подключиться к серверу. Попробуйте позже.');
      });
  }, [token]);

  if (status === 'loading') {
    return (
      <div className="text-center space-y-4">
        <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-gray-500 text-sm">Подтверждаем email...</p>
      </div>
    );
  }

  if (status === 'success') {
    return (
      <div className="text-center space-y-4">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
          <span className="text-3xl">✅</span>
        </div>
        <h2 className="font-semibold text-gray-900 text-lg">Email подтверждён!</h2>
        <p className="text-sm text-gray-500">{message}</p>
        <Link
          href="/dashboard"
          className="inline-block mt-2 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 px-6 rounded-lg transition-colors text-sm"
        >
          Перейти в дашборд →
        </Link>
      </div>
    );
  }

  return (
    <div className="text-center space-y-4">
      <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto">
        <span className="text-3xl">❌</span>
      </div>
      <h2 className="font-semibold text-gray-900 text-lg">Не удалось подтвердить</h2>
      <p className="text-sm text-gray-500">{message}</p>
      <Link
        href="/dashboard"
        className="inline-block mt-2 text-blue-600 hover:underline text-sm"
      >
        Вернуться в дашборд
      </Link>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-blue-600 rounded-xl mb-4">
            <span className="text-white text-xl">🍽</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Подтверждение email</h1>
        </div>
        <Suspense fallback={<div className="text-center text-gray-400">Загрузка...</div>}>
          <VerifyEmailContent />
        </Suspense>
      </div>
    </div>
  );
}
