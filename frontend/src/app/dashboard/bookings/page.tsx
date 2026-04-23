'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { bookingsApi, hallsApi } from '@/lib/api';
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

type NewBookingType = 'hall' | 'group';

const snapTo5 = (timeStr: string) => {
  if (!timeStr) return timeStr;
  const [h, m] = timeStr.split(':').map(Number);
  const snapped = Math.round(m / 5) * 5;
  if (snapped === 60) return `${String(h + 1).padStart(2, '0')}:00`;
  return `${String(h).padStart(2, '0')}:${String(snapped).padStart(2, '0')}`;
};

export default function BookingsPage() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Booking | null>(null);

  // PDF export
  const [showExport, setShowExport] = useState(false);
  const [exportFrom, setExportFrom] = useState('');
  const [exportTo, setExportTo] = useState('');

  // New booking modal
  const [showNewBooking, setShowNewBooking] = useState(false);
  const [newBookingType, setNewBookingType] = useState<NewBookingType>('hall');
  const [selectedHallId, setSelectedHallId] = useState('');
  const [selectedTableIds, setSelectedTableIds] = useState<string[]>([]);
  const [nbForm, setNbForm] = useState({
    date: '',
    startTime: '',
    endTime: '',
    guestName: '',
    guestPhone: '+7',
    guestCount: 2,
    notes: '',
  });
  const [nbError, setNbError] = useState('');

  const params: Record<string, string> = {};
  if (statusFilter) params.status = statusFilter;
  if (dateFilter) params.date = dateFilter;
  if (search) params.search = search;

  const { data, isLoading } = useQuery<any>({
    queryKey: ['bookings', params],
    queryFn: () => bookingsApi.getAll(params),
    refetchInterval: 10000,
  });

  const { data: halls = [] } = useQuery<any[]>({
    queryKey: ['halls'],
    queryFn: () => hallsApi.getAll() as any,
  });

  const currentHall = (halls as any[]).find((h) => h.id === selectedHallId);
  const hallTables: any[] = [...(currentHall?.tables ?? [])].sort((a, b) => {
    const na = parseInt(a.label), nb = parseInt(b.label);
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    return a.label.localeCompare(b.label);
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: BookingStatus }) =>
      bookingsApi.updateStatus(id, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bookings'] });
      setSelected(null);
    },
  });

  const hallBookingMutation = useMutation({
    mutationFn: (data: any) => bookingsApi.createHall(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bookings'] });
      resetNewBooking();
    },
    onError: (err: any) => setNbError(err?.message || 'Ошибка при создании брони'),
  });

  const groupBookingMutation = useMutation({
    mutationFn: (data: any) => bookingsApi.createGroup(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bookings'] });
      resetNewBooking();
    },
    onError: (err: any) => setNbError(err?.message || 'Ошибка при создании брони'),
  });

  const bookings: Booking[] = data?.items || [];

  const resetNewBooking = () => {
    setShowNewBooking(false);
    setNbError('');
    setNbForm({ date: '', startTime: '', endTime: '', guestName: '', guestPhone: '+7', guestCount: 2, notes: '' });
    setSelectedHallId('');
    setSelectedTableIds([]);
  };

  const handleNewBookingSubmit = () => {
    setNbError('');
    if (!nbForm.date || !nbForm.startTime || !nbForm.endTime || !nbForm.guestName || !nbForm.guestPhone) {
      setNbError('Заполните все обязательные поля');
      return;
    }
    const [sh, sm] = snapTo5(nbForm.startTime).split(':').map(Number);
    const [eh, em] = snapTo5(nbForm.endTime).split(':').map(Number);
    const startsAt = new Date(nbForm.date);
    startsAt.setHours(sh, sm, 0, 0);
    const endsAt = new Date(nbForm.date);
    endsAt.setHours(eh, em, 0, 0);

    if (endsAt <= startsAt) {
      setNbError('Время окончания должно быть позже начала');
      return;
    }

    if (newBookingType === 'hall') {
      if (!selectedHallId) { setNbError('Выберите зал'); return; }
      hallBookingMutation.mutate({
        hallId: selectedHallId,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        guestName: nbForm.guestName,
        guestPhone: nbForm.guestPhone,
        guestCount: nbForm.guestCount,
        notes: nbForm.notes || undefined,
      });
    } else {
      if (selectedTableIds.length < 2) { setNbError('Выберите минимум 2 стола'); return; }
      groupBookingMutation.mutate({
        tableIds: selectedTableIds,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        guestName: nbForm.guestName,
        guestPhone: nbForm.guestPhone,
        guestCount: nbForm.guestCount,
        notes: nbForm.notes || undefined,
      });
    }
  };

  const handlePrint = async () => {
    if (!exportFrom || !exportTo) return;
    const result: any = await bookingsApi.getAll({
      dateFrom: exportFrom,
      dateTo: exportTo,
      limit: '1000',
    });
    const items: any[] = result?.items || [];
    openPrintWindow(items, exportFrom, exportTo);
    setShowExport(false);
  };

  const tableLabel = (booking: any) => {
    if (booking.bookingType === 'HALL') return `🏛 Весь зал: ${booking.hall?.name ?? ''}`;
    if (booking.bookingType === 'GROUP') return `👥 Группа · ст. ${booking.table?.label ?? ''}`;
    return `${booking.table?.label ?? '?'} · ${booking.hall?.name ?? ''}`;
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Управление бронями</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setShowExport(true)}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm rounded-lg transition-colors border border-gray-300"
          >
            📄 Экспорт PDF
          </button>
          <button
            onClick={() => setShowNewBooking(true)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors"
          >
            + Зал / Группа столов
          </button>
        </div>
      </div>

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
                {['Гость', 'Телефон', 'Дата и время', 'Место', 'Гостей', 'Комментарий', 'Статус', ''].map((h) => (
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
                    {Array.from({ length: 8 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 bg-gray-100 rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : bookings.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-gray-400">
                    Броней не найдено
                  </td>
                </tr>
              ) : (
                bookings.map((booking) => (
                  <tr key={booking.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-900">{booking.guestName}</td>
                    <td className="px-4 py-3 text-gray-600 text-sm">{booking.guestPhone}</td>
                    <td className="px-4 py-3 text-gray-600 text-sm">{formatDateTime(booking.startsAt)}</td>
                    <td className="px-4 py-3 text-gray-600 text-sm">{tableLabel(booking)}</td>
                    <td className="px-4 py-3 text-gray-600 text-sm text-center">{booking.guestCount}</td>
                    <td className="px-4 py-3 text-gray-500 text-sm max-w-40 truncate" title={(booking as any).notes || ''}>
                      {(booking as any).notes || <span className="text-gray-300">—</span>}
                    </td>
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
            <p className="text-sm text-gray-500 mb-1">
              {formatDateTime(selected.startsAt)} · {tableLabel(selected)}
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

      {/* PDF Export Modal */}
      {showExport && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">Экспорт броней (PDF)</h3>
              <button onClick={() => setShowExport(false)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <p className="text-sm text-gray-500">Выберите диапазон дат. Откроется окно для печати — выберите «Сохранить как PDF».</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500 block mb-1">С</label>
                <input type="date" value={exportFrom} onChange={(e) => setExportFrom(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">По</label>
                <input type="date" value={exportTo} onChange={(e) => setExportTo(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowExport(false)} className="flex-1 py-2.5 border border-gray-300 rounded-xl text-sm text-gray-700 hover:bg-gray-50">Отмена</button>
              <button
                onClick={handlePrint}
                disabled={!exportFrom || !exportTo}
                className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-xl disabled:opacity-50"
              >
                Открыть для печати
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Hall / Group Booking Modal */}
      {showNewBooking && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">Новая бронь</h3>
              <button onClick={resetNewBooking} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>

            {/* Type selector */}
            <div className="flex gap-2">
              <button
                onClick={() => { setNewBookingType('hall'); setSelectedTableIds([]); }}
                className={cn('flex-1 py-2.5 rounded-xl text-sm font-medium border transition-colors', newBookingType === 'hall' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50')}
              >
                🏛 Весь зал
              </button>
              <button
                onClick={() => setNewBookingType('group')}
                className={cn('flex-1 py-2.5 rounded-xl text-sm font-medium border transition-colors', newBookingType === 'group' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50')}
              >
                👥 Группа столов
              </button>
            </div>

            {/* Hall selector */}
            <div>
              <label className="text-xs text-gray-500 block mb-1">Зал *</label>
              <select
                value={selectedHallId}
                onChange={(e) => { setSelectedHallId(e.target.value); setSelectedTableIds([]); }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">— выберите зал —</option>
                {(halls as any[]).map((h) => (
                  <option key={h.id} value={h.id}>{h.name}</option>
                ))}
              </select>
            </div>

            {/* Table selector for GROUP type */}
            {newBookingType === 'group' && selectedHallId && hallTables.length > 0 && (
              <div>
                <label className="text-xs text-gray-500 block mb-2">Столы (выберите минимум 2) *</label>
                <div className="grid grid-cols-3 gap-2 max-h-40 overflow-y-auto border border-gray-200 rounded-lg p-2">
                  {hallTables.map((t) => {
                    const checked = selectedTableIds.includes(t.id);
                    return (
                      <label key={t.id} className={cn('flex items-center gap-2 p-2 rounded-lg cursor-pointer text-sm transition-colors', checked ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-50 text-gray-700')}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            if (e.target.checked) setSelectedTableIds((prev) => [...prev, t.id]);
                            else setSelectedTableIds((prev) => prev.filter((id) => id !== t.id));
                          }}
                          className="accent-blue-600"
                        />
                        Ст. {t.label} ({t.minGuests}–{t.maxGuests})
                      </label>
                    );
                  })}
                </div>
                {selectedTableIds.length > 0 && (
                  <p className="text-xs text-blue-600 mt-1">Выбрано: {selectedTableIds.length} стол(а/ов)</p>
                )}
              </div>
            )}

            {/* Date and time */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-gray-500 block mb-1">Дата *</label>
                <input type="date" value={nbForm.date} onChange={(e) => setNbForm({ ...nbForm, date: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Начало *</label>
                <input type="time" step="300" value={nbForm.startTime} onChange={(e) => setNbForm({ ...nbForm, startTime: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Конец *</label>
                <input type="time" step="300" value={nbForm.endTime} onChange={(e) => setNbForm({ ...nbForm, endTime: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>

            {/* Guest info */}
            <div>
              <label className="text-xs text-gray-500 block mb-1">ФИО гостя *</label>
              <input type="text" value={nbForm.guestName} onChange={(e) => setNbForm({ ...nbForm, guestName: e.target.value })} placeholder="Иван Петров" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500 block mb-1">Телефон *</label>
                <input type="tel" value={nbForm.guestPhone} onChange={(e) => setNbForm({ ...nbForm, guestPhone: e.target.value })} placeholder="+79001234567" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Кол-во гостей</label>
                <input type="number" min={1} max={500} value={nbForm.guestCount} onChange={(e) => setNbForm({ ...nbForm, guestCount: Number(e.target.value) })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Комментарий / пожелания</label>
              <input type="text" value={nbForm.notes} onChange={(e) => setNbForm({ ...nbForm, notes: e.target.value })} placeholder="Пожелания, повод..." className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>

            {nbError && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">{nbError}</div>
            )}

            <div className="flex gap-3 pt-1">
              <button onClick={resetNewBooking} className="flex-1 py-2.5 border border-gray-300 rounded-xl text-sm text-gray-700 hover:bg-gray-50">Отмена</button>
              <button
                onClick={handleNewBookingSubmit}
                disabled={hallBookingMutation.isPending || groupBookingMutation.isPending}
                className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-xl disabled:opacity-50"
              >
                {hallBookingMutation.isPending || groupBookingMutation.isPending ? 'Создаём...' : 'Создать бронь'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function openPrintWindow(bookings: any[], from: string, to: string) {
  const fmt = (dt: string) => {
    const d = new Date(dt);
    return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };
  const STATUS_RU: Record<string, string> = {
    PENDING: 'Ожидает', CONFIRMED: 'Подтверждена', SEATED: 'Сидит',
    COMPLETED: 'Завершена', CANCELLED: 'Отменена', NO_SHOW: 'Не явился',
  };
  const placeLabel = (b: any) => {
    if (b.bookingType === 'HALL') return `Весь зал: ${b.hall?.name ?? ''}`;
    if (b.bookingType === 'GROUP') return `Группа · ст. ${b.table?.label ?? ''} (${b.hall?.name ?? ''})`;
    return `Ст. ${b.table?.label ?? '?'} · ${b.hall?.name ?? ''}`;
  };

  const rows = bookings
    .map((b) => `
      <tr>
        <td>${b.guestName}</td>
        <td>${b.guestPhone}</td>
        <td>${fmt(b.startsAt)} — ${fmt(b.endsAt)}</td>
        <td>${placeLabel(b)}</td>
        <td>${b.guestCount}</td>
        <td>${STATUS_RU[b.status] ?? b.status}</td>
        <td>${b.notes ?? ''}</td>
      </tr>`)
    .join('');

  const html = `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8" />
<title>Брони ${from} — ${to}</title>
<style>
  body { font-family: Arial, sans-serif; font-size: 12px; margin: 20px; }
  h2 { margin-bottom: 8px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: left; }
  th { background: #f5f5f5; font-weight: bold; }
  tr:nth-child(even) { background: #fafafa; }
  @media print { body { margin: 10px; } }
</style>
</head>
<body>
<h2>Брони: ${from} — ${to}</h2>
<p>Всего: ${bookings.length}</p>
<table>
  <thead>
    <tr><th>Гость</th><th>Телефон</th><th>Дата и время</th><th>Место</th><th>Гостей</th><th>Статус</th><th>Комментарий</th></tr>
  </thead>
  <tbody>${rows}</tbody>
</table>
</body>
</html>`;

  const w = window.open('', '_blank');
  if (!w) return;
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 300);
}
