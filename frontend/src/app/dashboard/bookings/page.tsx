'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { bookingsApi } from '@/lib/api';
import { formatDateTime, BOOKING_STATUS_LABELS, BOOKING_STATUS_COLORS } from '@/lib/utils';
import { cn } from '@/lib/utils';
import type { Booking, BookingStatus } from '@/types';

const STATUS_FLOW: Record<BookingStatus, BookingStatus[]> = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['SEATED', 'CANCELLED', 'NO_SHOW'],
  SEATED: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
};

const FILTERS = [
  { label: 'Все', value: '' },
  { label: 'Ожидают', value: 'PENDING' },
  { label: 'Подтверждены', value: 'CONFIRMED' },
  { label: 'Сидят', value: 'SEATED' },
  { label: 'Завершены', value: 'COMPLETED' },
  { label: 'Отменены', value: 'CANCELLED' },
];

export default function BookingsPage() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Booking | null>(null);

  const params: Record<string, string> = {};
  if (statusFilter) params.status = statusFilter;
  if (dateFilter) params.date = dateFilter;
  if (search) params.search = search;

  const { data, isLoading } = useQuery<any>({
    queryKey: ['bookings', params],
    queryFn: () => bookingsApi.getAll(params),
    refetchInterval: 10000,
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: BookingStatus }) =>
      bookingsApi.updateStatus(id, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bookings'] });
      setSelected(null);
    },
  });

  const bookings: Booking[] = data?.items || [];

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Управление бронями</h1>

      {/* Filters */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-5 flex flex-wrap gap-3 items-center">
        <div className="flex gap-1 flex-wrap">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setStatusFilter(f.value)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-sm transition-colors',
                statusFilter === f.value
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <input
          type="date"
          value={dateFilter}
          onChange={(e) => setDateFilter(e.target.value)}
          className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <input
          type="text"
          placeholder="Поиск по имени или телефону"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-48 px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                {['Гость', 'Телефон', 'Дата и время', 'Стол', 'Гостей', 'Статус', ''].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 7 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 bg-gray-100 rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : bookings.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-gray-400">
                    Броней не найдено
                  </td>
                </tr>
              ) : (
                bookings.map((booking) => (
                  <tr key={booking.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-900">{booking.guestName}</td>
                    <td className="px-4 py-3 text-gray-600 text-sm">{booking.guestPhone}</td>
                    <td className="px-4 py-3 text-gray-600 text-sm">{formatDateTime(booking.startsAt)}</td>
                    <td className="px-4 py-3 text-gray-600 text-sm">
                      {(booking as any).table?.label} · {(booking as any).hall?.name}
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-sm text-center">{booking.guestCount}</td>
                    <td className="px-4 py-3">
                      <span className={cn('text-xs font-medium px-2 py-1 rounded-full', BOOKING_STATUS_COLORS[booking.status])}>
                        {BOOKING_STATUS_LABELS[booking.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setSelected(booking)}
                        className="text-sm text-blue-600 hover:underline"
                      >
                        Действия
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {data?.total > 0 && (
          <div className="px-4 py-3 border-t border-gray-100 text-sm text-gray-500">
            Всего: {data.total} броней
          </div>
        )}
      </div>

      {/* Actions Modal */}
      {selected && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <h3 className="font-semibold text-gray-900 mb-1">{selected.guestName}</h3>
            <p className="text-sm text-gray-500 mb-4">
              {formatDateTime(selected.startsAt)} · стол {(selected as any).table?.label}
            </p>

            <div className="text-sm text-gray-500 mb-3 space-y-1">
              <div>{selected.guestPhone}{selected.guestEmail ? ` · ${selected.guestEmail}` : ''}</div>
              {(selected as any).confirmedBy && (
                <div className="text-xs text-green-700 bg-green-50 rounded px-2 py-1">
                  ✓ Подтвердил: {(selected as any).confirmedBy.name}
                  {(selected as any).confirmedAt && (
                    <span className="text-gray-400 ml-1">
                      {new Date((selected as any).confirmedAt).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                </div>
              )}
            </div>

            {selected.notes && (
              <div className="bg-gray-50 rounded-lg p-3 mb-4 text-sm text-gray-600">
                📝 {selected.notes}
              </div>
            )}

            <p className="text-xs font-medium text-gray-500 mb-2">Изменить статус:</p>
            <div className="flex flex-wrap gap-2 mb-4">
              {(STATUS_FLOW[selected.status] || []).map((nextStatus) => (
                <button
                  key={nextStatus}
                  onClick={() => statusMutation.mutate({ id: selected.id, status: nextStatus })}
                  disabled={statusMutation.isPending}
                  className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-sm transition-colors disabled:opacity-50"
                >
                  → {BOOKING_STATUS_LABELS[nextStatus]}
                </button>
              ))}
            </div>

            <button
              onClick={() => setSelected(null)}
              className="w-full py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50"
            >
              Закрыть
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
