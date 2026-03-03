'use client';

import { useQuery } from '@tanstack/react-query';
import { restaurantApi, bookingsApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { formatDateTime, BOOKING_STATUS_LABELS, BOOKING_STATUS_COLORS } from '@/lib/utils';
import { cn } from '@/lib/utils';

export default function DashboardPage() {
  const { restaurant } = useAuth();

  const { data: stats } = useQuery({
    queryKey: ['stats'],
    queryFn: () => restaurantApi.getStats() as any,
  });

  const today = new Date().toISOString().split('T')[0];

  const { data: todayBookings } = useQuery({
    queryKey: ['bookings', 'today'],
    queryFn: () => bookingsApi.getAll({ date: today, limit: '50' }) as any,
    refetchInterval: 30000,
  });

  const statCards = [
    { label: 'Броней за месяц', value: stats?.thisMonth?.total ?? '—', color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'Подтверждено', value: stats?.thisMonth?.confirmed ?? '—', color: 'text-green-600', bg: 'bg-green-50' },
    { label: 'Столов активных', value: stats?.totalActiveTables ?? '—', color: 'text-purple-600', bg: 'bg-purple-50' },
    { label: 'Броней сегодня', value: todayBookings?.total ?? '—', color: 'text-orange-600', bg: 'bg-orange-50' },
  ];

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Дашборд</h1>
        <p className="text-gray-500 text-sm mt-1">{restaurant?.name}</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {statCards.map((card) => (
          <div key={card.label} className="bg-white rounded-xl border border-gray-200 p-5">
            <div className={cn('text-3xl font-bold mb-1', card.color)}>{card.value}</div>
            <div className="text-sm text-gray-500">{card.label}</div>
          </div>
        ))}
      </div>

      {/* Today's bookings */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Брони на сегодня</h2>
          <a href="/dashboard/bookings" className="text-sm text-blue-600 hover:underline">
            Все брони →
          </a>
        </div>

        {!todayBookings?.items?.length ? (
          <div className="p-8 text-center text-gray-400">
            <div className="text-4xl mb-3">📅</div>
            <p>Броней на сегодня нет</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {todayBookings.items.map((booking: any) => (
              <div key={booking.id} className="flex items-center gap-4 p-4">
                <div className="w-14 text-center">
                  <div className="text-base font-bold text-gray-900">{formatDateTime(booking.startsAt).split(',')[1]?.trim()}</div>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 truncate">{booking.guestName}</p>
                  <p className="text-sm text-gray-500">
                    {booking.guestPhone} · {booking.guestCount} гостей · стол {booking.table?.label}
                  </p>
                  {booking.notes && (
                    <p className="text-xs text-gray-400 truncate mt-0.5">{booking.notes}</p>
                  )}
                </div>
                <span className={cn('text-xs font-medium px-2.5 py-1 rounded-full', BOOKING_STATUS_COLORS[booking.status])}>
                  {BOOKING_STATUS_LABELS[booking.status]}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
