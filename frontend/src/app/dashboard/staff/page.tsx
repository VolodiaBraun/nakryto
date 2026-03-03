'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { staffApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

const ROLE_LABELS: Record<string, string> = {
  OWNER: 'Владелец',
  MANAGER: 'Менеджер',
  HOSTESS: 'Хостес',
};

const ROLE_COLORS: Record<string, string> = {
  OWNER: 'bg-purple-100 text-purple-700',
  MANAGER: 'bg-blue-100 text-blue-700',
  HOSTESS: 'bg-green-100 text-green-700',
};

interface StaffMember {
  id: string;
  name: string;
  email: string;
  role: string;
  createdAt: string;
}

export default function StaffPage() {
  const router = useRouter();
  const { can, user } = useAuth();
  const qc = useQueryClient();

  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'MANAGER' });
  const [formError, setFormError] = useState('');

  const hasAccess = can('manageStaff');

  useEffect(() => {
    if (!hasAccess) router.replace('/dashboard');
  }, [hasAccess, router]);

  const { data: staff = [], isLoading } = useQuery<StaffMember[]>({
    queryKey: ['staff'],
    queryFn: () => staffApi.getAll() as any,
    enabled: hasAccess,
  });

  const createMutation = useMutation({
    mutationFn: (data: typeof form) => staffApi.create(data) as any,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['staff'] });
      setForm({ name: '', email: '', password: '', role: 'MANAGER' });
      setFormError('');
    },
    onError: (err: any) => {
      setFormError(err?.message || 'Ошибка при создании сотрудника');
    },
  });

  const roleMutation = useMutation({
    mutationFn: ({ id, role }: { id: string; role: string }) => staffApi.updateRole(id, role) as any,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['staff'] }),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => staffApi.remove(id) as any,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['staff'] }),
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim() || !form.password.trim()) return;
    createMutation.mutate(form);
  };

  if (!hasAccess) return null;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-8">
      <h1 className="text-2xl font-bold text-gray-900">Сотрудники</h1>

      {/* Add form */}
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <h2 className="font-semibold text-gray-900 mb-4">Добавить сотрудника</h2>
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Имя</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Имя Фамилия"
                className="input"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="email@restaurant.ru"
                className="input"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Пароль</label>
              <input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="Минимум 6 символов"
                className="input"
                required
                minLength={6}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Роль</label>
              <select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
                className="input"
              >
                <option value="MANAGER">Менеджер</option>
                <option value="HOSTESS">Хостес</option>
              </select>
            </div>
          </div>
          {formError && <p className="text-sm text-red-600">{formError}</p>}
          <button
            type="submit"
            disabled={createMutation.isPending}
            className="btn-primary"
          >
            {createMutation.isPending ? 'Добавляем...' : 'Добавить сотрудника'}
          </button>
        </form>
      </div>

      {/* Staff table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Список сотрудников</h2>
        </div>
        {isLoading ? (
          <div className="p-6 space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 bg-gray-100 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : staff.length === 0 ? (
          <div className="p-6 text-center text-gray-400 text-sm">Нет сотрудников</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                <th className="px-6 py-3">Имя</th>
                <th className="px-6 py-3">Email</th>
                <th className="px-6 py-3">Роль</th>
                <th className="px-6 py-3 text-right">Действия</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {staff.map((member) => (
                <tr key={member.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">{member.name}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">{member.email}</td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${ROLE_COLORS[member.role] ?? 'bg-gray-100 text-gray-700'}`}>
                      {ROLE_LABELS[member.role] ?? member.role}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    {member.role !== 'OWNER' && (
                      <div className="flex items-center justify-end gap-2">
                        <select
                          value={member.role}
                          onChange={(e) => roleMutation.mutate({ id: member.id, role: e.target.value })}
                          disabled={roleMutation.isPending}
                          className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="MANAGER">Менеджер</option>
                          <option value="HOSTESS">Хостес</option>
                        </select>
                        {member.id !== user?.id && (
                          <button
                            onClick={() => {
                              if (confirm(`Удалить ${member.name}?`)) removeMutation.mutate(member.id);
                            }}
                            disabled={removeMutation.isPending}
                            className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg transition-colors"
                            title="Удалить"
                          >
                            🗑
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
