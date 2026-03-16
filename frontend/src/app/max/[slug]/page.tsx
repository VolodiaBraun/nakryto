'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { publicApi } from '@/lib/api';
import dynamic from 'next/dynamic';
import type { Restaurant, Hall } from '@/types';
import { TABLE_TAGS } from '@/lib/tableTags';
import { useBookingSocket } from '@/hooks/useBookingSocket';
import { useMaxWebApp } from '@/hooks/useMaxWebApp';
import { v4 as uuidv4 } from 'uuid';

const BookingMap = dynamic(() => import('@/components/booking-map/BookingMap'), { ssr: false });

// ─── Utils ────────────────────────────────────────────────────────────────────

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

// ─── MAX Mini App Page ────────────────────────────────────────────────────────

export default function MaxPage({ params }: { params: { slug: string } }) {
  const { slug } = params;
  const { mwa, isMwa } = useMaxWebApp();

  const [step, setStep] = useState(0);
  const [selectedDate, setSelectedDate] = useState(getTodayStr());
  const [guestCount, setGuestCount] = useState(2);
  const [selectedHallIndex, setSelectedHallIndex] = useState(0);
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [booking, setBooking] = useState<any>(null);
  const [lockExpiresAt, setLockExpiresAt] = useState<Date | null>(null);
  const [lockTimeLeft, setLockTimeLeft] = useState(0);
  const [lockError, setLockError] = useState('');

  // Pre-fill from MAX user
  const maxUser = mwa?.initDataUnsafe?.user;
  const [guestForm, setGuestForm] = useState({
    name: '',
    phone: '+7',
    email: '',
    notes: '',
    consent: false,
  });

  useEffect(() => {
    if (maxUser && !guestForm.name) {
      const fullName = [maxUser.first_name, maxUser.last_name].filter(Boolean).join(' ');
      setGuestForm((f) => ({ ...f, name: fullName }));
    }
  }, [maxUser]);

  // BackButton management
  useEffect(() => {
    if (!mwa) return;
    if (step === 0) {
      mwa.BackButton.hide();
    } else {
      mwa.BackButton.show();
      const goBack = () => {
        if (step === 1) setStep(0);
        else if (step === 2) mwa.close?.();
      };
      mwa.BackButton.onClick(goBack);
      return () => mwa.BackButton.offClick(goBack);
    }
  }, [mwa, step]);

  const dateScrollRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const lockIdRef = useRef<string>((() => {
    if (typeof window === 'undefined') return uuidv4();
    const stored = sessionStorage.getItem('nakryto_max_lock_id');
    if (stored) return stored;
    const id = uuidv4();
    sessionStorage.setItem('nakryto_max_lock_id', id);
    return id;
  })());

  const selectedDateRef = useRef(getTodayStr());
  const selectedTableRef = useRef<string | null>(null);
  useEffect(() => { selectedDateRef.current = selectedDate; }, [selectedDate]);
  useEffect(() => { selectedTableRef.current = selectedTableId; }, [selectedTableId]);

  // WebSocket
  const handleStatusChange = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['tableStatuses', slug, selectedDate] });
  }, [queryClient, slug, selectedDate]);

  const { connected } = useBookingSocket(slug, selectedDate, {
    onBookingCreated: handleStatusChange,
    onBookingCancelled: handleStatusChange,
    onTableLocked: handleStatusChange,
    onTableUnlocked: handleStatusChange,
  });

  // Lock countdown
  useEffect(() => {
    if (!lockExpiresAt) { setLockTimeLeft(0); return; }
    const tick = () => {
      const left = Math.max(0, Math.floor((lockExpiresAt.getTime() - Date.now()) / 1000));
      setLockTimeLeft(left);
      if (left === 0) {
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

  // Unlock on unmount
  useEffect(() => {
    return () => {
      const tId = selectedTableRef.current;
      const d = selectedDateRef.current;
      if (tId) {
        fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/public/${slug}/tables/${tId}/lock?date=${d}&lockId=${lockIdRef.current}`, {
          method: 'DELETE', keepalive: true,
        }).catch(() => {});
      }
    };
  }, [slug]);

  // Data
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
  });

  const { data: availabilityData } = useQuery<any>({
    queryKey: ['availability', slug, selectedDate, guestCount],
    queryFn: () => publicApi.getAvailability(slug, selectedDate, guestCount),
    enabled: !!selectedTableId,
  });

  // Derived
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
  const selectedTableObj = (currentHall?.floorPlan?.objects ?? []).find(
    (o: any) => o.type === 'table' && o.id === selectedTableId,
  );
  const selectedTableTags: string[] = selectedTableObj?.tags ?? [];
  const selectedFreeUntil = selectedTableId ? (tableFreeUntil[selectedTableId] ?? null) : null;

  const now = new Date();
  const isToday = selectedDate === getTodayStr();
  const availableSlots: any[] = (availabilityData?.slots ?? []).filter((slot: any) => {
    if (!slot.available) return false;
    if (isToday) {
      const [h, m] = slot.time.split(':').map(Number);
      const slotDate = new Date(selectedDate + 'T00:00:00');
      slotDate.setHours(h, m, 0, 0);
      if (slotDate <= now) return false;
    }
    if (selectedFreeUntil) {
      const cutoff = new Date(selectedFreeUntil);
      const [h, m] = slot.time.split(':').map(Number);
      const slotDate = new Date(selectedDate + 'T00:00:00');
      slotDate.setHours(h, m, 0, 0);
      if (slotDate >= cutoff) return false;
    }
    return true;
  });

  // Handlers
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

  const handleTableSelect = async (tableId: string) => {
    if (selectedTableId && selectedTableId !== tableId) doUnlock(selectedTableId, selectedDate);
    setLockError('');
    try {
      const result: any = await publicApi.lockTable(slug, tableId, selectedDate, lockIdRef.current);
      setSelectedTableId(tableId);
      setSelectedTime(null);
      setLockExpiresAt(new Date(result.expiresAt));
    } catch (err: any) {
      queryClient.invalidateQueries({ queryKey: ['tableStatuses', slug, selectedDate] });
      setLockError(err?.message || 'Стол уже выбирается другим гостем');
      setTimeout(() => setLockError(''), 3000);
    }
  };

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
        maxUserId: maxUser ? String(maxUser.id) : undefined,
      });
      setBooking(result.data || result);
      setStep(2);
    } catch (err: any) {
      setFormError(err.message || 'Ошибка при создании брони');
    } finally {
      setSubmitting(false);
    }
  };

  // Loading / error
  if (isLoading) {
    return (
      <div className="twa-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[var(--tg-btn,#2563eb)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (restaurantError || !restaurant) {
    return (
      <div className="twa-screen flex items-center justify-center px-6 text-center">
        <div>
          <div className="text-5xl mb-4">😕</div>
          <h1 className="text-xl font-semibold mb-2" style={{ color: 'var(--tg-text, #111)' }}>Ресторан не найден</h1>
          <p style={{ color: 'var(--tg-hint, #888)' }}>Проверьте правильность ссылки</p>
        </div>
      </div>
    );
  }

  return (
    <div className="twa-screen flex flex-col" style={{ background: 'var(--tg-bg, #f9fafb)', color: 'var(--tg-text, #111)' }}>

      {/* Header */}
      <header className="twa-header sticky top-0 z-30 px-4 py-3 flex items-center gap-3"
        style={{ background: 'var(--tg-bg, #fff)', borderBottom: '1px solid var(--tg-hint, #e5e7eb)33' }}>
        {restaurant.logoUrl && (
          <img src={restaurant.logoUrl} alt={restaurant.name} className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <h1 className="font-bold truncate text-sm" style={{ color: 'var(--tg-text, #111)' }}>{restaurant.name}</h1>
          {step === 1 && (
            <p className="text-xs truncate" style={{ color: 'var(--tg-hint, #888)' }}>
              {formatDateFull(selectedDate)}, {selectedTime} · стол {selectedTable?.label} · {guestCount} гостей
            </p>
          )}
        </div>

        {/* Live indicator */}
        <div className="flex-shrink-0 flex items-center gap-1">
          <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-green-500 animate-pulse' : 'bg-gray-300'}`} />
        </div>

        {step === 0 && (
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={() => setGuestCount(Math.max(1, guestCount - 1))}
              className="w-7 h-7 rounded-full border flex items-center justify-center text-sm"
              style={{ borderColor: 'var(--tg-hint, #ccc)', color: 'var(--tg-text, #111)' }}
            >−</button>
            <span className="text-xs font-semibold w-8 text-center" style={{ color: 'var(--tg-text, #111)' }}>{guestCount} гос.</span>
            <button
              onClick={() => setGuestCount(Math.min(20, guestCount + 1))}
              className="w-7 h-7 rounded-full border flex items-center justify-center text-sm"
              style={{ borderColor: 'var(--tg-hint, #ccc)', color: 'var(--tg-text, #111)' }}
            >+</button>
          </div>
        )}

        {step === 1 && !isMwa && (
          <button onClick={() => setStep(0)} className="text-sm flex-shrink-0" style={{ color: 'var(--tg-hint, #888)' }}>
            ← Назад
          </button>
        )}
      </header>

      {/* Date strip */}
      {step === 0 && (
        <div
          ref={dateScrollRef}
          className="flex overflow-x-auto gap-2 px-4 pb-2 pt-2 scrollbar-hide"
          style={{ background: 'var(--tg-bg, #f9fafb)', scrollbarWidth: 'none' }}
        >
          {dateList.map((date) => {
            const isActive = date === selectedDate;
            return (
              <button
                key={date}
                onClick={() => handleDateChange(date)}
                className="flex-shrink-0 flex flex-col items-center px-3 py-1.5 rounded-xl text-xs transition-all"
                style={{
                  background: isActive ? 'var(--tg-btn, #2563eb)' : 'var(--tg-secondary-bg, #f3f4f6)',
                  color: isActive ? 'var(--tg-btn-text, #fff)' : 'var(--tg-text, #111)',
                }}
              >
                <span className="font-semibold leading-none mb-0.5">{labelDay(date)}</span>
                <span className="leading-none opacity-70">{labelWeekday(date)}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Step 0: Map */}
      {step === 0 && (
        <>
          {(halls as any[]).length > 1 && (
            <div className="w-full px-4 pt-2 flex gap-2 overflow-x-auto scrollbar-hide">
              {(halls as any[]).map((hall, i) => (
                <button
                  key={hall.id}
                  onClick={() => {
                    if (selectedTableId) doUnlock(selectedTableId, selectedDate);
                    setSelectedHallIndex(i);
                    setSelectedTableId(null);
                    setLockExpiresAt(null);
                  }}
                  className="flex-shrink-0 px-4 py-1.5 rounded-lg text-xs transition-colors"
                  style={{
                    background: i === selectedHallIndex ? 'var(--tg-btn, #2563eb)' : 'var(--tg-secondary-bg, #f3f4f6)',
                    color: i === selectedHallIndex ? 'var(--tg-btn-text, #fff)' : 'var(--tg-text, #111)',
                  }}
                >
                  {hall.name}
                </button>
              ))}
            </div>
          )}

          <div className={`w-full px-4 py-2 ${selectedTableId ? 'pb-44' : 'pb-4'}`}>
            {currentHall ? (
              <BookingMap
                hall={currentHall}
                tableStatuses={tableStatuses}
                tableFreeUntil={tableFreeUntil}
                selectedTableId={selectedTableId}
                guestCount={guestCount}
                onTableSelect={handleTableSelect}
                darkMode={mwa?.colorScheme === 'dark'}
              />
            ) : (
              <div className="flex items-center justify-center h-64 rounded-xl" style={{ background: 'var(--tg-secondary-bg, #f3f4f6)' }}>
                <div className="w-6 h-6 border-2 border-[var(--tg-btn,#2563eb)] border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </div>

          {selectedTableId && (
            <div className="fixed bottom-0 left-0 right-0 z-20 shadow-2xl"
              style={{ background: 'var(--tg-bg, #fff)', borderTop: '1px solid var(--tg-hint, #e5e7eb)33' }}>
              <div className="px-4 pt-3 pb-5">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="font-semibold text-sm" style={{ color: 'var(--tg-text, #111)' }}>
                      Стол {selectedTable?.label ?? '—'}
                      {selectedTable && (
                        <span className="font-normal ml-2 text-xs" style={{ color: 'var(--tg-hint, #888)' }}>
                          {selectedTable.minGuests}–{selectedTable.maxGuests} гостей
                          {selectedTable.comment ? ` · ${selectedTable.comment}` : ''}
                        </span>
                      )}
                    </p>
                    {selectedTableTags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {selectedTableTags.map((tagId) => {
                          const tag = TABLE_TAGS.find((t) => t.id === tagId);
                          if (!tag) return null;
                          return (
                            <span key={tagId} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs"
                              style={{ background: 'var(--tg-secondary-bg, #f3f4f6)', color: 'var(--tg-text, #555)' }}>
                              {tag.icon} {tag.label}
                            </span>
                          );
                        })}
                      </div>
                    )}
                    {lockTimeLeft > 0 && (
                      <p className="text-xs mt-0.5" style={{ color: 'var(--tg-link, #2563eb)' }}>
                        🔒 Зарезервирован: {Math.floor(lockTimeLeft / 60)}:{String(lockTimeLeft % 60).padStart(2, '0')}
                      </p>
                    )}
                    {selectedFreeUntil && (
                      <p className="text-xs mt-0.5" style={{ color: '#d97706' }}>
                        ⏱ Свободен до {formatHHMM(selectedFreeUntil)}
                      </p>
                    )}
                  </div>
                  <button onClick={handleTableDeselect} className="p-1" style={{ color: 'var(--tg-hint, #888)' }}>✕</button>
                </div>

                {availableSlots.length > 0 ? (
                  <div className="mb-3">
                    <p className="text-xs mb-2" style={{ color: 'var(--tg-hint, #888)' }}>Время начала</p>
                    <div className="flex flex-wrap gap-1.5">
                      {availableSlots.map((slot: any) => (
                        <button
                          key={slot.time}
                          onClick={() => setSelectedTime(slot.time)}
                          className="px-3 py-1.5 text-sm rounded-lg border transition-colors"
                          style={selectedTime === slot.time ? {
                            background: 'var(--tg-btn, #2563eb)',
                            color: 'var(--tg-btn-text, #fff)',
                            borderColor: 'var(--tg-btn, #2563eb)',
                          } : {
                            background: 'var(--tg-secondary-bg, #f3f4f6)',
                            color: 'var(--tg-text, #111)',
                            borderColor: 'var(--tg-hint, #e5e7eb)55',
                          }}
                        >{slot.time}</button>
                      ))}
                    </div>
                  </div>
                ) : availabilityData ? (
                  <p className="text-sm mb-3" style={{ color: 'var(--tg-hint, #888)' }}>Нет доступных слотов</p>
                ) : (
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-4 h-4 border-2 border-[var(--tg-btn,#2563eb)] border-t-transparent rounded-full animate-spin" />
                    <span className="text-sm" style={{ color: 'var(--tg-hint, #888)' }}>Загружаем время...</span>
                  </div>
                )}

                <button
                  disabled={!selectedTime}
                  onClick={() => setStep(1)}
                  className="w-full py-3 font-semibold rounded-xl transition-colors disabled:opacity-40"
                  style={{ background: 'var(--tg-btn, #2563eb)', color: 'var(--tg-btn-text, #fff)' }}
                >
                  Далее — ввести данные →
                </button>
              </div>
            </div>
          )}

          {!selectedTableId && !lockError && (
            <p className="text-center text-sm pb-6" style={{ color: 'var(--tg-hint, #888)' }}>
              Нажмите на свободный стол
            </p>
          )}

          {lockError && (
            <p className="text-center text-sm pb-6 font-medium" style={{ color: '#d97706' }}>
              ⚠️ {lockError}
            </p>
          )}
        </>
      )}

      {/* Step 1: Guest form */}
      {step === 1 && (
        <div className="w-full px-4 py-4">
          <form onSubmit={handleSubmit} className="space-y-4">
            {formError && (
              <div className="px-4 py-3 rounded-xl text-sm" style={{ background: '#fee2e2', color: '#dc2626' }}>{formError}</div>
            )}

            <Field label="Имя" required>
              <input
                required
                value={guestForm.name}
                onChange={(e) => setGuestForm({ ...guestForm, name: e.target.value })}
                placeholder="Иван Петров"
                className="twa-input"
              />
            </Field>

            <Field label="Телефон" required>
              <input
                required
                type="tel"
                value={guestForm.phone}
                onChange={(e) => setGuestForm({ ...guestForm, phone: e.target.value })}
                placeholder="+79001234567"
                pattern="\+7\d{10}"
                className="twa-input"
              />
              <p className="text-xs mt-1" style={{ color: 'var(--tg-hint, #888)' }}>Формат: +7XXXXXXXXXX</p>
            </Field>

            <Field label="Email (необязательно)">
              <input
                type="email"
                value={guestForm.email}
                onChange={(e) => setGuestForm({ ...guestForm, email: e.target.value })}
                placeholder="ivan@example.com"
                className="twa-input"
              />
              {isMwa && (
                <p className="text-xs mt-1" style={{ color: 'var(--tg-hint, #888)' }}>
                  Уведомления придут в MAX. Email необязателен.
                </p>
              )}
            </Field>

            <Field label="Пожелания (необязательно)">
              <textarea
                value={guestForm.notes}
                onChange={(e) => setGuestForm({ ...guestForm, notes: e.target.value })}
                placeholder="У окна, детский стул..."
                rows={2}
                className="twa-input resize-none"
              />
            </Field>

            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                required
                checked={guestForm.consent}
                onChange={(e) => setGuestForm({ ...guestForm, consent: e.target.checked })}
                className="mt-0.5 w-4 h-4 flex-shrink-0"
                style={{ accentColor: 'var(--tg-btn, #2563eb)' }}
              />
              <span className="text-sm" style={{ color: 'var(--tg-hint, #666)' }}>
                Согласен(а) на обработку персональных данных (ФЗ № 152-ФЗ) <span style={{ color: '#ef4444' }}>*</span>
              </span>
            </label>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 font-semibold rounded-xl transition-colors disabled:opacity-50"
              style={{ background: 'var(--tg-btn, #2563eb)', color: 'var(--tg-btn-text, #fff)' }}
            >
              {submitting ? 'Бронируем...' : 'Подтвердить бронь'}
            </button>
          </form>
        </div>
      )}

      {/* Step 2: Success */}
      {step === 2 && booking && (
        <div className="w-full px-4 py-10 text-center">
          <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 text-4xl"
            style={{ background: booking.status === 'CONFIRMED' ? '#d1fae5' : '#fef3c7' }}>
            {booking.status === 'CONFIRMED' ? '✅' : '🕐'}
          </div>
          <h2 className="text-xl font-bold mb-2" style={{ color: 'var(--tg-text, #111)' }}>
            {booking.status === 'CONFIRMED' ? 'Бронь подтверждена!' : 'Заявка принята!'}
          </h2>
          <p className="text-sm mb-1" style={{ color: 'var(--tg-hint, #888)' }}>
            {booking.status === 'CONFIRMED'
              ? 'Ваш столик забронирован, ждём вас!'
              : 'Ресторан подтвердит бронь в ближайшее время'}
          </p>
          {isMwa && (
            <p className="text-xs mb-4" style={{ color: 'var(--tg-hint, #aaa)' }}>
              Уведомление придёт в этот чат
            </p>
          )}

          <div className="rounded-2xl p-5 text-left max-w-sm mx-auto mb-6 space-y-3"
            style={{ background: 'var(--tg-secondary-bg, #f9fafb)', border: '1px solid var(--tg-hint, #e5e7eb)33' }}>
            <Row label="Ресторан" value={restaurant.name} />
            <Row label="Дата" value={formatDateFull(selectedDate)} />
            <Row label="Время" value={selectedTime ?? '—'} />
            <Row label="Стол" value={selectedTable?.label ?? (booking.table?.label ?? '—')} />
            <Row label="Гостей" value={String(guestCount)} />
            <Row label="Имя" value={guestForm.name} />
          </div>

          {isMwa ? (
            <button
              onClick={() => mwa?.close?.()}
              className="w-full py-3 font-semibold rounded-xl"
              style={{ background: 'var(--tg-btn, #2563eb)', color: 'var(--tg-btn-text, #fff)' }}
            >
              Закрыть
            </button>
          ) : (
            <button
              onClick={() => {
                setStep(0);
                setSelectedTableId(null);
                setSelectedTime(null);
                setBooking(null);
                setGuestForm({ name: '', phone: '+7', email: '', notes: '', consent: false });
              }}
              className="text-sm" style={{ color: 'var(--tg-hint, #888)' }}
            >
              Сделать ещё одну бронь
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1" style={{ color: 'var(--tg-text, #111)' }}>
        {label} {required && <span style={{ color: '#ef4444' }}>*</span>}
      </label>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-sm" style={{ color: 'var(--tg-hint, #888)' }}>{label}</span>
      <span className="font-medium text-sm" style={{ color: 'var(--tg-text, #111)' }}>{value}</span>
    </div>
  );
}
