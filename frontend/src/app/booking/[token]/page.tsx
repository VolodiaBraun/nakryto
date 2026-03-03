'use client';

import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { publicApi } from '@/lib/api';
import { formatDateTime, BOOKING_STATUS_LABELS, BOOKING_STATUS_COLORS } from '@/lib/utils';
import { cn } from '@/lib/utils';

export default function BookingDetailPage({ params }: { params: { token: string } }) {
  const { token } = params;
  const [cancelled, setCancelled] = useState(false);

  const { data: booking, isLoading, error } = useQuery<any>({
    queryKey: ['booking', token],
    queryFn: () => publicApi.getBookingByToken(token),
  });

  const cancelMutation = useMutation({
    mutationFn: () => publicApi.cancelBooking(token),
    onSuccess: () => setCancelled(true),
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !booking) {
    return (
      <div className="min-h-screen flex items-center justify-center text-center">
        <div>
          <div className="text-5xl mb-4">😕</div>
          <p className="text-gray-600">Бронь не найдена</p>
        </div>
      </div>
    );
  }

  const b = (booking as any).data || booking;
  const canCancel = !cancelled && !['COMPLETED', 'CANCELLED', 'NO_SHOW'].includes(b.status);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg w-full max-w-md p-6">
        <div className="text-center mb-6">
          <div className="text-4xl mb-3">{cancelled ? '❌' : '🍽'}</div>
          <h1 className="text-xl font-bold text-gray-900">
            {cancelled ? 'Бронь отменена' : 'Ваша бронь'}
          </h1>
          {b.restaurant?.name && (
            <p className="text-gray-500 text-sm mt-1">{b.restaurant.name}</p>
          )}
        </div>

        <div className="space-y-3 mb-6">
          <Row label="Статус">
            <span className={cn('text-xs font-medium px-2 py-1 rounded-full', BOOKING_STATUS_COLORS[b.status])}>
              {BOOKING_STATUS_LABELS[b.status]}
            </span>
          </Row>
          <Row label="Гость"><span className="font-medium">{b.guestName}</span></Row>
          <Row label="Телефон"><span>{b.guestPhone}</span></Row>
          <Row label="Дата и время"><span>{formatDateTime(b.startsAt)}</span></Row>
          <Row label="Стол"><span>Стол {b.table?.label} · {b.hall?.name}</span></Row>
          <Row label="Гостей"><span>{b.guestCount}</span></Row>
          {b.notes && <Row label="Пожелания"><span className="text-gray-600">{b.notes}</span></Row>}
        </div>

        {cancelMutation.isError && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm mb-4">
            {(cancelMutation.error as any)?.message || 'Ошибка при отмене'}
          </div>
        )}

        {canCancel && (
          <button
            onClick={() => {
              if (confirm('Вы уверены, что хотите отменить бронь?')) {
                cancelMutation.mutate();
              }
            }}
            disabled={cancelMutation.isPending}
            className="w-full py-2.5 border border-red-300 text-red-600 hover:bg-red-50 rounded-xl text-sm transition-colors disabled:opacity-50"
          >
            {cancelMutation.isPending ? 'Отменяем...' : 'Отменить бронь'}
          </button>
        )}
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between items-center py-2 border-b border-gray-100 last:border-0">
      <span className="text-gray-500 text-sm">{label}</span>
      <span className="text-gray-900 text-sm">{children}</span>
    </div>
  );
}
