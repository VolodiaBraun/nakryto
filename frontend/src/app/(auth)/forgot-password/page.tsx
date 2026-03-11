'use client';

import { useState } from 'react';
import Link from 'next/link';
import { authApi } from '@/lib/api';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await authApi.forgotPassword(email);
      setSent(true);
    } catch (err: any) {
      setError(err.message || 'Произошла ошибка');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-blue-600 rounded-xl mb-4">
            <span className="text-white text-xl">🍽</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Восстановление пароля</h1>
          <p className="text-gray-500 mt-1 text-sm">Введите email — пришлём ссылку для сброса</p>
        </div>

        {sent ? (
          <div className="text-center space-y-4">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
              <span className="text-3xl">✉️</span>
            </div>
            <h2 className="font-semibold text-gray-900">Письмо отправлено</h2>
            <p className="text-sm text-gray-500">
              Если аккаунт с адресом <strong>{email}</strong> существует, вы получите письмо со ссылкой для сброса пароля.
            </p>
            <Link href="/login" className="block text-blue-600 hover:underline text-sm font-medium mt-4">
              Вернуться ко входу
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                placeholder="admin@restaurant.ru"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 px-4 rounded-lg transition-colors disabled:opacity-50"
            >
              {loading ? 'Отправляем...' : 'Отправить ссылку'}
            </button>
            <p className="text-center text-sm text-gray-500">
              <Link href="/login" className="text-blue-600 hover:underline">
                Вернуться ко входу
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
