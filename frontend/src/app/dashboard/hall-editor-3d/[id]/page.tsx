'use client';

import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { hallsApi } from '@/lib/api';
import type { Hall } from '@/types';
import { HallEditor3D } from '@/components/hall-editor-3d/HallEditor3D';

export default function HallEditor3DPage() {
  const { id } = useParams<{ id: string }>();

  const { data: hall, isLoading, error } = useQuery<Hall>({
    queryKey: ['hall', id],
    queryFn: () => hallsApi.getOne(id) as any,
  });

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-gray-900">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-gray-400 text-sm">Загрузка зала...</p>
        </div>
      </div>
    );
  }

  if (error || !hall) {
    return (
      <div className="flex h-full items-center justify-center bg-gray-900">
        <div className="text-center">
          <p className="text-red-400 mb-4">Зал не найден</p>
          <Link href="/dashboard/halls" className="text-blue-400 hover:underline">
            ← Назад к залам
          </Link>
        </div>
      </div>
    );
  }

  return <HallEditor3D hall={hall} />;
}
