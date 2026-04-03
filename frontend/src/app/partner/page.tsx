'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { referralApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

// ─── Типы ─────────────────────────────────────────────────────────────────────

interface MonthlyData {
  month: string;
  amount: number;
  count: number;
}

interface ForecastEntry {
  date: string;
  month: string;
  restaurantName: string;
  planName: string;
  expectedCommission: number;
}

interface Transaction {
  id: string;
  commissionAmount: number;
  commissionRate: number;
  paymentAmount: number;
  planName: string;
  isFirstPayment: boolean;
  discountRate?: number;
  createdAt: string;
  referralUser: {
    name: string;
    restaurant: { name: string; plan: string; planExpiresAt: string | null } | null;
  };
}

interface Withdrawal {
  id: string;
  amount: number;
  status: string;
  paymentDetails?: string;
  adminNote?: string;
  processedAt?: string;
  createdAt: string;
}

interface ReferralInfo {
  referralCode: string | null;
  referralBalance: number;
  totalEarned: number;
  totalPaid: number;
  totalReferrals: number;
  totalTransactions: number;
  transactions: Transaction[];
  chartData: MonthlyData[];
  forecastData: ForecastEntry[];
  totalForecast: number;
  withdrawals: Withdrawal[];
}

// ─── Константы ────────────────────────────────────────────────────────────────

const PLAN_LABELS: Record<string, string> = {
  FREE: 'Бесплатный',
  STANDARD: 'Стандарт',
  PREMIUM: 'Премиум',
};

const WITHDRAWAL_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Ожидает',
  PROCESSING: 'В обработке',
  COMPLETED: 'Выплачено',
  REJECTED: 'Отклонено',
};

const WITHDRAWAL_STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-yellow-100 text-yellow-700',
  PROCESSING: 'bg-blue-100 text-blue-700',
  COMPLETED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-700',
};

// ─── SVG Bar Chart ─────────────────────────────────────────────────────────────

