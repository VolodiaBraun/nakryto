'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { publicApi } from '@/lib/api';
import dynamic from 'next/dynamic';
import type { Restaurant, Hall } from '@/types';
import { TABLE_TAGS } from '@/lib/tableTags';
import { useBookingSocket } from '@/hooks/useBookingSocket';
import { v4 as uuidv4 } from 'uuid';
import PhotoGallery from '@/components/PhotoGallery';
import MiniGallery from '@/components/MiniGallery';

const BookingMap = dynamic(() => import('@/components/booking-map/BookingMap'), { ssr: false });

// ─── Утилиты дат ──────────────────────────────────────────────────────────────

function getTodayStr() {
  return new Date().toISOString().split('T')[0];
}

function makeDateList(maxDays: number): string[] {
  const list: string[] = [];
  const today = new Date();
  for (let i = 0; i < maxDays; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    list.push(d.toISOString().split('T')[0]);
  }
  return list;
}

function labelDay(dateStr: string): string {
  const today = getTodayStr();
  const tomorrow = (() => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().split('T')[0]; })();
  if (dateStr === today) return 'Сегодня';
  if (dateStr === tomorrow) return 'Завтра';
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

function labelWeekday(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('ru-RU', { weekday: 'short' });
}

function formatHHMM(isoOrHHMM: string): string {
  if (isoOrHHMM.includes('T')) {
    const d = new Date(isoOrHHMM);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
  return isoOrHHMM;
}

function formatDateFull(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('ru-RU', {
    weekday: 'long', day: 'numeric', month: 'long',
  });
}

// ─── Страница брони ────────────────────────────────────────────────────────────

export default function BookPage({ params }: { params: { slug: string } }) {
  const { slug } = params;

  // Шаги: 0 = карта, 1 = форма гостя, 2 = успех
  const [step, setStep] = useState(0);
  const [selectedDate, setSelectedDate] = useState(getTodayStr());
  const [guestCount, setGuestCount] = useState(2);
  const [selectedHallIndex, setSelectedHallIndex] = useState(0);
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [guestForm, setGuestForm] = useState({ name: '', phone: '+7', email: '', notes: '', consent: false });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [booking, setBooking] = useState<any>(null);

  const [lockExpiresAt, setLockExpiresAt] = useState<Date | null>(null);
  const [lockTimeLeft, setLockTimeLeft]   = useState(0);
  const [lockError, setLockError]         = useState('');

  // Галереи: miniGallery — попап с сеткой, lightbox — полноэкранный просмотр
  const [miniGallery, setMiniGallery] = useState<{ photos: string[]; title: string } | null>(null);
  const [lightbox, setLightbox] = useState<{ photos: string[]; title: string; index: number } | null>(null);

  const dateScrollRef   = useRef<HTMLDivElement>(null);
  const queryClient     = useQueryClient();
  // Храним lockId в sessionStorage чтобы пережить перезагрузку страницы
  const lockIdRef = useRef<string>((() => {
    if (typeof window === 'undefined') return uuidv4();
    const stored = sessionStorage.getItem('nakryto_lock_id');
    if (stored) return stored;
    const id = uuidv4();
    sessionStorage.setItem('nakryto_lock_id', id);
    return id;
  })());
  const selectedDateRef = useRef(getTodayStr());
  const selectedTableRef = useRef<string | null>(null);

  useEffect(() => { selectedDateRef.current  = selectedDate; },  [selectedDate]);
  useEffect(() => { selectedTableRef.current = selectedTableId; }, [selectedTableId]);

  // ─── WebSocket real-time ─────────────────────────────────────────────────────

  const handleStatusChange = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['tableStatuses', slug, selectedDate] });
  }, [queryClient, slug, selectedDate]);

  const { connected } = useBookingSocket(slug, selectedDate, {
    onBookingCreated:   handleStatusChange,
    onBookingCancelled: handleStatusChange,
    onTableLocked:      handleStatusChange,
    onTableUnlocked:    handleStatusChange,
  });

  // ─── Обратный отсчёт блокировки ─────────────────────────────────────────────

  useEffect(() => {
    if (!lockExpiresAt) { setLockTimeLeft(0); return; }
    const tick = () => {
      const left = Math.max(0, Math.floor((lockExpiresAt.getTime() - Date.now()) / 1000));
      setLockTimeLeft(left);
      if (left === 0) {
        // Время истекло — снимаем выбор
        setSelectedTableId(null);
        setSelectedTime(null);
        setLockExpiresAt(null);
        queryClient.invalidateQueries({ queryKey: ['tableStatuses', slug, selectedDate] });
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [lockExpiresAt, queryClient, slug, selectedDate]);

  // ─── Снять блокировку при размонтировании ───────────────────────────────────

  useEffect(() => {
    return () => {
      const tId = selectedTableRef.current;
      const d   = selectedDateRef.current;
      if (tId) {
        // keepalive — переживёт размонтирование компонента
        fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/public/${slug}/tables/${tId}/lock?date=${d}&lockId=${lockIdRef.current}`, {
          method: 'DELETE', keepalive: true,
        }).catch(() => {});
      }
    };
  }, [slug]);

  // ─── Данные ─────────────────────────────────────────────────────────────────

  const { data: restaurant, isLoading, error: restaurantError } = useQuery<Restaurant>({
    queryKey: ['public', slug],
    queryFn: () => publicApi.getRestaurant(slug) as any,
  });

  const { data: halls = [] } = useQuery<Hall[]>({
    queryKey: ['public', slug, 'halls'],
    queryFn: () => publicApi.getHalls(slug) as any,
    enabled: !!restaurant,
  });

  const { data: statusesRaw } = useQuery<any[]>({
    queryKey: ['tableStatuses', slug, selectedDate],
    queryFn: () => publicApi.getTableStatuses(slug, selectedDate) as any,
    enabled: !!restaurant,
    staleTime: 0,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

  // Слоты доступности — грузим когда выбран стол
  const { data: availabilityData } = useQuery<any>({
    queryKey: ['availability', slug, selectedDate, guestCount],
    queryFn: () => publicApi.getAvailability(slug, selectedDate, guestCount),
    enabled: !!selectedTableId,
  });

  // ─── Производные данные ──────────────────────────────────────────────────────

  const settings: any = (restaurant?.settings as any) || {};
  const maxBookingDays: number = settings.maxBookingDays || 30;
  const dateList = makeDateList(maxBookingDays);

  const tableStatuses: Record<string, 'FREE' | 'BOOKED' | 'LOCKED'> = {};
  const tableFreeUntil: Record<string, string | null> = {};
  for (const t of (statusesRaw ?? [])) {
    tableStatuses[t.id] = t.status;
    tableFreeUntil[t.id] = t.freeUntil ?? null;
  }

  const currentHall = (halls as any[])[selectedHallIndex];
  const selectedTable = (currentHall as any)?.tables?.find((t: any) => t.id === selectedTableId);
  // Берём теги из floorPlan (источник правды)
  const selectedTableObj = (currentHall?.floorPlan?.objects ?? []).find(
    (o: any) => o.type === 'table' && o.id === selectedTableId,
  );
  const selectedTableTags: string[] = selectedTableObj?.tags ?? [];
  const selectedFreeUntil = selectedTableId ? (tableFreeUntil[selectedTableId] ?? null) : null;

  // Слоты для выбранного стола
  const now = new Date();
  const isToday = selectedDate === getTodayStr();
  const availableSlots: any[] = (availabilityData?.slots ?? []).filter((slot: any) => {
    if (!slot.available) return false;
    // Для сегодня: только будущие слоты
    if (isToday) {
      const [h, m] = slot.time.split(':').map(Number);
      const slotDate = new Date(selectedDate + 'T00:00:00');
      slotDate.setHours(h, m, 0, 0);
      if (slotDate <= now) return false;
    }
    // Убираем слоты после cutoff (freeUntil)
    if (selectedFreeUntil) {
      const cutoff = new Date(selectedFreeUntil);
      const [h, m] = slot.time.split(':').map(Number);
      const slotDate = new Date(selectedDate + 'T00:00:00');
      slotDate.setHours(h, m, 0, 0);
      if (slotDate >= cutoff) return false;
    }
    return true;
  });

  // ─── Обработчики ────────────────────────────────────────────────────────────

  const doUnlock = useCallback((tableId: string, date: string) => {
    publicApi.unlockTable(slug, tableId, date, lockIdRef.current).catch(() => {});
  }, [slug]);

  const handleDateChange = (date: string) => {
    if (selectedTableId) doUnlock(selectedTableId, selectedDate);
    setSelectedDate(date);
    setSelectedTableId(null);
    setSelectedTime(null);
    setLockExpiresAt(null);
  };

  const handleTableSelect = useCallback(async (tableId: string) => {
    const date = selectedDateRef.current;
    const prevTableId = selectedTableRef.current;
    // Снять предыдущую блокировку
    if (prevTableId && prevTableId !== tableId) {
      doUnlock(prevTableId, date);
    }
    setLockError('');
    try {
      const result: any = await publicApi.lockTable(slug, tableId, date, lockIdRef.current);
      setSelectedTableId(tableId);
      setSelectedTime(null);
      setLockExpiresAt(new Date(result.expiresAt));
    } catch (err: any) {
      // Стол заняли между кликом и запросом
      queryClient.invalidateQueries({ queryKey: ['tableStatuses', slug, date] });
      setLockError(err?.message || 'Стол уже выбирается другим гостем');
      setTimeout(() => setLockError(''), 3000);
    }
  }, [slug, queryClient, doUnlock]);

  const handleTableDeselect = () => {
    if (selectedTableId) doUnlock(selectedTableId, selectedDate);
    setSelectedTableId(null);
    setSelectedTime(null);
    setLockExpiresAt(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!guestForm.consent) { setFormError('Необходимо согласие на обработку персональных данных'); return; }
    if (!selectedTime) { setFormError('Выберите время'); return; }
    setFormError('');
    setSubmitting(true);

    const [h, m] = selectedTime.split(':').map(Number);
    const startsAt = new Date(selectedDate + 'T00:00:00');
    startsAt.setHours(h, m, 0, 0);
    const endsAt = new Date(startsAt.getTime() + 2 * 60 * 60 * 1000);

    try {
      const result: any = await publicApi.createBooking(slug, {
        tableId: selectedTableId,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        guestCount,
        guestName: guestForm.name,
        guestPhone: guestForm.phone,
        guestEmail: guestForm.email || undefined,
        notes: guestForm.notes || undefined,
        consentGiven: guestForm.consent,
      });
      setBooking(result.data || result);
      setStep(2);
    } catch (err: any) {
      setFormError(err.message || 'Ошибка при создании брони');
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Загрузка / ошибка ──────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (restaurantError || !restaurant) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="text-5xl mb-4">😕</div>
          <h1 className="text-xl font-semibold text-gray-900 mb-2">Ресторан не найден</h1>
          <p className="text-gray-500">Проверьте правильность ссылки</p>
        </div>
      </div>
    );
  }

  // ─── Лимит броней исчерпан ───────────────────────────────────────────────────

  if (restaurant.bookingLimitExceeded) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <header className="bg-white border-b border-gray-200 sticky top-0 z-30 shadow-sm">
          <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
            {restaurant.logoUrl && (
              <img src={restaurant.logoUrl} alt={restaurant.name} className="w-9 h-9 rounded-full object-cover" />
            )}
            <div>
              <h1 className="text-base font-semibold text-gray-900">{restaurant.name}</h1>
              {restaurant.address && <p className="text-xs text-gray-500">{restaurant.address}</p>}
            </div>
          </div>
        </header>
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="text-center max-w-sm">
            <div className="text-5xl mb-4">🚫</div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Онлайн-бронирование недоступно</h2>
            <p className="text-gray-500">
              Ресторан временно приостановил онлайн-бронирование. Позвоните нам, чтобы забронировать столик.
            </p>
            {restaurant.phone && (
              <a
                href={`tel:${restaurant.phone}`}
                className="mt-4 inline-block bg-blue-600 text-white px-6 py-3 rounded-xl font-medium hover:bg-blue-700 transition-colors"
              >
                {restaurant.phone}
              </a>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ─── Рендер ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">

      {/* ── Шапка ── */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-30 shadow-sm">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          {restaurant.logoUrl && (
            <img src={restaurant.logoUrl} alt={restaurant.name} className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <h1 className="font-bold text-gray-900 truncate text-base">{restaurant.name}</h1>
            {step === 0 && restaurant.address && (
              <p className="text-xs text-gray-400 truncate">{restaurant.address}</p>
            )}
            {step === 1 && (
              <p className="text-xs text-gray-500">
                {formatDateFull(selectedDate)}, {selectedTime} · стол {selectedTable?.label} · {guestCount} гостей
              </p>
            )}
          </div>

          {/* Кнопка фото зала */}
          {step === 0 && (currentHall?.photos?.length ?? 0) > 0 && (
            <button
              onClick={() => setMiniGallery({ photos: currentHall.photos, title: currentHall.name ?? 'Фото зала' })}
              className="flex-shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-medium transition-colors"
            >
              📷 Фото зала
            </button>
          )}

          {/* Live-индикатор */}
          <div className="flex-shrink-0 flex items-center gap-1" title={connected ? 'Обновления в реальном времени' : 'Нет соединения'}>
            <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-green-500 animate-pulse' : 'bg-gray-300'}`} />
            {connected && <span className="text-xs text-green-600 hidden sm:inline">live</span>}
          </div>

          {/* Счётчик гостей — только на шаге карты */}
          {step === 0 && (
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <button
                onClick={() => setGuestCount(Math.max(1, guestCount - 1))}
                className="w-8 h-8 rounded-full border border-gray-300 flex items-center justify-center hover:bg-gray-50 text-gray-600"
              >
                −
              </button>
              <span className="text-sm font-semibold w-10 text-center text-gray-800">{guestCount} гос.</span>
              <button
                onClick={() => setGuestCount(Math.min(20, guestCount + 1))}
                className="w-8 h-8 rounded-full border border-gray-300 flex items-center justify-center hover:bg-gray-50 text-gray-600"
              >
                +
              </button>
            </div>
          )}

          {/* Кнопка "Назад" на шаге формы */}
          {step === 1 && (
            <button onClick={() => setStep(0)} className="text-sm text-gray-500 hover:text-gray-700 flex-shrink-0">
              ← Назад
            </button>
          )}
        </div>

        {/* Переключатель дат */}
        {step === 0 && (
          <div
            ref={dateScrollRef}
            className="flex overflow-x-auto gap-2 px-4 pb-3 scrollbar-hide"
            style={{ scrollbarWidth: 'none' }}
          >
            {dateList.map((date) => {
              const isActive = date === selectedDate;
              return (
                <button
                  key={date}
                  onClick={() => handleDateChange(date)}
                  className={`flex-shrink-0 flex flex-col items-center px-3.5 py-2 rounded-xl text-sm transition-all ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  <span className="font-semibold text-xs leading-none mb-0.5">
                    {labelDay(date)}
                  </span>
                  <span className={`text-xs leading-none ${isActive ? 'text-blue-200' : 'text-gray-400'}`}>
                    {labelWeekday(date)}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </header>

      {/* ── Шаг 0: Карта ── */}
      {step === 0 && (
        <>
          {/* Вкладки залов */}
          {(halls as any[]).length > 1 && (
            <div className="max-w-3xl mx-auto w-full px-4 pt-3 flex gap-2">
              {(halls as any[]).map((hall, i) => (
                <button
                  key={hall.id}
                  onClick={() => { if (selectedTableId) doUnlock(selectedTableId, selectedDate); setSelectedHallIndex(i); setSelectedTableId(null); setLockExpiresAt(null); }}
                  className={`px-4 py-1.5 rounded-lg text-sm transition-colors ${
                    i === selectedHallIndex
                      ? 'bg-blue-600 text-white'
                      : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {hall.name}
                </button>
              ))}
            </div>
          )}

          {/* Карта */}
          <div className={`max-w-3xl mx-auto w-full px-4 py-3 ${selectedTableId ? 'pb-40' : 'pb-4'}`}>
            {currentHall ? (
              <BookingMap
                hall={currentHall}
                tableStatuses={tableStatuses}
                tableFreeUntil={tableFreeUntil}
                selectedTableId={selectedTableId}
                guestCount={guestCount}
                onTableSelect={handleTableSelect}
              />
            ) : (
              <div className="flex items-center justify-center h-64 bg-white rounded-xl">
                <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </div>

          {/* ── Панель выбранного стола (sticky снизу) ── */}
          {selectedTableId && (
            <div className="fixed bottom-0 left-0 right-0 z-20 bg-white border-t border-gray-200 shadow-2xl">
              <div className="max-w-3xl mx-auto px-4 pt-3 pb-5">
                {/* Заголовок панели */}
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-gray-900">
                        Стол {selectedTable?.label ?? '—'}
                        {selectedTable && (
                          <span className="text-sm font-normal text-gray-500 ml-2">
                            {selectedTable.minGuests}–{selectedTable.maxGuests} гостей
                            {selectedTable.comment ? ` · ${selectedTable.comment}` : ''}
                          </span>
                        )}
                      </p>
                      {(selectedTable?.photos?.length ?? 0) > 0 && (
                        <button
                          onClick={() => setMiniGallery({
                            photos: selectedTable!.photos!,
                            title: `Стол ${selectedTable?.label ?? ''}`,
                          })}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-medium bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"
                        >
                          📷 Фото стола
                        </button>
                      )}
                    </div>
                    {selectedTableTags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {selectedTableTags.map((tagId) => {
                          const tag = TABLE_TAGS.find((t) => t.id === tagId);
                          if (!tag) return null;
                          return (
                            <span key={tagId} className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-600">
                              {tag.icon} {tag.label}
                            </span>
                          );
                        })}
                      </div>
                    )}
                    {lockTimeLeft > 0 && (
                      <p className="text-xs text-blue-600 mt-0.5 flex items-center gap-1">
                        <span>🔒</span>
                        Зарезервирован за вами: {Math.floor(lockTimeLeft / 60)}:{String(lockTimeLeft % 60).padStart(2, '0')}
                      </p>
                    )}
                    {selectedFreeUntil && (
                      <p className="text-xs text-amber-600 mt-0.5 flex items-center gap-1">
                        <span>⏱</span>
                        Свободен до {formatHHMM(selectedFreeUntil)}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={handleTableDeselect}
                    className="text-gray-400 hover:text-gray-600 p-1 -mt-1"
                  >
                    ✕
                  </button>
                </div>

                {/* Слоты времени */}
                {availableSlots.length > 0 ? (
                  <div className="mb-3">
                    <p className="text-xs text-gray-500 mb-2">Выберите время начала</p>
                    <div className="flex flex-wrap gap-2">
                      {availableSlots.map((slot: any) => (
                        <button
                          key={slot.time}
                          onClick={() => setSelectedTime(slot.time)}
                          className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                            selectedTime === slot.time
                              ? 'bg-blue-600 text-white border-blue-600'
                              : 'border-gray-200 hover:border-blue-400 hover:bg-blue-50 text-gray-700'
                          }`}
                        >
                          {slot.time}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : availabilityData ? (
                  <p className="text-sm text-gray-400 mb-3">Нет доступных слотов на эту дату</p>
                ) : (
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                    <span className="text-sm text-gray-400">Загружаем доступное время...</span>
                  </div>
                )}

                <button
                  disabled={!selectedTime}
                  onClick={() => setStep(1)}
                  className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-colors"
                >
                  Далее — ввести данные →
                </button>
              </div>
            </div>
          )}

          {/* Подсказка если нет стола */}
          {!selectedTableId && !lockError && (
            <p className="text-center text-gray-400 text-sm pb-6">
              Нажмите на свободный стол чтобы забронировать
            </p>
          )}

          {/* Ошибка блокировки */}
          {lockError && (
            <p className="text-center text-amber-600 text-sm pb-6 font-medium">
              ⚠️ {lockError}
            </p>
          )}
        </>
      )}

      {/* ── Шаг 1: Форма гостя ── */}
      {step === 1 && (
        <div className="max-w-2xl mx-auto w-full px-4 py-6">
          <form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4">
            {formError && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{formError}</div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Имя <span className="text-red-500">*</span>
              </label>
              <input
                required
                value={guestForm.name}
                onChange={(e) => setGuestForm({ ...guestForm, name: e.target.value })}
                placeholder="Иван Петров"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Телефон <span className="text-red-500">*</span>
              </label>
              <input
                required
                type="tel"
                value={guestForm.phone}
                onChange={(e) => setGuestForm({ ...guestForm, phone: e.target.value })}
                placeholder="+79001234567"
                pattern="\+7\d{10}"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-400 mt-1">Формат: +7XXXXXXXXXX</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email
              </label>
              <input
                type="email"
                value={guestForm.email}
                onChange={(e) => setGuestForm({ ...guestForm, email: e.target.value })}
                placeholder="ivan@example.com (рекомендуется)"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-400 mt-1">Для получения уведомления о брони на email</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Пожелания (необязательно)</label>
              <textarea
                value={guestForm.notes}
                onChange={(e) => setGuestForm({ ...guestForm, notes: e.target.value })}
                placeholder="У окна, детский стул..."
                rows={2}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </div>

            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                required
                checked={guestForm.consent}
                onChange={(e) => setGuestForm({ ...guestForm, consent: e.target.checked })}
                className="mt-0.5 w-4 h-4 accent-blue-600 flex-shrink-0"
              />
              <span className="text-sm text-gray-600">
                Согласен(а) на{' '}
                <a href="/personal-data" target="_blank" className="text-blue-600 underline">обработку персональных данных</a>{' '}
                в соответствии с ФЗ № 152-ФЗ <span className="text-red-500">*</span>
              </span>
            </label>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-colors disabled:opacity-50"
            >
              {submitting ? 'Бронируем...' : 'Подтвердить бронь'}
            </button>
          </form>
        </div>
      )}

      {/* ── Шаг 2: Успех ── */}
      {step === 2 && booking && (
        <div className="max-w-2xl mx-auto w-full px-4 py-12 text-center">
          <div className={`w-20 h-20 ${booking.status === 'CONFIRMED' ? 'bg-green-100' : 'bg-amber-100'} rounded-full flex items-center justify-center mx-auto mb-6 text-4xl`}>
            {booking.status === 'CONFIRMED' ? '✅' : '🕐'}
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            {booking.status === 'CONFIRMED' ? 'Бронь подтверждена!' : 'Заявка принята!'}
          </h2>
          <p className="text-gray-500 mb-2">
            {booking.status === 'CONFIRMED'
              ? 'Ваш столик забронирован, ждём вас!'
              : 'Ресторан подтвердит бронь в ближайшее время'}
          </p>
          {booking.guestEmail && (
            <p className="text-sm text-gray-400 mb-8">Письмо с деталями отправлено на {booking.guestEmail}</p>
          )}

          <div className="bg-white border border-gray-200 rounded-2xl p-6 text-left max-w-sm mx-auto mb-6 space-y-3">
            <Row label="Ресторан" value={restaurant.name} />
            <Row label="Дата" value={formatDateFull(selectedDate)} />
            <Row label="Время" value={selectedTime ?? '—'} />
            <Row label="Стол" value={selectedTable?.label ?? (booking.table?.label ?? '—')} />
            <Row label="Гостей" value={String(guestCount)} />
            <Row label="Имя" value={guestForm.name} />
          </div>

          <a href={`/booking/${booking.token}`} className="text-blue-600 hover:underline text-sm block mb-4">
            Просмотреть или отменить бронь →
          </a>

          <button
            onClick={() => {
              setStep(0);
              setSelectedTableId(null);
              setSelectedTime(null);
              setBooking(null);
              setGuestForm({ name: '', phone: '+7', email: '', notes: '', consent: false });
            }}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            Сделать ещё одну бронь
          </button>
        </div>
      )}

      {/* Попап-миниатюры */}
      {miniGallery && (
        <MiniGallery
          photos={miniGallery.photos}
          title={miniGallery.title}
          onClose={() => setMiniGallery(null)}
          onOpenPhoto={(i) => setLightbox({ photos: miniGallery.photos, title: miniGallery.title, index: i })}
        />
      )}

      {/* Полноэкранный просмотр */}
      {lightbox && (
        <PhotoGallery
          photos={lightbox.photos}
          title={lightbox.title}
          initialIndex={lightbox.index}
          onClose={() => setLightbox(null)}
        />
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-500 text-sm">{label}</span>
      <span className="font-medium text-gray-900 text-sm">{value}</span>
    </div>
  );
}
