'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { hallsApi, bookingsApi, closedPeriodsApi, publicApi, uploadsApi } from '@/lib/api';
import NewGroupBookingModal from '@/components/NewGroupBookingModal';
import MassCloseModal from '@/components/MassCloseModal';
import PhotoUploader from '@/components/PhotoUploader';
import { BOOKING_STATUS_LABELS, BOOKING_STATUS_COLORS, formatDate, formatTime } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import { useBookingSocket } from '@/hooks/useBookingSocket';
import { v4 as uuidv4 } from 'uuid';

// ─── Типы ─────────────────────────────────────────────────────────────────────

type BookingStatus = 'PENDING' | 'CONFIRMED' | 'SEATED' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';

const STATUS_FLOW: Record<BookingStatus, BookingStatus[]> = {
  PENDING:   ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['SEATED', 'CANCELLED', 'NO_SHOW'],
  SEATED:    ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW:   [],
};

// ─── Страница ─────────────────────────────────────────────────────────────────

export default function TablesPage() {
  const qc = useQueryClient();
  const { restaurant } = useAuth();
  const slug = restaurant?.slug ?? '';

  // Выбранные: зал, стол
  const [selectedHallId, setSelectedHallId] = useState<string | null>(null);
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);

  // Фильтр дат для броней
  const [bookingDate, setBookingDate] = useState(new Date().toISOString().split('T')[0]);

  // Locked tables from guests: tableId → expiresAt
  const [guestLocks, setGuestLocks] = useState<Record<string, string>>({});

  // Admin's own lock (when booking modal is open)
  const adminLockId = useRef<string>(uuidv4());
  const adminLockedTable = useRef<{ tableId: string; date: string } | null>(null);

  // WebSocket: track guest locks/unlocks and new bookings
  const handleLocked = useCallback((data: { tableId: string; expiresAt?: string }) => {
    setGuestLocks((prev) => ({ ...prev, [data.tableId]: data.expiresAt ?? '' }));
    qc.invalidateQueries({ queryKey: ['bookings'] });
  }, [qc]);

  const handleUnlocked = useCallback((data: { tableId: string }) => {
    setGuestLocks((prev) => { const next = { ...prev }; delete next[data.tableId]; return next; });
  }, []);

  const handleBookingChange = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['bookings'] });
  }, [qc]);

  useBookingSocket(slug, bookingDate, {
    onBookingCreated: handleBookingChange,
    onBookingCancelled: handleBookingChange,
    onTableLocked: handleLocked,
    onTableUnlocked: handleUnlocked,
  });

  // Expire stale guest locks client-side
  useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now();
      setGuestLocks((prev) => {
        const next = { ...prev };
        let changed = false;
        for (const [tableId, expiresAt] of Object.entries(next)) {
          if (expiresAt && new Date(expiresAt).getTime() < now) {
            delete next[tableId];
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, 5000);
    return () => clearInterval(id);
  }, []);

  const [massModal, setMassModal] = useState(false);
  const [groupModal, setGroupModal] = useState(false);

  // Добавление периода для стола
  const [periodForm, setPeriodForm] = useState({ startsAt: '', endsAt: '', reason: '' });
  const [showPeriodForm, setShowPeriodForm] = useState(false);

  // Фото стола
  const [uploadingTable, setUploadingTable] = useState(false);

  // Создание брони вручную
  const [bookingModal, setBookingModal] = useState(false);
  const [newBooking, setNewBooking] = useState({ date: '', time: '', guestName: '', guestPhone: '+7', guestCount: 2, notes: '' });

  // Редактирование брони
  const [editModal, setEditModal] = useState(false);
  const [editBooking, setEditBooking] = useState<any>(null);
  const [editForm, setEditForm] = useState({ date: '', time: '', tableId: '', duration: 120 });

  // ─── Запросы ───────────────────────────────────────────────────────────────

  const { data: halls = [] } = useQuery<any[]>({
    queryKey: ['halls'],
    queryFn: () => hallsApi.getAll() as any,
    staleTime: 0,
  });

  const currentHall = (halls as any[]).find((h) => h.id === selectedHallId) ?? halls[0] ?? null;
  const tables: any[] = [...(currentHall?.tables ?? [])].sort((a, b) => {
    const na = parseInt(a.label), nb = parseInt(b.label);
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    return a.label.localeCompare(b.label);
  });
  const selectedTable = tables.find((t) => t.id === selectedTableId) ?? null;

  const { data: bookingsData } = useQuery<any>({
    queryKey: ['bookings', bookingDate, selectedTableId],
    queryFn: () => bookingsApi.getAll({ date: bookingDate, limit: '100' }),
    enabled: !!selectedTableId,
  });
  const tableBookings: any[] = (bookingsData?.items ?? []).filter((b: any) => b.tableId === selectedTableId);

  const { data: periodsData = [] } = useQuery<any[]>({
    queryKey: ['closedPeriods'],
    queryFn: () => closedPeriodsApi.getAll() as any,
  });
  const tablePeriods = (periodsData as any[]).filter((p) => p.tableId === selectedTableId || p.tableId === null);

  // ─── Мутации ───────────────────────────────────────────────────────────────

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => bookingsApi.updateStatus(id, { status } as any),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bookings'] }),
  });

  const addPeriod = useMutation({
    mutationFn: (data: any) => closedPeriodsApi.create(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['closedPeriods'] }); setShowPeriodForm(false); setPeriodForm({ startsAt: '', endsAt: '', reason: '' }); },
  });

  const deletePeriod = useMutation({
    mutationFn: (id: string) => closedPeriodsApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['closedPeriods'] }),
  });


  const createBooking = useMutation({
    mutationFn: (data: any) => bookingsApi.create(data),
    onSuccess: () => {
      // Unlock after booking created (booking_created WS event will refresh guests)
      if (adminLockedTable.current) {
        const { tableId, date } = adminLockedTable.current;
        publicApi.unlockTable(slug, tableId, date, adminLockId.current).catch(() => {});
        adminLockedTable.current = null;
      }
      qc.invalidateQueries({ queryKey: ['bookings'] });
      setBookingModal(false);
      setNewBooking({ date: '', time: '', guestName: '', guestPhone: '+7', guestCount: 2, notes: '' });
    },
  });

  // Lock table when admin opens booking modal
  const openBookingModal = useCallback((tableId: string, date: string) => {
    if (!slug || !tableId || !date) return;
    setBookingModal(true);
    setNewBooking((prev) => ({ ...prev, date }));
    // Lock so guests see "someone is booking"
    publicApi.lockTable(slug, tableId, date, adminLockId.current).catch(() => {});
    adminLockedTable.current = { tableId, date };
  }, [slug]);

  const closeBookingModal = useCallback(() => {
    if (adminLockedTable.current) {
      const { tableId, date } = adminLockedTable.current;
      publicApi.unlockTable(slug, tableId, date, adminLockId.current).catch(() => {});
      adminLockedTable.current = null;
    }
    setBookingModal(false);
  }, [slug]);

  const updateBooking = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => bookingsApi.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['bookings'] }); setEditModal(false); setEditBooking(null); },
  });

  // ─── Хелперы ───────────────────────────────────────────────────────────────

  // Округляем минуты до кратного 5
  const snapTo5 = (timeStr: string) => {
    if (!timeStr) return timeStr;
    const [h, m] = timeStr.split(':').map(Number);
    const snapped = Math.round(m / 5) * 5;
    if (snapped === 60) return `${String(h + 1).padStart(2, '0')}:00`;
    return `${String(h).padStart(2, '0')}:${String(snapped).padStart(2, '0')}`;
  };

  const handleAddPeriod = (tableId: string | null) => {
    if (!periodForm.startsAt || !periodForm.endsAt) return;
    addPeriod.mutate({
      tableId: tableId,
      startsAt: new Date(periodForm.startsAt).toISOString(),
      endsAt: new Date(periodForm.endsAt).toISOString(),
      reason: periodForm.reason || undefined,
    });
  };


  const openEditModal = (booking: any) => {
    const d = new Date(booking.startsAt);
    const e = new Date(booking.endsAt);
    setEditBooking(booking);
    setEditForm({
      date: d.toISOString().split('T')[0],
      time: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
      tableId: booking.tableId,
      duration: Math.round((e.getTime() - d.getTime()) / 60000),
    });
    setEditModal(true);
  };

  const handleUpdateBooking = () => {
    if (!editBooking || !editForm.date || !editForm.time) return;
    const time = snapTo5(editForm.time);
    const [h, m] = time.split(':').map(Number);
    const startsAt = new Date(editForm.date + 'T00:00:00');
    startsAt.setHours(h, m, 0, 0);
    const endsAt = new Date(startsAt.getTime() + editForm.duration * 60 * 1000);
    updateBooking.mutate({
      id: editBooking.id,
      data: {
        tableId: editForm.tableId || undefined,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
      },
    });
  };

  const handleUploadTablePhoto = async (file: File) => {
    if (!selectedTableId) return;
    setUploadingTable(true);
    try {
      await uploadsApi.uploadTablePhoto(selectedTableId, file);
      qc.invalidateQueries({ queryKey: ['halls'] });
    } catch (err: any) {
      alert(err.message || 'Ошибка загрузки');
    } finally {
      setUploadingTable(false);
    }
  };

  const handleDeleteTablePhoto = async (url: string) => {
    if (!selectedTableId || !confirm('Удалить фото?')) return;
    try {
      await uploadsApi.deleteTablePhoto(selectedTableId, url);
      qc.invalidateQueries({ queryKey: ['halls'] });
    } catch (err: any) {
      alert(err.message || 'Ошибка удаления');
    }
  };

  const handleCreateBooking = () => {
    if (!selectedTableId || !newBooking.date || !newBooking.time || !newBooking.guestName || !newBooking.guestPhone) return;
    const snappedTime = snapTo5(newBooking.time);
    const [h, m] = snappedTime.split(':').map(Number);
    const startsAt = new Date(newBooking.date);
    startsAt.setHours(h, m, 0, 0);
    const endsAt = new Date(startsAt.getTime() + 2 * 60 * 60 * 1000);
    createBooking.mutate({
      tableId: selectedTableId,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      guestName: newBooking.guestName,
      guestPhone: newBooking.guestPhone,
      guestCount: newBooking.guestCount,
      notes: newBooking.notes || undefined,
      consentGiven: true,
    });
  };

  // ─── Рендер ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Шапка */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-white flex-shrink-0">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Столы</h1>
          <p className="text-sm text-gray-500 mt-0.5">Расписание, брони и доступность</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setGroupModal(true)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            + Зал / Группа столов
          </button>
          <button
            onClick={() => setMassModal(true)}
            className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-700 text-sm font-medium rounded-lg border border-red-200 transition-colors"
          >
            🚫 Закрыть все столы
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">

        {/* ── Левая панель: залы + столы ── */}
        <div className="w-80 border-r border-gray-200 bg-white flex flex-col flex-shrink-0 overflow-hidden">
          {/* Вкладки залов */}
          {halls.length > 1 && (
            <div className="flex gap-1 p-3 border-b border-gray-100 flex-wrap">
              {(halls as any[]).map((hall) => (
                <button
                  key={hall.id}
                  onClick={() => { setSelectedHallId(hall.id); setSelectedTableId(null); }}
                  className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
                    (selectedHallId ?? halls[0]?.id) === hall.id
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {hall.name}
                </button>
              ))}
            </div>
          )}

          {/* Список столов */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {tables.length === 0 ? (
              <div className="text-center py-12 text-gray-400 text-sm">
                <p className="text-3xl mb-2">🪑</p>
                <p>Нарисуйте столы</p>
                <p>в редакторе зала</p>
              </div>
            ) : (
              tables.map((table: any) => {
                const isSelected = table.id === selectedTableId;
                const hasPeriod = (periodsData as any[]).some(
                  (p) => (p.tableId === table.id || p.tableId === null) && new Date(p.endsAt) > new Date(),
                );
                const isGuestLocked = !!guestLocks[table.id];
                return (
                  <button
                    key={table.id}
                    onClick={() => setSelectedTableId(table.id)}
                    className={`w-full text-left p-3 rounded-xl border transition-all ${
                      isSelected
                        ? 'border-blue-500 bg-blue-50 shadow-sm'
                        : isGuestLocked
                          ? 'border-amber-300 bg-amber-50 hover:bg-amber-100'
                          : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm ${
                          isSelected ? 'bg-blue-600 text-white' : isGuestLocked ? 'bg-amber-400 text-white' : 'bg-gray-100 text-gray-700'
                        }`}>
                          {table.label}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900">Стол {table.label}</p>
                          <p className="text-xs text-gray-500">
                            {table.minGuests}–{table.maxGuests} гостей
                            {table.comment ? ` · ${table.comment}` : ''}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        {hasPeriod && (
                          <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full">закрыт</span>
                        )}
                        {isGuestLocked && (
                          <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse inline-block" />
                            гость выбирает
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* ── Правая панель: детали стола ── */}
        {selectedTable ? (
          <div className="flex-1 overflow-y-auto bg-gray-50 p-6 space-y-6">

            {/* Заголовок */}
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Стол {selectedTable.label}</h2>
                <p className="text-sm text-gray-500 mt-0.5">
                  {selectedTable.shape === 'ROUND' ? 'Круглый' : selectedTable.shape === 'SQUARE' ? 'Квадратный' : 'Прямоугольный'}
                  {' · '}{selectedTable.minGuests}–{selectedTable.maxGuests} гостей
                  {selectedTable.comment ? ` · ${selectedTable.comment}` : ''}
                </p>
              </div>
              <button
                onClick={() => openBookingModal(selectedTable.id, bookingDate)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg"
              >
                + Добавить бронь
              </button>
            </div>

            {/* ── Фото стола ── */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <PhotoUploader
                photos={selectedTable.photos ?? []}
                maxPhotos={5}
                uploading={uploadingTable}
                onUpload={handleUploadTablePhoto}
                onDelete={handleDeleteTablePhoto}
                label="Фотографии стола (до 5 шт)"
              />
            </div>

            {/* ── Закрытые периоды ── */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-gray-900 text-sm">Расписание доступности</h3>
                <button
                  onClick={() => setShowPeriodForm(!showPeriodForm)}
                  className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                >
                  {showPeriodForm ? '✕ Отмена' : '+ Закрыть период'}
                </button>
              </div>

              {/* Форма добавления периода */}
              {showPeriodForm && (
                <div className="mb-4 p-4 bg-gray-50 rounded-xl border border-gray-200 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-gray-500 block mb-1">Начало</label>
                      <input
                        type="datetime-local"
                        value={periodForm.startsAt}
                        onChange={(e) => setPeriodForm({ ...periodForm, startsAt: e.target.value })}
                        className="input text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 block mb-1">Конец</label>
                      <input
                        type="datetime-local"
                        value={periodForm.endsAt}
                        onChange={(e) => setPeriodForm({ ...periodForm, endsAt: e.target.value })}
                        className="input text-sm"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Причина (необязательно)</label>
                    <input
                      type="text"
                      value={periodForm.reason}
                      onChange={(e) => setPeriodForm({ ...periodForm, reason: e.target.value })}
                      placeholder="Ремонт, мероприятие..."
                      className="input text-sm"
                    />
                  </div>
                  <button
                    onClick={() => handleAddPeriod(selectedTable.id)}
                    disabled={addPeriod.isPending}
                    className="w-full py-2 bg-red-600 hover:bg-red-700 text-white text-sm rounded-lg font-medium"
                  >
                    Закрыть стол на этот период
                  </button>
                </div>
              )}

              {/* Список периодов */}
              {tablePeriods.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">Нет закрытых периодов — стол доступен</p>
              ) : (
                <div className="space-y-2">
                  {tablePeriods.map((p: any) => (
                    <div key={p.id} className="flex items-center justify-between p-3 bg-red-50 border border-red-100 rounded-lg">
                      <div>
                        <p className="text-sm font-medium text-red-800">
                          {p.tableId === null ? '🚫 Весь ресторан' : `Стол ${selectedTable.label}`}
                        </p>
                        <p className="text-xs text-red-600">
                          {formatDate(p.startsAt)} {formatTime(p.startsAt)} — {formatDate(p.endsAt)} {formatTime(p.endsAt)}
                          {p.reason ? ` · ${p.reason}` : ''}
                        </p>
                      </div>
                      {p.tableId !== null && (
                        <button
                          onClick={() => deletePeriod.mutate(p.id)}
                          className="text-red-400 hover:text-red-600 text-sm ml-3"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── Брони на стол ── */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-gray-900 text-sm">Брони</h3>
                <input
                  type="date"
                  value={bookingDate}
                  onChange={(e) => setBookingDate(e.target.value)}
                  className="input text-sm py-1 w-auto"
                />
              </div>

              {tableBookings.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">Броней на эту дату нет</p>
              ) : (
                <div className="space-y-3">
                  {tableBookings.map((booking: any) => {
                    const status = booking.status as BookingStatus;
                    const nextStatuses = STATUS_FLOW[status] ?? [];
                    return (
                      <div key={booking.id} className="p-4 border border-gray-200 rounded-xl">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-medium text-gray-900 text-sm">
                                {formatTime(booking.startsAt)} — {formatTime(booking.endsAt)}
                              </p>
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${BOOKING_STATUS_COLORS[status] || 'bg-gray-100 text-gray-600'}`}>
                                {BOOKING_STATUS_LABELS[status] || status}
                              </span>
                            </div>
                            <p className="text-sm text-gray-700 mt-1">{booking.guestName}</p>
                            <p className="text-xs text-gray-500">{booking.guestPhone} · {booking.guestCount} гостей</p>
                            {booking.notes && <p className="text-xs text-gray-400 mt-0.5 italic">{booking.notes}</p>}
                          </div>
                        </div>

                        {/* Кнопки статусов + редактирование */}
                        <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-gray-100">
                          <button
                            onClick={() => openEditModal(booking)}
                            className="text-xs px-3 py-1.5 rounded-lg font-medium bg-gray-50 text-gray-700 hover:bg-gray-100 border border-gray-200 transition-colors"
                          >
                            ✏️ Изменить
                          </button>
                          {nextStatuses.map((nextStatus) => (
                            <button
                              key={nextStatus}
                              onClick={() => updateStatus.mutate({ id: booking.id, status: nextStatus })}
                              disabled={updateStatus.isPending}
                              className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                                nextStatus === 'CANCELLED' || nextStatus === 'NO_SHOW'
                                  ? 'bg-red-50 text-red-700 hover:bg-red-100 border border-red-200'
                                  : 'bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200'
                              }`}
                            >
                              → {BOOKING_STATUS_LABELS[nextStatus] || nextStatus}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center bg-gray-50">
            <div className="text-center">
              <div className="text-5xl mb-3">👈</div>
              <p className="text-gray-500 text-sm">Выберите стол слева</p>
            </div>
          </div>
        )}
      </div>

      <MassCloseModal open={massModal} onClose={() => setMassModal(false)} />
      <NewGroupBookingModal open={groupModal} onClose={() => setGroupModal(false)} />

      {/* ── Модал: редактировать бронь ── */}
      {editModal && editBooking && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-bold text-gray-900">Изменить бронь</h2>
                <p className="text-sm text-gray-500 mt-0.5">{editBooking.guestName} · {editBooking.guestPhone}</p>
              </div>
              <button onClick={() => setEditModal(false)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>

            {updateBooking.isError && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">
                {(updateBooking.error as any)?.message || 'Ошибка при обновлении'}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500 block mb-1">Дата</label>
                <input
                  type="date"
                  value={editForm.date}
                  onChange={(e) => setEditForm({ ...editForm, date: e.target.value })}
                  className="input text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Время начала</label>
                <input
                  type="time"
                  step="300"
                  value={editForm.time}
                  onChange={(e) => setEditForm({ ...editForm, time: e.target.value })}
                  onBlur={(e) => setEditForm({ ...editForm, time: snapTo5(e.target.value) })}
                  className="input text-sm"
                />
              </div>
            </div>

            <div>
              <label className="text-xs text-gray-500 block mb-1">Длительность</label>
              <select
                value={editForm.duration}
                onChange={(e) => setEditForm({ ...editForm, duration: Number(e.target.value) })}
                className="input text-sm"
              >
                {[60, 90, 120, 150, 180, 240].map((d) => (
                  <option key={d} value={d}>{d / 60 >= 1 ? `${d / 60} ч` : ''}{d % 60 ? ` ${d % 60} мин` : ''}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs text-gray-500 block mb-1">Стол</label>
              <select
                value={editForm.tableId}
                onChange={(e) => setEditForm({ ...editForm, tableId: e.target.value })}
                className="input text-sm"
              >
                {tables.map((t: any) => (
                  <option key={t.id} value={t.id}>Стол {t.label} ({t.minGuests}–{t.maxGuests} гостей)</option>
                ))}
              </select>
            </div>

            <div className="flex gap-3 pt-1">
              <button onClick={() => setEditModal(false)} className="flex-1 py-2.5 border border-gray-300 rounded-xl text-sm text-gray-700 hover:bg-gray-50">
                Отмена
              </button>
              <button
                onClick={handleUpdateBooking}
                disabled={updateBooking.isPending || !editForm.date || !editForm.time}
                className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-xl disabled:opacity-50"
              >
                {updateBooking.isPending ? 'Сохраняем...' : 'Сохранить'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Модал: добавить бронь вручную ── */}
      {bookingModal && selectedTable && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-gray-900">Добавить бронь — Стол {selectedTable.label}</h2>
              <button onClick={closeBookingModal} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>

            {createBooking.isError && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">
                {(createBooking.error as any)?.message || 'Ошибка при создании брони'}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500 block mb-1">Дата</label>
                <input type="date" value={newBooking.date} onChange={(e) => setNewBooking({ ...newBooking, date: e.target.value })} className="input text-sm" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Время начала</label>
                <input type="time" step="300" value={newBooking.time} onChange={(e) => setNewBooking({ ...newBooking, time: e.target.value })} className="input text-sm" />
              </div>
            </div>

            <div>
              <label className="text-xs text-gray-500 block mb-1">Имя гостя</label>
              <input type="text" value={newBooking.guestName} onChange={(e) => setNewBooking({ ...newBooking, guestName: e.target.value })} placeholder="Иван Петров" className="input text-sm" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500 block mb-1">Телефон</label>
                <input type="tel" value={newBooking.guestPhone} onChange={(e) => setNewBooking({ ...newBooking, guestPhone: e.target.value })} placeholder="+79001234567" className="input text-sm" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Кол-во гостей</label>
                <input type="number" min={1} max={50} value={newBooking.guestCount} onChange={(e) => setNewBooking({ ...newBooking, guestCount: Number(e.target.value) })} className="input text-sm" />
              </div>
            </div>

            <div>
              <label className="text-xs text-gray-500 block mb-1">Примечания</label>
              <input type="text" value={newBooking.notes} onChange={(e) => setNewBooking({ ...newBooking, notes: e.target.value })} placeholder="Пожелания..." className="input text-sm" />
            </div>

            <p className="text-xs text-gray-400">Длительность брони: 2 часа. Бронь будет создана со статусом «Подтверждена».</p>

            <div className="flex gap-3">
              <button onClick={closeBookingModal} className="flex-1 py-2.5 border border-gray-300 rounded-xl text-sm text-gray-700 hover:bg-gray-50">Отмена</button>
              <button
                onClick={handleCreateBooking}
                disabled={createBooking.isPending || !newBooking.date || !newBooking.time || !newBooking.guestName}
                className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-xl disabled:opacity-50"
              >
                {createBooking.isPending ? 'Создаём...' : 'Создать бронь'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
