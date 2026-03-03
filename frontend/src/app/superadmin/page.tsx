'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useSuperAdmin } from '@/context/SuperAdminContext';
import { superadminApi, ApiError } from '@/lib/api';

const PLAN_LABELS: Record<string, string> = {
  FREE: 'Free',
  STANDARD: 'Стандарт',
  PREMIUM: 'Премиум',
};

const PLAN_COLORS: Record<string, string> = {
  FREE: 'bg-gray-100 text-gray-600',
  STANDARD: 'bg-blue-50 text-blue-700',
  PREMIUM: 'bg-orange-50 text-orange-700',
};

interface Restaurant {
  id: string;
  name: string;
  slug: string;
  plan: string;
  ownerEmail: string | null;
  hallCount: number;
  bookings30d: number;
  createdAt: string;
}

interface Stats {
  totalRestaurants: number;
  totalBookings: number;
  perPlan: Record<string, number>;
}

interface RestaurantsResponse {
  items: Restaurant[];
  total: number;
  page: number;
  limit: number;
}

export default function SuperAdminPage() {
  const { logout } = useSuperAdmin();
  const router = useRouter();

  const [stats, setStats] = useState<Stats | null>(null);
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [updatingPlan, setUpdatingPlan] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [statsData, listData] = await Promise.all([
        superadminApi.getStats() as Promise<Stats>,
        superadminApi.getRestaurants({ page, limit: 20, search: search || undefined }) as Promise<RestaurantsResponse>,
      ]);
      setStats(statsData);
      setRestaurants(listData.items);
      setTotal(listData.total);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        logout();
        router.replace('/superadmin/login');
      }
    } finally {
      setLoading(false);
    }
  }, [page, search, logout, router]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handlePlanChange(id: string, plan: string) {
    setUpdatingPlan(id);
    try {
      await superadminApi.updatePlan(id, plan);
      setRestaurants((prev) =>
        prev.map((r) => (r.id === id ? { ...r, plan } : r))
      );
    } finally {
      setUpdatingPlan(null);
    }
  }

  function handleLogout() {
    logout();
    router.replace('/superadmin/login');
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Шапка */}
      <header className="border-b border-gray-800 px-6 h-14 flex items-center justify-between">
        <div className="text-sm font-semibold text-orange-400">Накрыто — Суперадмин</div>
        <button
          onClick={handleLogout}
          className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
        >
          Выйти
        </button>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        {/* Статистика */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
            {[
              { label: 'Ресторанов', value: stats.totalRestaurants },
              { label: 'Броней всего', value: stats.totalBookings },
              { label: 'Free', value: stats.perPlan.FREE ?? 0 },
              { label: 'Стандарт', value: stats.perPlan.STANDARD ?? 0 },
              { label: 'Премиум', value: stats.perPlan.PREMIUM ?? 0 },
            ].map((s) => (
              <div key={s.label} className="bg-gray-900 rounded-xl p-4 border border-gray-800">
                <div className="text-2xl font-bold">{s.value}</div>
                <div className="text-gray-400 text-xs mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Поиск */}
        <div className="flex items-center gap-3">
          <input
            type="text"
            placeholder="Поиск по названию или slug..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="bg-gray-900 border border-gray-700 text-white text-sm rounded-lg px-3.5 py-2 w-72 focus:outline-none focus:ring-2 focus:ring-orange-500 placeholder-gray-500"
          />
          <div className="text-gray-500 text-sm">{total} ресторанов</div>
        </div>

        {/* Таблица */}
        <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-gray-400 text-xs uppercase tracking-wide">
                <th className="text-left px-4 py-3">Ресторан</th>
                <th className="text-left px-4 py-3">Владелец</th>
                <th className="text-center px-4 py-3">Залов</th>
                <th className="text-center px-4 py-3">Бронь/30д</th>
                <th className="text-left px-4 py-3">Тариф</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="text-center py-12 text-gray-500">Загрузка...</td>
                </tr>
              ) : restaurants.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-12 text-gray-500">Ничего не найдено</td>
                </tr>
              ) : (
                restaurants.map((r) => (
                  <tr key={r.id} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-medium text-white">{r.name}</div>
                      <div className="text-gray-500 text-xs mt-0.5">{r.slug}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-400">{r.ownerEmail ?? '—'}</td>
                    <td className="px-4 py-3 text-center text-gray-300">{r.hallCount}</td>
                    <td className="px-4 py-3 text-center text-gray-300">{r.bookings30d}</td>
                    <td className="px-4 py-3">
                      <select
                        value={r.plan}
                        onChange={(e) => handlePlanChange(r.id, e.target.value)}
                        disabled={updatingPlan === r.id}
                        className={`text-xs font-medium px-2.5 py-1 rounded-full border-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:opacity-50 ${PLAN_COLORS[r.plan]}`}
                      >
                        <option value="FREE">Free</option>
                        <option value="STANDARD">Стандарт</option>
                        <option value="PREMIUM">Премиум</option>
                      </select>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Пагинация */}
        {total > 20 && (
          <div className="flex items-center justify-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1.5 text-sm bg-gray-800 hover:bg-gray-700 disabled:opacity-40 rounded-lg transition-colors"
            >
              ←
            </button>
            <span className="text-gray-400 text-sm">
              Стр. {page} из {Math.ceil(total / 20)}
            </span>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={page >= Math.ceil(total / 20)}
              className="px-3 py-1.5 text-sm bg-gray-800 hover:bg-gray-700 disabled:opacity-40 rounded-lg transition-colors"
            >
              →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
