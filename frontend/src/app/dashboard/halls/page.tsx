'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { hallsApi, uploadsApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import type { Hall } from '@/types';
import PhotoUploader from '@/components/PhotoUploader';

const TEMPLATES = [
  { key: 'empty', label: 'Пустой зал', icon: '□', desc: '0 столов' },
  { key: 'small', label: 'Зал 10 столов', icon: '⊞', desc: '2 ряда по 5' },
  { key: 'medium', label: 'Зал 20 столов', icon: '⊟', desc: 'Смешанные формы' },
];

export default function HallsPage() {
  const router = useRouter();
  const { can } = useAuth();
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [photosHallId, setPhotosHallId] = useState<string | null>(null);
  const [uploadingHall, setUploadingHall] = useState(false);

  const { data: halls = [], isLoading } = useQuery<Hall[]>({
    queryKey: ['halls'],
    queryFn: () => hallsApi.getAll() as any,
  });

  const createMutation = useMutation({
    mutationFn: (name: string) => hallsApi.create({ name }),
    onSuccess: (hall: any) => {
      qc.invalidateQueries({ queryKey: ['halls'] });
      setShowCreate(false);
      router.push(`/dashboard/halls/${hall.data?.id || hall.id}`);
    },
  });

  const templateMutation = useMutation({
    mutationFn: (key: string) => hallsApi.createFromTemplate(key),
    onSuccess: (hall: any) => {
      qc.invalidateQueries({ queryKey: ['halls'] });
      router.push(`/dashboard/halls/${hall.data?.id || hall.id}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => hallsApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['halls'] }),
  });

  const renameMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => hallsApi.update(id, { name }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['halls'] }),
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (newName.trim()) createMutation.mutate(newName.trim());
  };

  const photosHall = halls.find((h) => h.id === photosHallId);

  const handleUploadHallPhoto = async (file: File) => {
    if (!photosHallId) return;
    setUploadingHall(true);
    try {
      await uploadsApi.uploadHallPhoto(photosHallId, file);
      qc.invalidateQueries({ queryKey: ['halls'] });
    } catch (err: any) {
      alert(err.message || 'Ошибка загрузки');
    } finally {
      setUploadingHall(false);
    }
  };

  const handleDeleteHallPhoto = async (url: string) => {
    if (!photosHallId || !confirm('Удалить фото?')) return;
    try {
      await uploadsApi.deleteHallPhoto(photosHallId, url);
      qc.invalidateQueries({ queryKey: ['halls'] });
    } catch (err: any) {
      alert(err.message || 'Ошибка удаления');
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Залы и схемы</h1>
          <p className="text-gray-500 text-sm mt-1">Создайте схему зала и расставьте столы</p>
        </div>
        {can('manageHalls') && (
          <button
            onClick={() => setShowCreate(true)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors"
          >
            + Новый зал
          </button>
        )}
      </div>

      {/* Шаблоны — показываем если нет залов и пользователь OWNER */}
      {!isLoading && halls.length === 0 && can('manageHalls') && (
        <div className="mb-8">
          <h2 className="font-medium text-gray-700 mb-4">Начните с шаблона</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {TEMPLATES.map((tpl) => (
              <button
                key={tpl.key}
                onClick={() => templateMutation.mutate(tpl.key)}
                disabled={templateMutation.isPending}
                className="p-5 bg-white border-2 border-dashed border-gray-200 hover:border-blue-400 hover:bg-blue-50 rounded-xl text-left transition-colors group"
              >
                <div className="text-3xl mb-3 group-hover:scale-110 transition-transform inline-block">
                  {tpl.icon}
                </div>
                <div className="font-medium text-gray-900">{tpl.label}</div>
                <div className="text-sm text-gray-500 mt-1">{tpl.desc}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Список залов */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[1, 2].map((i) => (
            <div key={i} className="h-32 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : halls.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {halls.map((hall) => (
            <HallCard
              key={hall.id}
              hall={hall}
              canManage={can('manageHalls')}
              onEdit={() => router.push(`/dashboard/halls/${hall.id}`)}
              onDelete={() => {
                if (confirm(`Удалить зал "${hall.name}"?`)) deleteMutation.mutate(hall.id);
              }}
              onRename={(name) => renameMutation.mutate({ id: hall.id, name })}
              onPhotos={() => setPhotosHallId(hall.id)}
            />
          ))}

          {/* Кнопка добавить — только для OWNER */}
          {can('manageHalls') && (
            <button
              onClick={() => setShowCreate(true)}
              className="h-full min-h-32 p-5 bg-white border-2 border-dashed border-gray-200 hover:border-blue-400 hover:bg-blue-50 rounded-xl flex flex-col items-center justify-center text-gray-400 hover:text-blue-500 transition-colors"
            >
              <span className="text-3xl mb-2">+</span>
              <span className="text-sm font-medium">Добавить зал</span>
            </button>
          )}
        </div>
      ) : null}

      {/* Модалка создания */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <h3 className="font-semibold text-gray-900 mb-4">Новый зал</h3>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Название</label>
                <input
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Основной зал"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="flex-1 py-2.5 border border-gray-300 rounded-lg text-sm hover:bg-gray-50"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="flex-1 py-2.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
                >
                  {createMutation.isPending ? 'Создаём...' : 'Создать'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Модалка фото зала */}
      {photosHall && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-xl">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-semibold text-gray-900">Фото зала — {photosHall.name}</h3>
              <button
                onClick={() => setPhotosHallId(null)}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none"
              >
                ×
              </button>
            </div>
            <PhotoUploader
              photos={photosHall.photos ?? []}
              maxPhotos={15}
              uploading={uploadingHall}
              onUpload={handleUploadHallPhoto}
              onDelete={handleDeleteHallPhoto}
              label="Фотографии зала (до 15 шт)"
            />
          </div>
        </div>
      )}
    </div>
  );
}

function HallCard({
  hall, canManage, onEdit, onDelete, onRename, onPhotos,
}: {
  hall: Hall;
  canManage: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onRename: (name: string) => void;
  onPhotos: () => void;
}) {
  const tablesCount = hall.tables?.length || 0;
  const [editing, setEditing] = useState(false);
  const [nameValue, setNameValue] = useState(hall.name);

  function commitRename() {
    const trimmed = nameValue.trim();
    if (trimmed && trimmed !== hall.name) {
      onRename(trimmed);
    } else {
      setNameValue(hall.name);
    }
    setEditing(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') commitRename();
    if (e.key === 'Escape') { setNameValue(hall.name); setEditing(false); }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 hover:shadow-md transition-shadow">
      {/* Мини-превью схемы */}
      <div className="h-20 bg-gray-50 rounded-lg mb-4 overflow-hidden relative border border-gray-100">
        <MiniPreview hall={hall} />
      </div>

      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0 mr-2">
          {editing ? (
            <input
              autoFocus
              value={nameValue}
              onChange={(e) => setNameValue(e.target.value)}
              onBlur={commitRename}
              onKeyDown={handleKeyDown}
              className="w-full text-sm font-medium text-gray-900 border border-blue-400 rounded px-2 py-0.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          ) : (
            <div className="flex items-center gap-1 group">
              <h3 className="font-medium text-gray-900 truncate">{hall.name}</h3>
              {canManage && (
                <button
                  onClick={() => setEditing(true)}
                  className="opacity-0 group-hover:opacity-100 p-0.5 text-gray-400 hover:text-gray-700 transition-opacity flex-shrink-0"
                  title="Переименовать"
                >
                  ✏️
                </button>
              )}
            </div>
          )}
          <p className="text-sm text-gray-500 mt-0.5">
            {tablesCount} столов
            {(hall.photos?.length ?? 0) > 0 && (
              <span className="ml-2 text-blue-500">· {hall.photos!.length} фото</span>
            )}
          </p>
        </div>
        <div className="flex gap-1 flex-shrink-0">
          <button
            onClick={onPhotos}
            className="p-1.5 text-gray-400 hover:text-blue-500 rounded-lg transition-colors"
            title="Фото зала"
          >
            📷
          </button>
          <button
            onClick={onEdit}
            className="px-3 py-1.5 text-sm bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg transition-colors"
          >
            {canManage ? 'Редактор' : 'Просмотр'}
          </button>
          {canManage && (
            <button
              onClick={onDelete}
              className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg transition-colors"
            >
              🗑
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function MiniPreview({ hall }: { hall: Hall }) {
  const fp = hall.floorPlan;
  if (!fp || !fp.objects?.length) {
    return <div className="w-full h-full flex items-center justify-center text-gray-300 text-xs">Пустая схема</div>;
  }

  const tables = fp.objects.filter((o: any) => o.type === 'table');

  return (
    <svg
      viewBox={`0 0 ${fp.width} ${fp.height}`}
      style={{ width: '100%', height: '100%' }}
      preserveAspectRatio="xMidYMid meet"
    >
      {tables.map((t: any) => (
        t.shape === 'ROUND' ? (
          <ellipse key={t.id} cx={t.x + t.width / 2} cy={t.y + t.height / 2} rx={t.width / 2} ry={t.height / 2} fill="#dcfce7" stroke="#86efac" strokeWidth={2} />
        ) : (
          <rect key={t.id} x={t.x} y={t.y} width={t.width} height={t.height} rx={4} fill="#dcfce7" stroke="#86efac" strokeWidth={2} />
        )
      ))}
    </svg>
  );
}
