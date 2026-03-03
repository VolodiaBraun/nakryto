'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { hallsApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import type { Hall, FloorPlan } from '@/types';

const HallEditor = dynamic(() => import('@/components/hall-editor/HallEditor'), {
  ssr: false,
  loading: () => (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-gray-500 text-sm">Загрузка редактора...</p>
      </div>
    </div>
  ),
});

export default function HallEditorPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const router = useRouter();
  const { can } = useAuth();
  const qc = useQueryClient();
  const canManage = can('manageHalls');

  const { data: hall, isLoading, error } = useQuery<Hall>({
    queryKey: ['hall', id],
    queryFn: () => hallsApi.getOne(id) as any,
  });

  const saveMutation = useMutation({
    mutationFn: (floorPlan: FloorPlan) => hallsApi.saveFloorPlan(id, floorPlan),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hall', id] }),
  });

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !hall) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <p className="text-red-500 mb-4">Зал не найден</p>
          <Link href="/dashboard/halls" className="text-blue-600 hover:underline">
            ← Назад к залам
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Breadcrumb */}
      <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 flex-shrink-0 flex items-center justify-between">
        <nav className="flex items-center gap-2 text-sm">
          <Link href="/dashboard/halls" className="text-gray-500 hover:text-gray-700">
            Залы
          </Link>
          <span className="text-gray-300">/</span>
          <span className="text-gray-900 font-medium">{hall.name}</span>
        </nav>
        {!canManage && (
          <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-3 py-1">
            Только просмотр
          </span>
        )}
      </div>

      {/* Editor (flex-1) */}
      <div className="flex-1 overflow-hidden">
        <HallEditor
          hall={hall}
          onSave={canManage ? async (floorPlan) => { await saveMutation.mutateAsync(floorPlan); } : undefined}
          onPreview={() => {
            // TODO: открыть предпросмотр как гость
          }}
        />
      </div>
    </div>
  );
}
