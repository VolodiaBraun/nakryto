'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { authApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

export default function RegisterPartnerPage() {
  const router = useRouter();
  const { refreshUser } = useAuth();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '' });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data: any = await authApi.registerPartner(form);
      localStorage.setItem('accessToken', data.accessToken);
      localStorage.setItem('refreshToken', data.refreshToken);
      await refreshUser();
      router.push('/partner');
    } catch (err: any) {
      setError(err.message || 'Ошибка регистрации');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-50 to-purple-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-violet-600 rounded-xl mb-4">
            <span className="text-white text-xl">🤝</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Стать партнёром</h1>
          <p className="text-gray-500 mt-1 text-sm">
            Привлекайте рестораны и зарабатывайте комиссию с их подписок
          </p>
        </div>

        {/* Преимущества */}
        <div className="bg-violet-50 border border-violet-100 rounded-xl p-4 mb-6 space-y-2 text-sm text-violet-800">
          <div className="flex items-center gap-2">
            <span>💰</span>
            <span>20% комиссия со всех платежей привлечённых ресторанов</span>
          </div>
          <div className="flex items-center gap-2">
            <span>🎁</span>
            <span>50% скидка для ваших рефералов на первую подписку</span>
          </div>
          <div className="flex items-center gap-2">
            <span>📊</span>
            <span>Детальная статистика и прогноз доходов</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Ваше имя</label>
            <input
              name="name"
              value={form.name}
              onChange={handleChange}
              required
              placeholder="Иван Петров"
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              name="email"
              value={form.email}
              onChange={handleChange}
              required
              placeholder="partner@example.ru"
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Пароль</label>
            <input
              type="password"
              name="password"
              value={form.password}
              onChange={handleChange}
              required
              minLength={8}
              placeholder="Минимум 8 символов"
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-violet-600 hover:bg-violet-700 text-white font-medium py-2.5 px-4 rounded-lg transition-colors disabled:opacity-50"
          >
            {loading ? 'Регистрируем...' : 'Стать партнёром'}
          </button>
        </form>

        <div className="mt-6 space-y-2 text-center text-sm text-gray-500">
          <p>
            Уже есть аккаунт?{' '}
            <Link href="/login" className="text-violet-600 hover:underline font-medium">
              Войти
            </Link>
          </p>
          <p>
            У вас ресторан?{' '}
            <Link href="/register" className="text-blue-600 hover:underline font-medium">
              Зарегистрировать ресторан
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
