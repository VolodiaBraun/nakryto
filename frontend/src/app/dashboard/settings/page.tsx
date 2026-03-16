'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { restaurantApi, telegramApi, maxApi } from '@/lib/api';
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

  // MAX bot
  const [maxToken, setMaxToken] = useState('');
  const [maxBotName, setMaxBotName] = useState('');
  const [maxActive, setMaxActive] = useState(false);
  const [maxError, setMaxError] = useState('');
  const [maxSaved, setMaxSaved] = useState(false);

  // Telegram bot
  const [tgToken, setTgToken] = useState('');
  const [tgBotUsername, setTgBotUsername] = useState('');
  const [tgActive, setTgActive] = useState(false);
  const [tgError, setTgError] = useState('');
  const [tgSaved, setTgSaved] = useState(false);

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
      setTgActive(!!(restaurant as any).telegramBotActive);
      setMaxActive(!!(restaurant as any).maxBotActive);
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

  const frontendUrl = typeof window !== 'undefined' ? window.location.origin : (process.env.NEXT_PUBLIC_APP_URL || '');

  const setupBot = useMutation({
    mutationFn: () => telegramApi.setupBot(tgToken, frontendUrl),
    onSuccess: (data: any) => {
      const username = data?.botUsername || data?.data?.botUsername || '';
      setTgBotUsername(username);
      setTgActive(true);
      setTgToken('');
      setTgError('');
      setTgSaved(true);
      setTimeout(() => setTgSaved(false), 3000);
      qc.invalidateQueries({ queryKey: ['restaurant'] });
    },
    onError: (err: any) => {
      setTgError(err?.message || 'Не удалось подключить бота');
    },
  });

  const setupMaxBot = useMutation({
    mutationFn: () => maxApi.setupBot(maxToken),
    onSuccess: (data: any) => {
      const name = data?.botName || data?.data?.botName || '';
      setMaxBotName(name);
      setMaxActive(true);
      setMaxToken('');
      setMaxError('');
      setMaxSaved(true);
      setTimeout(() => setMaxSaved(false), 3000);
      qc.invalidateQueries({ queryKey: ['restaurant'] });
    },
    onError: (err: any) => {
      setMaxError(err?.message || 'Не удалось подключить бота MAX');
    },
  });

  const disableMaxBot = useMutation({
    mutationFn: () => maxApi.disableBot(),
    onSuccess: () => {
      setMaxActive(false);
      setMaxBotName('');
      qc.invalidateQueries({ queryKey: ['restaurant'] });
    },
  });

  const disableBot = useMutation({
    mutationFn: () => telegramApi.disableBot(),
    onSuccess: () => {
      setTgActive(false);
      setTgBotUsername('');
      qc.invalidateQueries({ queryKey: ['restaurant'] });
    },
  });

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

      {/* MAX Bot */}
      <Section title="Бот в мессенджере MAX">
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            Подключите бота в российском мессенджере{' '}
            <a href="https://max.ru" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
              MAX
            </a>
            . Гости смогут бронировать столы прямо в чате с ботом.
          </p>

          <details className="text-sm text-gray-500 bg-gray-50 rounded-lg p-3">
            <summary className="cursor-pointer font-medium text-gray-700">Инструкция: как создать бота в MAX</summary>
            <ol className="mt-2 ml-4 space-y-1.5 list-decimal">
              <li>
                Зайдите на портал{' '}
                <a href="https://business.max.ru" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                  business.max.ru
                </a>{' '}
                и войдите через свой аккаунт MAX
              </li>
              <li>Создайте организацию (если ещё нет) — потребуется верификация</li>
              <li>Перейдите в раздел <strong>Чат-боты → Интеграция</strong></li>
              <li>Нажмите <strong>Получить токен</strong> — скопируйте его</li>
              <li>
                В разделе <strong>Чат-боты → Настроить</strong> укажите URL мини-приложения:<br />
                <code className="bg-gray-200 px-1.5 py-0.5 rounded text-xs break-all">
                  {typeof window !== 'undefined' ? window.location.origin : 'https://nakryto.ru'}/max/{restaurant?.slug ?? 'ваш-slug'}
                </code>
              </li>
              <li>Вставьте токен в поле ниже и нажмите <strong>Подключить</strong></li>
            </ol>
          </details>

          {maxActive && (
            <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
              <span className="text-green-600 text-lg">✅</span>
              <div className="flex-1">
                <p className="text-sm font-medium text-green-800">MAX-бот подключён{maxBotName ? ` — ${maxBotName}` : ''}</p>
                <p className="text-xs text-green-600">Гости могут бронировать через MAX</p>
              </div>
              <button
                onClick={() => disableMaxBot.mutate()}
                disabled={disableMaxBot.isPending}
                className="text-xs text-red-500 hover:text-red-700 border border-red-200 rounded px-2 py-1"
              >
                Отключить
              </button>
            </div>
          )}

          {maxError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{maxError}</div>
          )}
          {maxSaved && (
            <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">✓ MAX-бот успешно подключён!</div>
          )}

          <div className="flex gap-2">
            <input
              type="text"
              value={maxToken}
              onChange={(e) => setMaxToken(e.target.value)}
              placeholder={maxActive ? 'Вставьте новый токен для замены' : 'Токен бота MAX'}
              className="input flex-1 font-mono text-xs"
            />
            <button
              onClick={() => setupMaxBot.mutate()}
              disabled={!maxToken.trim() || setupMaxBot.isPending}
              className="btn-primary whitespace-nowrap"
            >
              {setupMaxBot.isPending ? 'Подключение...' : maxActive ? 'Заменить' : 'Подключить'}
            </button>
          </div>
        </div>
      </Section>

      {/* Telegram Bot */}
      <Section title="Telegram-бот бронирования">
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            Создайте бота в{' '}
            <a href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
              @BotFather
            </a>
            , скопируйте токен и вставьте ниже. Гости смогут бронировать прямо в вашем Telegram-боте.
          </p>

          <details className="text-sm text-gray-500 bg-gray-50 rounded-lg p-3">
            <summary className="cursor-pointer font-medium text-gray-700">Инструкция: как создать бота</summary>
            <ol className="mt-2 ml-4 space-y-1 list-decimal">
              <li>Откройте Telegram и найдите <strong>@BotFather</strong></li>
              <li>Отправьте команду <code className="bg-gray-200 px-1 rounded">/newbot</code></li>
              <li>Введите название бота (например: «Ресторан Арго Бронирование»)</li>
              <li>Введите имя пользователя (должно заканчиваться на <em>bot</em>)</li>
              <li>Скопируйте полученный токен и вставьте в поле ниже</li>
            </ol>
          </details>

          {tgActive && (
            <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
              <span className="text-green-600 text-lg">✅</span>
              <div className="flex-1">
                <p className="text-sm font-medium text-green-800">Бот подключён{tgBotUsername ? ` — @${tgBotUsername}` : ''}</p>
                <p className="text-xs text-green-600">Гости могут бронировать через Telegram</p>
              </div>
              <button
                onClick={() => disableBot.mutate()}
                disabled={disableBot.isPending}
                className="text-xs text-red-500 hover:text-red-700 border border-red-200 rounded px-2 py-1"
              >
                Отключить
              </button>
            </div>
          )}

          {tgError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{tgError}</div>
          )}
          {tgSaved && (
            <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">✓ Бот успешно подключён!</div>
          )}

          <div className="flex gap-2">
            <input
              type="text"
              value={tgToken}
              onChange={(e) => setTgToken(e.target.value)}
              placeholder={tgActive ? 'Вставьте новый токен для замены' : 'Токен бота (123456:ABC-DEF...)'}
              className="input flex-1 font-mono text-xs"
            />
            <button
              onClick={() => setupBot.mutate()}
              disabled={!tgToken.trim() || setupBot.isPending}
              className="btn-primary whitespace-nowrap"
            >
              {setupBot.isPending ? 'Подключение...' : tgActive ? 'Заменить' : 'Подключить'}
            </button>
          </div>
        </div>
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
