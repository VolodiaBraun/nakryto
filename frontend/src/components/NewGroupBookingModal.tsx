'use client';

import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { bookingsApi, hallsApi } from '@/lib/api';
import { cn } from '@/lib/utils';

type NewBookingType = 'hall' | 'group';

const snapTo5 = (timeStr: string) => {
  if (!timeStr) return timeStr;
  const [h, m] = timeStr.split(':').map(Number);
  const snapped = Math.round(m / 5) * 5;
  if (snapped === 60) return `${String(h + 1).padStart(2, '0')}:00`;
  return `${String(h).padStart(2, '0')}:${String(snapped).padStart(2, '0')}`;
};

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function NewGroupBookingModal({ open, onClose }: Props) {
  const qc = useQueryClient();

  const [bookingType, setBookingType] = useState<NewBookingType>('hall');
  const [selectedHallId, setSelectedHallId] = useState('');
  const [selectedTableIds, setSelectedTableIds] = useState<string[]>([]);
  const [form, setForm] = useState({
    date: '',
    startTime: '',
    endTime: '',
    guestName: '',
    guestPhone: '+7',
    guestCount: 2,
    notes: '',
  });
  const [error, setError] = useState('');

  const { data: halls = [] } = useQuery<any[]>({
    queryKey: ['halls'],
    queryFn: () => hallsApi.getAll() as any,
    enabled: open,
  });

  // Fetch day bookings for conflict preview
  const { data: dayBookingsData } = useQuery<any>({
    queryKey: ['bookings-day-preview', form.date],
    queryFn: () => bookingsApi.getAll({ date: form.date }),
    enabled: open && !!form.date && !!selectedHallId,
  });

  const currentHall = (halls as any[]).find((h) => h.id === selectedHallId);
  const hallTables: any[] = [...(currentHall?.tables ?? [])].sort((a, b) => {
    const na = parseInt(a.label), nb = parseInt(b.label);
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    return a.label.localeCompare(b.label);
  });

  // Compute which tables are busy for the selected time range
  const busyTableIds = useMemo(() => {
    const busy = new Set<string>();
    if (!form.date || !form.startTime || !form.endTime || !selectedHallId) return busy;

    const [sh, sm] = snapTo5(form.startTime).split(':').map(Number);
    const [eh, em] = snapTo5(form.endTime).split(':').map(Number);
    const rangeStart = new Date(form.date); rangeStart.setHours(sh, sm, 0, 0);
    const rangeEnd = new Date(form.date); rangeEnd.setHours(eh, em, 0, 0);
    if (rangeEnd <= rangeStart) return busy;

    const items: any[] = dayBookingsData?.items || [];
    const overlapping = items.filter(
      (b: any) =>
        new Date(b.startsAt) < rangeEnd &&
        new Date(b.endsAt) > rangeStart &&
        b.status !== 'CANCELLED' &&
        b.status !== 'NO_SHOW',
    );

    overlapping.forEach((b: any) => {
      if (b.tableId) {
        busy.add(b.tableId);
      } else if (b.bookingType === 'HALL' && b.hallId === selectedHallId) {
        hallTables.forEach((t: any) => busy.add(t.id));
      }
    });
    return busy;
  }, [form.date, form.startTime, form.endTime, selectedHallId, dayBookingsData, hallTables]);

  const hallHasConflict = bookingType === 'hall' && busyTableIds.size > 0 && hallTables.length > 0;
  const conflictLabels = hallTables
    .filter((t: any) => busyTableIds.has(t.id))
    .map((t: any) => `ст. ${t.label}`);

  const reset = () => {
    setBookingType('hall');
    setSelectedHallId('');
    setSelectedTableIds([]);
    setForm({ date: '', startTime: '', endTime: '', guestName: '', guestPhone: '+7', guestCount: 2, notes: '' });
    setError('');
    onClose();
  };

  const hallMutation = useMutation({
    mutationFn: (data: any) => bookingsApi.createHall(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['bookings'] }); reset(); },
    onError: (err: any) => setError(err?.message || 'Ошибка при создании брони'),
  });

  const groupMutation = useMutation({
    mutationFn: (data: any) => bookingsApi.createGroup(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['bookings'] }); reset(); },
    onError: (err: any) => setError(err?.message || 'Ошибка при создании брони'),
  });

  const handleSubmit = () => {
    setError('');
    if (!form.date || !form.startTime || !form.endTime || !form.guestName || !form.guestPhone) {
      setError('Заполните все обязательные поля'); return;
    }
    const [sh, sm] = snapTo5(form.startTime).split(':').map(Number);
    const [eh, em] = snapTo5(form.endTime).split(':').map(Number);
    const startsAt = new Date(form.date); startsAt.setHours(sh, sm, 0, 0);
    const endsAt = new Date(form.date); endsAt.setHours(eh, em, 0, 0);
    if (endsAt <= startsAt) { setError('Время окончания должно быть позже начала'); return; }

    if (bookingType === 'hall') {
      if (!selectedHallId) { setError('Выберите зал'); return; }
      hallMutation.mutate({
        hallId: selectedHallId,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        guestName: form.guestName,
        guestPhone: form.guestPhone,
        guestCount: form.guestCount,
        notes: form.notes || undefined,
      });
    } else {
      if (!selectedHallId) { setError('Выберите зал'); return; }
      if (selectedTableIds.length < 2) { setError('Выберите минимум 2 стола'); return; }
      groupMutation.mutate({
        tableIds: selectedTableIds,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        guestName: form.guestName,
        guestPhone: form.guestPhone,
        guestCount: form.guestCount,
        notes: form.notes || undefined,
      });
    }
  };

  if (!open) return null;
  const isPending = hallMutation.isPending || groupMutation.isPending;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-xl space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">Новая бронь</h3>
          <button onClick={reset} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>

        {/* Type */}
        <div className="flex gap-2">
          <button
            onClick={() => { setBookingType('hall'); setSelectedTableIds([]); }}
            className={cn('flex-1 py-2.5 rounded-xl text-sm font-medium border transition-colors', bookingType === 'hall' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50')}
          >
            🏛 Весь зал
          </button>
          <button
            onClick={() => setBookingType('group')}
            className={cn('flex-1 py-2.5 rounded-xl text-sm font-medium border transition-colors', bookingType === 'group' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50')}
          >
            👥 Группа столов
          </button>
        </div>

        {/* Hall */}
        <div>
          <label className="text-xs text-gray-500 block mb-1">
            Зал *{bookingType === 'group' && !selectedHallId && (
              <span className="text-blue-500 ml-2">← выберите, чтобы увидеть столы</span>
            )}
          </label>
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

        {/* Hall conflict warning */}
        {hallHasConflict && conflictLabels.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-sm text-amber-800">
            ⚠️ Заняты: {conflictLabels.join(', ')} — зал нельзя забронировать на это время
          </div>
        )}

        {/* Tables (group mode) */}
        {bookingType === 'group' && selectedHallId && (
          <div>
            <label className="text-xs text-gray-500 block mb-2">
              Столы * (выберите минимум 2)
              {selectedTableIds.length > 0 && (
                <span className="text-blue-600 ml-2">Выбрано: {selectedTableIds.length}</span>
              )}
            </label>
            {hallTables.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-3">В этом зале нет столов</p>
            ) : (
              <div className="grid grid-cols-3 gap-2 max-h-44 overflow-y-auto border border-gray-200 rounded-xl p-2 bg-gray-50">
                {hallTables.map((t: any) => {
                  const checked = selectedTableIds.includes(t.id);
                  const busy = busyTableIds.has(t.id);
                  return (
                    <label
                      key={t.id}
                      className={cn(
                        'flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors border',
                        busy
                          ? 'bg-red-50 border-red-200 text-red-400 cursor-not-allowed opacity-70'
                          : checked
                          ? 'bg-blue-50 border-blue-300 text-blue-700 font-medium cursor-pointer'
                          : 'bg-white border-gray-200 hover:border-blue-300 text-gray-700 cursor-pointer',
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={busy}
                        onChange={(e) => {
                          if (busy) return;
                          if (e.target.checked) setSelectedTableIds((prev) => [...prev, t.id]);
                          else setSelectedTableIds((prev) => prev.filter((id) => id !== t.id));
                        }}
                        className="accent-blue-600 w-4 h-4 flex-shrink-0"
                      />
                      <span>Ст.&nbsp;{t.label}</span>
                      {busy ? (
                        <span className="text-xs text-red-400 ml-auto">занят</span>
                      ) : (
                        <span className="text-xs text-gray-400">{t.minGuests}–{t.maxGuests}</span>
                      )}
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Date / time */}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-gray-500 block mb-1">Дата *</label>
            <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Начало *</label>
            <input type="time" step="300" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Конец *</label>
            <input type="time" step="300" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>

        {/* Guest */}
        <div>
          <label className="text-xs text-gray-500 block mb-1">ФИО гостя *</label>
          <input type="text" value={form.guestName} onChange={(e) => setForm({ ...form, guestName: e.target.value })} placeholder="Иван Петров" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-500 block mb-1">Телефон *</label>
            <input type="tel" value={form.guestPhone} onChange={(e) => setForm({ ...form, guestPhone: e.target.value })} placeholder="+79001234567" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Кол-во гостей</label>
            <input type="number" min={1} max={500} value={form.guestCount} onChange={(e) => setForm({ ...form, guestCount: Number(e.target.value) })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">Комментарий / пожелания</label>
          <input type="text" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Пожелания, повод..." className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>

        {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">{error}</div>}

        <div className="flex gap-3 pt-1">
          <button onClick={reset} className="flex-1 py-2.5 border border-gray-300 rounded-xl text-sm text-gray-700 hover:bg-gray-50">Отмена</button>
          <button
            onClick={handleSubmit}
            disabled={isPending || (bookingType === 'hall' && hallHasConflict)}
            className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-xl disabled:opacity-50"
          >
            {isPending ? 'Создаём...' : 'Создать бронь'}
          </button>
        </div>
      </div>
    </div>
  );
}