function MonthlyBarChart({ data }: { data: MonthlyData[] }) {
  const maxAmount = Math.max(...data.map((d) => d.amount), 1);
  const W = 600;
  const H = 140;
  const n = data.length;
  const gap = 3;
  const barW = Math.floor((W - gap) / n) - gap;

  const monthName = (m: string) => {
    const [, mm] = m.split('-');
    const names = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
    return names[parseInt(mm, 10) - 1] ?? mm;
  };

  return (
    <svg viewBox={`0 0 ${W} ${H + 24}`} className="w-full" style={{ minHeight: 100 }}>
      {data.map((d, i) => {
        const x = i * (barW + gap) + gap;
        const barH = Math.max((d.amount / maxAmount) * H, d.amount > 0 ? 3 : 0);
        const y = H - barH;
        return (
          <g key={d.month}>
            <rect x={x} y={y} width={barW} height={barH} fill="#7c3aed" rx={2}>
              <title>
                {d.month}: {d.amount.toFixed(0)} ₽ · {d.count} оплат
              </title>
            </rect>
            {d.amount > 0 && (
              <text
                x={x + barW / 2}
                y={Math.max(y - 3, 8)}
                textAnchor="middle"
                fontSize="8"
                fill="#6d28d9"
              >
                {d.amount >= 1000 ? `${(d.amount / 1000).toFixed(1)}k` : d.amount.toFixed(0)}
              </text>
            )}
            <text
              x={x + barW / 2}
              y={H + 16}
              textAnchor="middle"
              fontSize="9"
              fill="#9ca3af"
            >
              {monthName(d.month)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ─── SVG Forecast Chart ────────────────────────────────────────────────────────

function ForecastChart({
  chartData,
  forecastData,
}: {
  chartData: MonthlyData[];
  forecastData: ForecastEntry[];
}) {
  const now = new Date();
  const W = 700;
  const H = 140;

  // Формируем 6 исторических + 12 прогнозных месяцев
  const historicalMonths: Array<{ month: string; amount: number; isForecast: false }> = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const amount = chartData.find((c) => c.month === month)?.amount ?? 0;
    historicalMonths.push({ month, amount, isForecast: false });
  }

  const forecastByMonth: Record<string, number> = {};
  for (const f of forecastData) {
    forecastByMonth[f.month] = (forecastByMonth[f.month] ?? 0) + f.expectedCommission;
  }

  const forecastMonths: Array<{ month: string; amount: number; isForecast: true }> = [];
  for (let i = 1; i <= 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    forecastMonths.push({ month, amount: forecastByMonth[month] ?? 0, isForecast: true });
  }

  const allMonths = [...historicalMonths, ...forecastMonths];
  const maxAmount = Math.max(...allMonths.map((m) => m.amount), 1);
  const n = allMonths.length;
  const gap = 3;
  const barW = Math.floor((W - gap) / n) - gap;

  const monthName = (m: string) => {
    const [, mm] = m.split('-');
    const names = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
    return names[parseInt(mm, 10) - 1] ?? mm;
  };

  const dividerX = 6 * (barW + gap);

  return (
    <svg viewBox={`0 0 ${W} ${H + 36}`} className="w-full" style={{ minHeight: 120 }}>
      {/* Разделитель факт/прогноз */}
      <line
        x1={dividerX}
        y1={0}
        x2={dividerX}
        y2={H + 4}
        stroke="#e5e7eb"
        strokeWidth="1.5"
        strokeDasharray="5,4"
      />

      {allMonths.map((m, i) => {
        const x = i * (barW + gap) + gap;
        const barH = Math.max((m.amount / maxAmount) * H, m.amount > 0 ? 3 : 0);
        const y = H - barH;
        return (
          <g key={m.month}>
            <rect
              x={x}
              y={y}
              width={barW}
              height={barH}
              fill={m.isForecast ? '#bbf7d0' : '#7c3aed'}
              stroke={m.isForecast ? '#16a34a' : 'none'}
              strokeWidth={m.isForecast ? 1 : 0}
              rx={2}
            >
              <title>
                {m.month}: {m.amount.toFixed(0)} ₽{m.isForecast ? ' (прогноз)' : ' (факт)'}
              </title>
            </rect>
            {m.amount > 0 && (
              <text
                x={x + barW / 2}
                y={Math.max(y - 3, 8)}
                textAnchor="middle"
                fontSize="8"
                fill={m.isForecast ? '#15803d' : '#6d28d9'}
              >
                {m.amount >= 1000 ? `${(m.amount / 1000).toFixed(1)}k` : m.amount.toFixed(0)}
              </text>
            )}
            <text
              x={x + barW / 2}
              y={H + 16}
              textAnchor="middle"
              fontSize="9"
              fill="#9ca3af"
            >
              {monthName(m.month)}
            </text>
          </g>
        );
      })}

      {/* Подписи: факт / прогноз */}
      <rect x={4} y={H + 24} width={8} height={8} fill="#7c3aed" />
      <text x={16} y={H + 32} fontSize="9" fill="#6b7280">
        Факт (6 мес)
      </text>
      <rect x={90} y={H + 24} width={8} height={8} fill="#bbf7d0" stroke="#16a34a" strokeWidth="1" />
      <text x={102} y={H + 32} fontSize="9" fill="#6b7280">
        Прогноз на год
      </text>
    </svg>
  );
}

// ─── Основной компонент ────────────────────────────────────────────────────────

export default function PartnerPage() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [showForecast, setShowForecast] = useState(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawDetails, setWithdrawDetails] = useState('');
  const [withdrawError, setWithdrawError] = useState('');

  const { data: info, isLoading } = useQuery<ReferralInfo>({
    queryKey: ['partner-referral'],
    queryFn: () => referralApi.getInfo() as any,
  });

  const generateMutation = useMutation({
    mutationFn: () => referralApi.generateCode() as any,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['partner-referral'] }),
  });

  const withdrawMutation = useMutation({
    mutationFn: ({ amount, paymentDetails }: { amount: number; paymentDetails?: string }) =>
      referralApi.requestWithdrawal(amount, paymentDetails) as any,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['partner-referral'] });
      setShowWithdrawModal(false);
      setWithdrawAmount('');
      setWithdrawDetails('');
      setWithdrawError('');
    },
    onError: (err: any) => setWithdrawError(err.message || 'Ошибка'),
  });

  const siteOrigin =
    typeof window !== 'undefined' ? window.location.origin : 'https://nakryto.ru';
  const referralLink = info?.referralCode ? `${siteOrigin}/?ref=${info.referralCode}` : null;

  const copy = (text: string, type: 'code' | 'link') => {
    navigator.clipboard.writeText(text);
    if (type === 'code') {
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } else {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  const handleWithdraw = () => {
    setWithdrawError('');
    const amount = parseFloat(withdrawAmount);
    if (!amount || amount < 100) {
      setWithdrawError('Минимальная сумма вывода — 100 ₽');
      return;
    }
    if (info && amount > info.referralBalance) {
      setWithdrawError(`Недостаточно средств. Доступно: ${info.referralBalance} ₽`);
      return;
    }
    withdrawMutation.mutate({ amount, paymentDetails: withdrawDetails || undefined });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-60 text-gray-400">Загрузка...</div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Заголовок */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Реферальная программа</h1>
          <p className="text-gray-500 mt-0.5 text-sm">
            Привет, {user?.name}! Привлекайте рестораны и зарабатывайте.
          </p>
        </div>
        {(info?.referralBalance ?? 0) >= 100 && (
          <button
            onClick={() => setShowWithdrawModal(true)}
            className="bg-green-600 hover:bg-green-700 text-white font-medium px-4 py-2 rounded-lg text-sm transition-colors"
          >
            💳 Вывести средства
          </button>
        )}
      </div>

      {/* Как это работает */}
      <div className="bg-violet-50 border border-violet-100 rounded-xl p-5">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm text-violet-800">
          <div className="flex gap-3">
            <span className="text-2xl shrink-0">🔗</span>
            <div>
              <p className="font-medium">Делитесь ссылкой</p>
              <p className="text-violet-600 mt-0.5">Отправьте реферальную ссылку владельцам ресторанов</p>
            </div>
          </div>
          <div className="flex gap-3">
            <span className="text-2xl shrink-0">💸</span>
            <div>
              <p className="font-medium">Скидка 50% для них</p>
              <p className="text-violet-600 mt-0.5">Рефералы получают скидку на первую покупку тарифа</p>
            </div>
          </div>
          <div className="flex gap-3">
            <span className="text-2xl shrink-0">💰</span>
            <div>
              <p className="font-medium">20% комиссия вам</p>
              <p className="text-violet-600 mt-0.5">Вы получаете 20% от всех платежей ваших рефералов</p>
            </div>
          </div>
        </div>
      </div>

      {/* Реф-код и ссылка */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
        <h2 className="font-semibold text-gray-900">Ваши реферальные данные</h2>

        {!info?.referralCode ? (
          <div className="text-center py-6">
            <p className="text-gray-500 mb-4">У вас ещё нет реферального кода</p>
            <button
              onClick={() => generateMutation.mutate()}
              disabled={generateMutation.isPending}
              className="bg-violet-600 hover:bg-violet-700 text-white font-medium px-6 py-2.5 rounded-lg transition-colors disabled:opacity-50"
            >
              {generateMutation.isPending ? 'Генерируем...' : 'Получить реферальный код'}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="block text-sm text-gray-500 mb-1">Реферальный код</label>
              <div className="flex items-center gap-2">
                <div className="flex-1 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg font-mono text-lg font-bold tracking-widest text-gray-900">
                  {info.referralCode}
                </div>
                <button
                  onClick={() => copy(info.referralCode!, 'code')}
                  className="px-4 py-2.5 border border-gray-200 rounded-lg text-sm hover:bg-gray-50 transition-colors"
                >
                  {copiedCode ? '✓ Скопировано' : '📋 Копировать'}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm text-gray-500 mb-1">Реферальная ссылка</label>
              <div className="flex items-center gap-2">
                <div className="flex-1 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700 truncate">
                  {referralLink}
                </div>
                <button
                  onClick={() => copy(referralLink!, 'link')}
                  className="px-4 py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-sm transition-colors shrink-0"
                >
                  {copiedLink ? '✓ Скопировано' : '🔗 Копировать ссылку'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Статистика */}
      {info?.referralCode && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-gray-900">{info.totalReferrals}</p>
              <p className="text-sm text-gray-500 mt-1">Привлечено ресторанов</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-gray-900">{info.totalTransactions}</p>
              <p className="text-sm text-gray-500 mt-1">Оплат зафиксировано</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-gray-900">{info.totalEarned.toFixed(0)} ₽</p>
              <p className="text-sm text-gray-500 mt-1">Заработано всего</p>
            </div>
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-green-700">
                {info.referralBalance.toFixed(0)} ₽
              </p>
              <p className="text-sm text-green-600 mt-1">Доступно к выводу</p>
            </div>
          </div>

          {/* График доходов */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-900">Доходы по месяцам</h2>
              <button
                onClick={() => setShowForecast((v) => !v)}
                className={`text-sm px-3 py-1.5 rounded-lg border transition-colors ${
                  showForecast
                    ? 'bg-green-600 text-white border-green-600'
                    : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                {showForecast ? '📈 Прогноз включён' : '📈 Показать прогноз на год'}
              </button>
            </div>

            {showForecast ? (
              <>
                <ForecastChart chartData={info.chartData} forecastData={info.forecastData} />
                {info.totalForecast > 0 && (
                  <div className="mt-3 p-3 bg-green-50 border border-green-100 rounded-lg text-sm text-green-800">
                    <span className="font-medium">Ожидаемый доход на год:</span>{' '}
                    {info.totalForecast.toFixed(0)} ₽ — при условии продления всех текущих тарифов
                  </div>
                )}
                {info.totalForecast === 0 && (
                  <p className="mt-3 text-sm text-gray-400 text-center">
                    Нет ресторанов с платными тарифами, истекающими в ближайшие 12 месяцев
                  </p>
                )}
              </>
            ) : (
              <MonthlyBarChart data={info.chartData} />
            )}
          </div>

          {/* Таблица привлечённых ресторанов */}
          {info.transactions.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <h2 className="font-semibold text-gray-900 mb-4">История начислений</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left py-2.5 pr-4 font-medium text-gray-500">Ресторан</th>
                      <th className="text-left py-2.5 pr-4 font-medium text-gray-500">Тариф</th>
                      <th className="text-left py-2.5 pr-4 font-medium text-gray-500">Оплата</th>
                      <th className="text-left py-2.5 pr-4 font-medium text-gray-500">Действует до</th>
                      <th className="text-left py-2.5 pr-4 font-medium text-gray-500">Ваш %</th>
                      <th className="text-right py-2.5 font-medium text-gray-500">Комиссия</th>
                    </tr>
                  </thead>
                  <tbody>
                    {info.transactions.map((t) => {
                      const restaurant = t.referralUser.restaurant;
                      const planExpiresAt = restaurant?.planExpiresAt
                        ? new Date(restaurant.planExpiresAt).toLocaleDateString('ru')
                        : '—';
                      return (
                        <tr
                          key={t.id}
                          className="border-b border-gray-50 hover:bg-gray-50 transition-colors"
                        >
                          <td className="py-3 pr-4">
                            <p className="font-medium text-gray-900">
                              {restaurant?.name ?? t.referralUser.name}
                            </p>
                            {t.isFirstPayment && (
                              <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">
                                первая оплата
                              </span>
                            )}
                            <p className="text-xs text-gray-400">
                              {new Date(t.createdAt).toLocaleDateString('ru')}
                            </p>
                          </td>
                          <td className="py-3 pr-4">
                            <span className="text-gray-700">
                              {PLAN_LABELS[t.planName] ?? t.planName}
                            </span>
                          </td>
                          <td className="py-3 pr-4 text-gray-700">
                            {Number(t.paymentAmount).toFixed(0)} ₽
                            {t.discountRate && (
                              <span className="ml-1 text-xs text-orange-600">
                                (скидка {t.discountRate}%)
                              </span>
                            )}
                          </td>
                          <td className="py-3 pr-4 text-gray-600">{planExpiresAt}</td>
                          <td className="py-3 pr-4 text-gray-600">{t.commissionRate}%</td>
                          <td className="py-3 text-right font-semibold text-green-600">
                            +{Number(t.commissionAmount).toFixed(0)} ₽
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Прогноз в виде таблицы (когда включён) */}
          {showForecast && info.forecastData.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <h2 className="font-semibold text-gray-900 mb-4">
                Прогноз продлений на год
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left py-2.5 pr-4 font-medium text-gray-500">Ресторан</th>
                      <th className="text-left py-2.5 pr-4 font-medium text-gray-500">Тариф</th>
                      <th className="text-left py-2.5 pr-4 font-medium text-gray-500">Истекает</th>
                      <th className="text-right py-2.5 font-medium text-gray-500">Ожид. комиссия</th>
                    </tr>
                  </thead>
                  <tbody>
                    {info.forecastData.map((f, i) => (
                      <tr key={i} className="border-b border-gray-50">
                        <td className="py-3 pr-4 font-medium text-gray-900">{f.restaurantName}</td>
                        <td className="py-3 pr-4 text-gray-700">
                          {PLAN_LABELS[f.planName] ?? f.planName}
                        </td>
                        <td className="py-3 pr-4 text-gray-600">
                          {new Date(f.date).toLocaleDateString('ru')}
                        </td>
                        <td className="py-3 text-right font-semibold text-green-600">
                          ~{f.expectedCommission.toFixed(0)} ₽
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-green-50">
                      <td colSpan={3} className="py-2.5 pr-4 text-sm font-medium text-green-800 pl-4">
                        Итого прогноз
                      </td>
                      <td className="py-2.5 text-right font-bold text-green-700">
                        ~{info.totalForecast.toFixed(0)} ₽
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-gray-400 mt-3">
                * Прогноз рассчитан исходя из текущих тарифов и ставки комиссии. Фактические суммы
                могут отличаться.
              </p>
            </div>
          )}

          {/* История выводов */}
          {info.withdrawals.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <h2 className="font-semibold text-gray-900 mb-4">Заявки на вывод</h2>
              <div className="space-y-2">
                {info.withdrawals.map((w) => (
                  <div
                    key={w.id}
                    className="flex items-center justify-between py-2.5 border-b border-gray-100 last:border-0"
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {Number(w.amount).toFixed(0)} ₽
                      </p>
                      {w.adminNote && (
                        <p className="text-xs text-gray-500">{w.adminNote}</p>
                      )}
                      <p className="text-xs text-gray-400">
                        {new Date(w.createdAt).toLocaleDateString('ru')}
                      </p>
                    </div>
                    <span
                      className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                        WITHDRAWAL_STATUS_COLORS[w.status] || 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {WITHDRAWAL_STATUS_LABELS[w.status] || w.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Модал вывода */}
      {showWithdrawModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Запрос на вывод средств</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Сумма (₽)</label>
                <input
                  type="number"
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(e.target.value)}
                  min={100}
                  max={info?.referralBalance}
                  placeholder="Минимум 100 ₽"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
                <p className="text-xs text-gray-400 mt-1">
                  Доступно: {info?.referralBalance.toFixed(0)} ₽
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Реквизиты для перевода
                </label>
                <textarea
                  value={withdrawDetails}
                  onChange={(e) => setWithdrawDetails(e.target.value)}
                  rows={3}
                  placeholder="Номер карты, телефон для СБП или другие реквизиты"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 text-sm resize-none"
                />
              </div>
              {withdrawError && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                  {withdrawError}
                </div>
              )}
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowWithdrawModal(false);
                  setWithdrawError('');
                }}
                className="flex-1 px-4 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Отмена
              </button>
              <button
                onClick={handleWithdraw}
                disabled={withdrawMutation.isPending}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white font-medium px-4 py-2.5 rounded-lg text-sm transition-colors disabled:opacity-50"
              >
                {withdrawMutation.isPending ? 'Отправляем...' : 'Отправить заявку'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
