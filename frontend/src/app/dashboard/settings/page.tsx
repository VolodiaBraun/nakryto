'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { restaurantApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import type { Restaurant } from '@/types';

const DAY_NAMES: Record<string, string> = {
  mon: 'Понедельник', tue: 'Вторник', wed: 'Среда',
  thu: 'Четверг', fri: 'Пятница', sat: 'Суббота', sun: 'Воскресенье',
};
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

export default function SettingsPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [saved, setSaved] = useState(false);
  const [profile, setProfile] = useState({ name: '', address: '', phone: '', description: '' });
  const [settings, setSettings] = useState({ minBookingHours: 2, maxBookingDays: 30, slotMinutes: 30, bufferMinutes: 30, autoConfirm: true });
  const [hours, setHours] = useState<any>({});
  const [notificationEmails, setNotificationEmails] = useState<string[]>([]);
  const [emailInput, setEmailInput] = useState('');

  const hasAccess = can('manageSettings');

  const { data: restaurant } = useQuery<Restaurant>({
    queryKey: ['restaurant'],
    queryFn: () => restaurantApi.getProfile() as any,
    enabled: hasAccess,
  });

  const { data: widgetData } = useQuery<any>({
    queryKey: ['widget'],
    queryFn: () => restaurantApi.getWidgetSettings(),
    enabled: hasAccess,
  });

  useEffect(() => {
    if (restaurant) {
      setProfile({ name: restaurant.name, address: restaurant.address || '', phone: restaurant.phone || '', description: restaurant.description || '' });
      const s = (restaurant.settings as any) || {};
      setSettings({ minBookingHours: s.minBookingHours ?? 2, maxBookingDays: s.maxBookingDays ?? 30, slotMinutes: s.slotMinutes ?? 30, bufferMinutes: s.bufferMinutes ?? 30, autoConfirm: s.autoConfirm ?? true });
      setNotificationEmails(s.notificationEmails || []);
      setHours(restaurant.workingHours as any);
    }
  }, [restaurant]);

  const updateProfile = useMutation({
    mutationFn: () => restaurantApi.updateProfile(profile),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['restaurant'] }); flash(); },
  });

  const updateSettings = useMutation({
    mutationFn: () => restaurantApi.updateSettings({ ...settings, notificationEmails }),
    onSuccess: flash,
  });

  const updateHours = useMutation({
    mutationFn: () => restaurantApi.updateWorkingHours({ workingHours: hours }),
    onSuccess: flash,
  });

  function flash() { setSaved(true); setTimeout(() => setSaved(false), 2000); }

  if (!hasAccess) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="text-center max-w-sm">
          <div className="text-5xl mb-4">🔒</div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Доступ ограничен</h2>
          <p className="text-gray-500 text-sm">Управление настройками доступно только владельцу ресторана.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Настройки</h1>
        {saved && <span className="text-green-600 text-sm font-medium">✓ Сохранено</span>}
      </div>

      {/* Профиль */}
      <Section title="Профиль ресторана">
        <Field label="Название">
          <input value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} className="input" />
        </Field>
        <Field label="Адрес">
          <input value={profile.address} onChange={(e) => setProfile({ ...profile, address: e.target.value })} className="input" placeholder="Москва, ул. Арбат, 15" />
        </Field>
        <Field label="Телефон">
          <input value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} className="input" placeholder="+7 495 123-45-67" />
        </Field>
        <Field label="Описание">
          <textarea value={profile.description} onChange={(e) => setProfile({ ...profile, description: e.target.value })} className="input" rows={3} />
        </Field>
        <button onClick={() => updateProfile.mutate()} disabled={updateProfile.isPending} className="btn-primary">
          {updateProfile.isPending ? 'Сохранение...' : 'Сохранить профиль'}
        </button>
      </Section>

      {/* Настройки бронирования */}
      <Section title="Параметры бронирования">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Мин. часов до брони">
            <input type="number" min={0} max={72} value={settings.minBookingHours} onChange={(e) => setSettings({ ...settings, minBookingHours: +e.target.value })} className="input" />
          </Field>
          <Field label="Горизонт (дней вперёд)">
            <input type="number" min={1} max={365} value={settings.maxBookingDays} onChange={(e) => setSettings({ ...settings, maxBookingDays: +e.target.value })} className="input" />
          </Field>
          <Field label="Длина слота (мин)">
            <select value={settings.slotMinutes} onChange={(e) => setSettings({ ...settings, slotMinutes: +e.target.value })} className="input">
              <option value={15}>15 минут</option>
              <option value={30}>30 минут</option>
              <option value={60}>60 минут</option>
            </select>
          </Field>
          <Field label="Буфер между бронями (мин)">
            <input type="number" min={0} max={120} value={settings.bufferMinutes} onChange={(e) => setSettings({ ...settings, bufferMinutes: +e.target.value })} className="input" />
          </Field>
        </div>
        <label className="flex items-center gap-3 cursor-pointer">
          <input type="checkbox" checked={settings.autoConfirm} onChange={(e) => setSettings({ ...settings, autoConfirm: e.target.checked })} className="w-4 h-4 accent-blue-600" />
          <span className="text-sm text-gray-700">Автоматически подтверждать брони</span>
        </label>
        <button onClick={() => updateSettings.mutate()} disabled={updateSettings.isPending} className="btn-primary">
          {updateSettings.isPending ? 'Сохранение...' : 'Сохранить настройки'}
        </button>
      </Section>

      {/* Расписание */}
      <Section title="Расписание работы">
        <div className="space-y-2">
          {DAYS.map((day) => {
            const d = hours[day] || { open: '10:00', close: '22:00', closed: false };
            return (
              <div key={day} className="flex items-center gap-3">
                <span className="w-32 text-sm text-gray-700 font-medium">{DAY_NAMES[day]}</span>
                <label className="flex items-center gap-1.5 text-sm text-gray-500">
                  <input type="checkbox" checked={!d.closed} onChange={(e) => setHours({ ...hours, [day]: { ...d, closed: !e.target.checked } })} className="accent-blue-600" />
                  Открыт
                </label>
                {!d.closed && (
                  <>
                    <input type="time" value={d.open} onChange={(e) => setHours({ ...hours, [day]: { ...d, open: e.target.value } })} className="input w-28" />
                    <span className="text-gray-400">—</span>
                    <input type="time" value={d.close} onChange={(e) => setHours({ ...hours, [day]: { ...d, close: e.target.value } })} className="input w-28" />
                  </>
                )}
              </div>
            );
          })}
        </div>
        <button onClick={() => updateHours.mutate()} disabled={updateHours.isPending} className="btn-primary">
          {updateHours.isPending ? 'Сохранение...' : 'Сохранить расписание'}
        </button>
      </Section>

      {/* Уведомления */}
      <Section title="Email-уведомления">
        <p className="text-sm text-gray-500">На эти адреса будут приходить письма при новых бронях и отменах.</p>
        <div className="flex flex-wrap gap-2 min-h-10 p-2 border border-gray-200 rounded-lg bg-gray-50">
          {notificationEmails.map((email) => (
            <span key={email} className="flex items-center gap-1 px-2.5 py-1 bg-blue-100 text-blue-800 text-sm rounded-full">
              {email}
              <button
                type="button"
                onClick={() => setNotificationEmails(notificationEmails.filter((e) => e !== email))}
                className="ml-1 text-blue-500 hover:text-blue-800 leading-none"
              >
                ×
              </button>
            </span>
          ))}
          {notificationEmails.length === 0 && <span className="text-sm text-gray-400 self-center">Нет адресов</span>}
        </div>
        <div className="flex gap-2">
          <input
            type="email"
            value={emailInput}
            onChange={(e) => setEmailInput(e.target.value)}
            onKeyDown={(e) => {
              if ((e.key === 'Enter' || e.key === ',') && emailInput.trim()) {
                e.preventDefault();
                const val = emailInput.trim().replace(/,$/, '');
                if (val && !notificationEmails.includes(val)) {
                  setNotificationEmails([...notificationEmails, val]);
                }
                setEmailInput('');
              }
            }}
            placeholder="email@example.com"
            className="input flex-1"
          />
          <button
            type="button"
            onClick={() => {
              const val = emailInput.trim();
              if (val && !notificationEmails.includes(val)) {
                setNotificationEmails([...notificationEmails, val]);
              }
              setEmailInput('');
            }}
            className="btn-secondary"
          >
            Добавить
          </button>
        </div>
        <button onClick={() => updateSettings.mutate()} disabled={updateSettings.isPending} className="btn-primary">
          {updateSettings.isPending ? 'Сохранение...' : 'Сохранить уведомления'}
        </button>
      </Section>

      {/* Виджет */}
      {widgetData && (
        <Section title="Виджет для сайта">
          <p className="text-sm text-gray-600 mb-3">Вставьте этот код на ваш сайт — появится кнопка «Забронировать стол»:</p>
          <div className="bg-gray-900 rounded-lg p-4 overflow-x-auto">
            <pre className="text-green-400 text-xs whitespace-pre-wrap break-all">{widgetData.embedCode}</pre>
          </div>
          <button
            onClick={() => navigator.clipboard.writeText(widgetData.embedCode)}
            className="btn-secondary text-sm"
          >
            📋 Скопировать код
          </button>
        </Section>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
      <h2 className="font-semibold text-gray-900 text-lg">{title}</h2>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {children}
    </div>
  );
}
