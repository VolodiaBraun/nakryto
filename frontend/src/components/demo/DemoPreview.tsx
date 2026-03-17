'use client';

import { useState, useMemo } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import type { FloorPlan, Hall, Table, TableObject } from '@/types';

const BookingMapKonva = dynamic(() => import('../booking-map/BookingMapKonva'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-48 bg-gray-50 rounded-xl">
      <div className="w-5 h-5 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
    </div>
  ),
});

// Детерминированно занятые столы (по индексу)
const BOOKED_INDICES = new Set([1, 4]);

function formatDate(d: Date) {
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

function getDayLabel(d: Date, today: Date) {
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return 'Сегодня';
  if (diff === 1) return 'Завтра';
  return d.toLocaleDateString('ru-RU', { weekday: 'short' });
}

interface DemoPreviewProps {
  floorPlan: FloorPlan;
}

export default function DemoPreview({ floorPlan }: DemoPreviewProps) {
  const [selectedDate, setSelectedDate] = useState(0); // index 0–4
  const [guestCount, setGuestCount]     = useState(2);
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [showCta, setShowCta]           = useState(false);

  // 5 дат начиная с сегодня
  const dates = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Array.from({ length: 5 }, (_, i) => {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, []);

  const today = dates[0];

  // Строим mock Hall из floorPlan
  const hall = useMemo<Hall>(() => {
    const tables: Table[] = (floorPlan.objects.filter((o) => o.type === 'table') as TableObject[]).map((t) => ({
      id: t.id,
      hallId: 'demo-hall',
      label: t.label,
      shape: t.shape,
      minGuests: t.minGuests,
      maxGuests: t.maxGuests,
      positionX: t.x,
      positionY: t.y,
      rotation: t.rotation,
      width: t.width,
      height: t.height,
      comment: t.comment,
      tags: t.tags,
      isActive: true,
    }));
    return {
      id: 'demo-hall',
      restaurantId: 'demo',
      name: 'Основной зал',
      floorPlan,
      sortOrder: 0,
      isActive: true,
      tables,
    };
  }, [floorPlan]);

  // Моковые статусы: каждый BOOKED_INDICES[i] — занят
  const tableStatuses = useMemo(() => {
    const result: Record<string, 'FREE' | 'BOOKED' | 'LOCKED'> = {};
    const tables = floorPlan.objects.filter((o) => o.type === 'table') as TableObject[];
    tables.forEach((t, i) => {
      result[t.id] = BOOKED_INDICES.has(i) ? 'BOOKED' : 'FREE';
    });
    return result;
  }, [floorPlan]);

  const tableFreeUntil = useMemo<Record<string, string | null>>(() => {
    const result: Record<string, string | null> = {};
    floorPlan.objects.filter((o) => o.type === 'table').forEach((t) => { result[t.id] = null; });
    return result;
  }, [floorPlan]);

  const handleTableSelect = (tableId: string) => {
    setSelectedTableId(tableId);
    setShowCta(true);
  };

  const selectedTable = hall.tables.find((t) => t.id === selectedTableId);

  return (
    <div className="flex flex-col bg-white">
      {/* Mock restaurant header */}
      <div className="px-4 pt-4 pb-2 border-b border-gray-100 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold text-gray-900 text-sm">Ваш ресторан</h3>
            <p className="text-xs text-gray-400">ул. Примерная, 1</p>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-flex items-center gap-1 text-[10px] bg-green-50 text-green-700 border border-green-100 px-2 py-0.5 rounded-full">
              <span className="w-1.5 h-1.5 bg-green-500 rounded-full inline-block" />
              Live
            </span>
          </div>
        </div>
      </div>

      <div className="flex-1 px-4 py-3 flex flex-col gap-3">

        {/* Date selector */}
        <div className="border border-gray-100 rounded-xl p-3 bg-white shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-gray-700">Дата</span>
            <Hint text="В полной версии — настраиваемые часы, закрытые дни и праздники" />
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-0.5">
            {dates.map((d, i) => (
              <button
                key={i}
                onClick={() => { setSelectedDate(i); setSelectedTableId(null); setShowCta(false); }}
                className={`flex-shrink-0 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  selectedDate === i
                    ? 'bg-orange-500 text-white border-orange-500'
                    : 'border-gray-200 text-gray-600 hover:border-orange-300'
                }`}
              >
                <div>{getDayLabel(d, today)}</div>
                <div className="text-[10px] opacity-75">{formatDate(d)}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Time range info */}
        <div className="border border-gray-100 rounded-xl px-3 py-2.5 bg-white shadow-sm flex items-center gap-2 text-xs text-gray-500">
          <span>🕐</span>
          <span>Часы приёма броней: <strong className="text-gray-700">10:00 — 23:00</strong></span>
        </div>

        {/* Guest count */}
        <div className="border border-gray-100 rounded-xl p-3 bg-white shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-gray-700">Гостей</span>
            <Hint text="Фильтрует столы по вместимости — серые не подходят по размеру" />
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setGuestCount((n) => Math.max(1, n - 1))}
              className="w-8 h-8 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 font-bold text-lg flex items-center justify-center"
            >
              −
            </button>
            <span className="text-sm font-semibold text-gray-900 w-6 text-center">{guestCount}</span>
            <button
              onClick={() => setGuestCount((n) => Math.min(12, n + 1))}
              className="w-8 h-8 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 font-bold text-lg flex items-center justify-center"
            >
              +
            </button>
          </div>
        </div>

        {/* Map */}
        <div className="border border-gray-100 rounded-xl p-3 bg-white shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-gray-700">Выберите стол</span>
            <Hint text="Обновляется в реальном времени — все менеджеры видят изменения мгновенно" />
          </div>
          <BookingMapKonva
            hall={hall}
            tableStatuses={tableStatuses}
            tableFreeUntil={tableFreeUntil}
            selectedTableId={selectedTableId}
            guestCount={guestCount}
            onTableSelect={handleTableSelect}
          />
        </div>

        {/* CTA after table click */}
        {showCta && selectedTable && (
          <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 flex-shrink-0">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-gray-900">
                  Стол {selectedTable.label} · {selectedTable.minGuests}–{selectedTable.maxGuests} гостей
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {getDayLabel(dates[selectedDate], today)}, {formatDate(dates[selectedDate])} · 10:00–23:00
                </p>
              </div>
              <button
                onClick={() => { setSelectedTableId(null); setShowCta(false); }}
                className="text-gray-400 hover:text-gray-600 text-lg leading-none flex-shrink-0"
              >×</button>
            </div>
            <div className="mt-3 pt-3 border-t border-orange-100">
              <p className="text-xs text-gray-600 mb-2">
                Гости смогут бронировать этот стол онлайн — с уведомлением на email и в Telegram.
              </p>
              <Link
                href="/register"
                className="w-full flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors"
              >
                Зарегистрироваться бесплатно →
              </Link>
            </div>
          </div>
        )}

        {/* Hint if no interaction */}
        {!showCta && (
          <div className="text-center py-2">
            <p className="text-xs text-gray-400">
              Нажмите на зелёный стол, чтобы увидеть, что видит гость
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Hint badge with tooltip ──────────────────────────────────────────────────

function Hint({ text }: { text: string }) {
  return (
    <span className="group relative flex-shrink-0">
      <span className="inline-flex items-center gap-1 bg-orange-50 text-orange-600 border border-orange-100 px-2 py-0.5 rounded-full text-[10px] font-medium cursor-default select-none">
        <span className="text-[11px]">💡</span>
        В полной версии
      </span>
      <span className="hidden group-hover:block absolute right-0 top-6 bg-gray-900 text-white text-[11px] leading-relaxed px-3 py-2 rounded-xl w-52 z-20 shadow-lg">
        {text}
      </span>
    </span>
  );
}
