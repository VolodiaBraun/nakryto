'use client';

import dynamic from 'next/dynamic';
import type { Hall } from '@/types';

const BookingMapKonva = dynamic(() => import('./BookingMapKonva'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-64 bg-gray-50 rounded-xl">
      <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  ),
});

interface BookingMapProps {
  hall: Hall;
  tableStatuses: Record<string, 'FREE' | 'BOOKED' | 'LOCKED'>;
  tableFreeUntil: Record<string, string | null>;
  selectedTableId: string | null;
  guestCount: number;
  onTableSelect: (tableId: string) => void;
}

export default function BookingMap(props: BookingMapProps) {
  return <BookingMapKonva {...props} />;
}
