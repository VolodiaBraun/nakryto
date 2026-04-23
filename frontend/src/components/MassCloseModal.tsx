'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { closedPeriodsApi } from '@/lib/api';

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function MassCloseModal({ open, onClose }: Props) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ startsAt: '', endsAt: '', reason: '', guestName: '', guestPhone: '' });

  const reset = () => {
    setForm({ startsAt: '', endsAt: '', reason: '', guestName: '', guestPhone: '' });
    onClose();
  };

  const mutation = useMutation({
    mutationFn: (data: any) => closedPeriodsApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['closedPeriods'] });
      reset();
    },
  });

  const handleSubmit = () => {
    if (!form.startsAt || !form.endsAt) return;
    mutation.mutate({
      tableId: null,
      startsAt: new Date(form.startsAt).toISOString(),
      endsAt: new Date(form.endsAt).toISOString(),
      reason: form.reason || undefined,
      guestName: form.guestName || undefined,
      guestPhone: form.guestPhone || undefined,
    });
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-gray-900">Закрыть все столы</h2>
          <button onClick={reset} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>
        <p className="text-sm text-gray-500">Создаёт закрытый период для всего ресторана — все столы будут недоступны для онлайн-бронирования.</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-500 block mb-1">Начало</label>
            <input type="datetime-local" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} className="input text-sm" />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Конец</label>
            <input type="datetime-local" value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} className="input text-sm" />
          </div>
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">Причина</label>
          <input type="text" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="Санитарный день, ремонт, мероприятие..." className="input text-sm" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-500 block mb-1">ФИО клиента (если мероприятие)</label>
            <input type="text" value={form.guestName} onChange={(e) => setForm({ ...form, guestName: e.target.value })} placeholder="Иван Петров" className="input text-sm" />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Телефон клиента</label>
            <input type="tel" value={form.guestPhone} onChange={(e) => setForm({ ...form, guestPhone: e.target.value })} placeholder="+79001234567" className="input text-sm" />
          </div>
        </div>
        <div className="flex gap-3">
          <button onClick={reset} className="flex-1 py-2.5 border border-gray-300 rounded-xl text-sm text-gray-700 hover:bg-gray-50">Отмена</button>
          <button
            onClick={handleSubmit}
            disabled={mutation.isPending || !form.startsAt || !form.endsAt}
            className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-xl disabled:opacity-50"
          >
            {mutation.isPending ? 'Закрываем...' : 'Закрыть'}
          </button>
        </div>
      </div>
    </div>
  );
}
