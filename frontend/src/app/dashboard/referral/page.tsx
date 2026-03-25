'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { referralApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

interface Transaction {
  id: string;
  commissionAmount: number;
  commissionRate: number;
  paymentAmount: number;
  planName: string;
  isFirstPayment: boolean;
  discountRate?: number;
  createdAt: string;
  referralUser: { name: string; restaurant: { name: string } };
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
  referralDiscountUsed: boolean;
  transactions: Transaction[];
  withdrawals: Withdrawal[];
}

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

export default function ReferralPage() {
  const { can, user } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();
  const hasAccess = can('manageSettings');

  const [copied, setCopied] = useState(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawDetails, setWithdrawDetails] = useState('');
  const [withdrawError, setWithdrawError] = useState('');

  useEffect(() => {
    if (!hasAccess) router.replace('/dashboard');
  }, [hasAccess, router]);

  const { data: info, isLoading } = useQuery<ReferralInfo>({
    queryKey: ['referral'],
    queryFn: () => referralApi.getInfo() as any,
    enabled: hasAccess,
  });

  const generateMutation = useMutation({
    mutationFn: () => referralApi.generateCode() as any,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['referral'] }),
  });

  const withdrawMutation = useMutation({
    mutationFn: ({ amount, paymentDetails }: { amount: number; paymentDetails?: string }) =>
      referralApi.requestWithdrawal(amount, paymentDetails) as any,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['referral'] });
      setShowWithdrawModal(false);
      setWithdrawAmount('');
      setWithdrawDetails('');
      setWithdrawError('');
    },
    onError: (err: any) => setWithdrawError(err.message || 'Ошибка'),
  });

  const siteOrigin = typeof window !== 'undefined' ? window.location.origin : 'https://nakryto.ru';
  const referralLink = info?.referralCode ? `${siteOrigin}/?ref=${info.referralCode}` : null;

  const copyLink = () => {
    if (!referralLink) return;
    navigator.clipboard.writeText(referralLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const copyCode = () => {
    if (!info?.referralCode) return;
    navigator.clipboard.writeText(info.referralCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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

  if (!hasAccess) return null;

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center h-40 text-gray-400">
        Загрузка...
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Реферальная программа</h1>

      {/* Блок "Как это работает" */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-5">
        <h2 className="font-semibold text-blue-900 mb-3">Как это работает</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-blue-800">
          <div className="flex gap-3">
            <span className="text-2xl">🔗</span>
            <div>
              <p className="font-medium">Делитесь ссылкой</p>
              <p className="text-blue-600 mt-1">Отправьте реферальную ссылку другим владельцам ресторанов</p>
            </div>
          </div>
          <div className="flex gap-3">
            <span className="text-2xl">💸</span>
            <div>
              <p className="font-medium">Скидка 50% для них</p>
              <p className="text-blue-600 mt-1">Ваши рефералы получают скидку на первую покупку тарифа</p>
            </div>
          </div>
          <div className="flex gap-3">
            <span className="text-2xl">💰</span>
            <div>
              <p className="font-medium">20% комиссия вам</p>
              <p className="text-blue-600 mt-1">Вы получаете 20% от всех платежей привлечённых вами клиентов</p>
            </div>
          </div>
        </div>
      </div>

      {/* Реферальный код и ссылка */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
        <h2 className="font-semibold text-gray-900">Ваши реферальные данные</h2>

        {!info?.referralCode ? (
          <div className="text-center py-6">
            <p className="text-gray-500 mb-4">У вас ещё нет реферального кода</p>
            <button
              onClick={() => generateMutation.mutate()}
              disabled={generateMutation.isPending}
              className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-6 py-2.5 rounded-lg transition-colors disabled:opacity-50"
            >
              {generateMutation.isPending ? 'Генерируем...' : 'Получить реферальный код'}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Код */}
            <div>
              <label className="block text-sm text-gray-500 mb-1">Ваш реферальный код</label>
              <div className="flex items-center gap-2">
                <div className="flex-1 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg font-mono text-lg font-bold tracking-widest text-gray-900">
                  {info.referralCode}
                </div>
                <button
                  onClick={copyCode}
                  className="px-4 py-2.5 border border-gray-200 rounded-lg text-sm hover:bg-gray-50 transition-colors"
                >
                  {copied ? '✓ Скопировано' : '📋 Копировать'}
                </button>
              </div>
            </div>

            {/* Ссылка */}
            <div>
              <label className="block text-sm text-gray-500 mb-1">Реферальная ссылка</label>
              <div className="flex items-center gap-2">
                <div className="flex-1 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700 truncate">
                  {referralLink}
                </div>
                <button
                  onClick={copyLink}
                  className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm transition-colors flex-shrink-0"
                >
                  {copied ? '✓ Скопировано' : '🔗 Копировать ссылку'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Статистика и баланс */}
      {info?.referralCode && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-gray-900">{info.totalReferrals}</p>
              <p className="text-sm text-gray-500 mt-1">Рефералов</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-gray-900">{info.totalTransactions}</p>
              <p className="text-sm text-gray-500 mt-1">Оплат</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-gray-900">{info.totalEarned.toFixed(0)} ₽</p>
              <p className="text-sm text-gray-500 mt-1">Заработано всего</p>
            </div>
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-green-700">{info.referralBalance.toFixed(0)} ₽</p>
              <p className="text-sm text-green-600 mt-1">Баланс</p>
            </div>
          </div>

          {/* Кнопка вывода */}
          {info.referralBalance >= 100 && (
            <div className="flex justify-end">
              <button
                onClick={() => setShowWithdrawModal(true)}
                className="bg-green-600 hover:bg-green-700 text-white font-medium px-6 py-2.5 rounded-lg transition-colors"
              >
                💳 Запросить вывод средств
              </button>
            </div>
          )}

          {/* История транзакций */}
          {info.transactions.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <h2 className="font-semibold text-gray-900 mb-4">История начислений</h2>
              <div className="space-y-2">
                {info.transactions.map((t) => (
                  <div key={t.id} className="flex items-center justify-between py-2.5 border-b border-gray-100 last:border-0">
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {t.referralUser.restaurant.name}
                        {t.isFirstPayment && (
                          <span className="ml-2 text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">первая оплата</span>
                        )}
                      </p>
                      <p className="text-xs text-gray-500">
                        Тариф {t.planName} · {t.commissionRate}% от {t.paymentAmount} ₽
                        {t.discountRate && ` · скидка ${t.discountRate}% для реферала`}
                      </p>
                      <p className="text-xs text-gray-400">{new Date(t.createdAt).toLocaleDateString('ru')}</p>
                    </div>
                    <span className="text-green-600 font-semibold">+{Number(t.commissionAmount).toFixed(0)} ₽</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* История выводов */}
          {info.withdrawals.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <h2 className="font-semibold text-gray-900 mb-4">Заявки на вывод</h2>
              <div className="space-y-2">
                {info.withdrawals.map((w) => (
                  <div key={w.id} className="flex items-center justify-between py-2.5 border-b border-gray-100 last:border-0">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{Number(w.amount).toFixed(0)} ₽</p>
                      {w.adminNote && <p className="text-xs text-gray-500">{w.adminNote}</p>}
                      <p className="text-xs text-gray-400">{new Date(w.createdAt).toLocaleDateString('ru')}</p>
                    </div>
                    <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${WITHDRAWAL_STATUS_COLORS[w.status] || 'bg-gray-100 text-gray-600'}`}>
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
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Сумма (₽)
                </label>
                <input
                  type="number"
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(e.target.value)}
                  min={100}
                  max={info?.referralBalance}
                  placeholder="Минимум 100 ₽"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-400 mt-1">Доступно: {info?.referralBalance.toFixed(0)} ₽</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Реквизиты для перевода
                </label>
                <textarea
                  value={withdrawDetails}
                  onChange={(e) => setWithdrawDetails(e.target.value)}
                  rows={3}
                  placeholder="Номер карты, телефон для СБП, или другие реквизиты"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm resize-none"
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
                onClick={() => { setShowWithdrawModal(false); setWithdrawError(''); }}
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
