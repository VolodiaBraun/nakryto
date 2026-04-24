'use client';

import { useRouter } from 'next/navigation';

interface HallCardData {
  id: string;
  name: string;
  slug?: string;
  photos?: string[];
  tables: Array<{ minGuests: number; maxGuests: number }>;
}

function guestsLabel(n: number): string {
  if (n === 1) return '1 место';
  if (n >= 2 && n <= 4) return `${n} места`;
  return `${n} мест`;
}

function tablesLabel(n: number): string {
  if (n === 1) return '1 стол';
  if (n >= 2 && n <= 4) return `${n} стола`;
  return `${n} столов`;
}

function HallCard({ hall, restaurantSlug }: { hall: HallCardData; restaurantSlug: string }) {
  const router = useRouter();
  const tc = hall.tables.length;
  const minG = tc > 0 ? Math.min(...hall.tables.map((t) => t.minGuests)) : 1;
  const maxG = tc > 0 ? Math.max(...hall.tables.map((t) => t.maxGuests)) : 1;
  const photo = hall.photos?.[0];

  return (
    <button
      onClick={() => router.push(`/book/${restaurantSlug}/${hall.slug}`)}
      className="bg-white border border-gray-200 rounded-2xl overflow-hidden hover:shadow-md hover:border-blue-300 transition-all text-left w-full"
    >
      {photo ? (
        <img src={photo} alt={hall.name} className="w-full h-44 object-cover" />
      ) : (
        <div className="w-full h-44 bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
          <span className="text-5xl opacity-30">🪑</span>
        </div>
      )}
      <div className="p-4">
        <h3 className="font-semibold text-gray-900 text-base mb-1">{hall.name}</h3>
        <p className="text-sm text-gray-500">
          {tablesLabel(tc)} · {guestsLabel(minG)}–{guestsLabel(maxG)}
        </p>
      </div>
    </button>
  );
}

interface HallSelectorGridProps {
  halls: HallCardData[];
  restaurantSlug: string;
}

export default function HallSelectorGrid({ halls, restaurantSlug }: HallSelectorGridProps) {
  return (
    <div className="max-w-3xl mx-auto w-full px-4 py-6">
      <p className="text-sm text-gray-500 mb-4">Выберите зал для бронирования</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {halls.map((hall) => (
          <HallCard key={hall.id} hall={hall} restaurantSlug={restaurantSlug} />
        ))}
      </div>
    </div>
  );
}
