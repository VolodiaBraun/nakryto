'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { billingApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';

const PLAN_LABELS: Record<string, string> = {
  FREE: 'Бесплатный',
  STANDARD: 'Стандарт',
  PREMIUM: 'Премиум',
};

const PLAN_COLOR: Record<string, string> = {
  FREE: 'bg-gray-100 text-gray-700',
  STANDARD: 'bg-blue-100 text-blue-700',
  PREMIUM: 'bg-purple-100 text-purple-700',
};

function CardForm({ onAdd }: { onAdd: () => void }) {
  const [number, setNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [name, setName] = useState('');
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: (data: any) => billingApi.addCard(data) as Promise<any>,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['billing', 'summary'] });
      onAdd();
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const [m, y] = expiry.split('/').map((s) => parseInt(s.trim(), 10));
    const last4 = number.replace(/\s/g, '').slice(-4);
    const brand = number.trim().startsWith('4') ? 'Visa' : 'Mastercard';
    mutation.mutate({ last4, brand, expiryMonth: m, expiryYear: 2000 + (y || 0) });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3 pt-3 border-t border-gray-100 mt-3">
      <div>
        <label className="block text-xs text-gray-500 mb-1">Номер карты (демо)</label>
        <input
          value={number}
          onChange={(e) => setNumber(e.target.value)}
          placeholder="0000 0000 0000 0000"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          maxLength={19}
          required
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Срок (ММ/ГГ)</label>
          <input
            value={expiry}
            onChange={(e) => setExpiry(e.target.value)}
            placeholder="12/28"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            maxLength={5}
            required
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Имя на карте</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="IVAN IVANOV"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={mutation.isPending}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {mutation.isPending ? 'Добавляем...' : 'Привязать карту'}
        </button>
        <button type="button" onClick={onAdd} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">
          Отмена
        </button>
      </div>
      {mutation.isError && (
        <p className="text-red-600 text-sm">{(mutation.error as any)?.message}</p>
      )}
    </form>
  );
}

function UpgradeModal({
  currentPlan,
  prices,
  balance,
  onClose,
}: {
  currentPlan: string;
  prices: Record<string, number>;
  balance: number;
  onClose: () => void;
}) {
  const [selectedPlan, setSelectedPlan] = useState<string>('');
  const [referralCode, setReferralCode] = useState('');
  const [error, setError] = useState('');
  const qc = useQueryClient();

  const plans = Object.entries(prices).filter(([p]) => p !== 'FREE' && p !== currentPlan);

  const mutation = useMutation({
    mutationFn: ({ plan, code }: { plan: string; code?: string }) =>
      billingApi.upgradePlan(plan, code || undefined) as Promise<any>,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['billing', 'summary'] });
      qc.invalidateQueries({ queryKey: ['billing', 'limit-status'] });
      onClose();
    },
    onError: (e: any) => setError(e?.message || 'Ошибка оплаты'),
  });

  const price = selectedPlan ? prices[selectedPlan] : 0;
  const canAfford = balance >= price;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Выбор тарифа</h2>

        <div className="space-y-2 mb-4">
          {plans.map(([plan, p]) => (
            <button
              key={plan}
              onClick={() => setSelectedPlan(plan)}
              className={cn(
                'w-full text-left border rounded-xl p-4 transition-colors',
                selectedPlan === plan
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300',
              )}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-gray-900">{PLAN_LABELS[plan] ?? plan}</span>
                <span className="text-blue-600 font-semibold">{p.toLocaleString('ru')} ₽/мес</span>
              </div>
              {plan === 'STANDARD' && (
                <p className="text-xs text-gray-500 mt-1">3 зала · Безлимит броней</p>
              )}
              {plan === 'PREMIUM' && (
                <p className="text-xs text-gray-500 mt-1">Безлимит залов · Безлимит броней</p>
              )}
            </button>
          ))}
        </div>

        <div className="mb-4">
          <label className="block text-xs text-gray-500 mb-1">Реферальный код (необязательно)</label>
          <input
            value={referralCode}
            onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
            placeholder="ABCD1234"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="text-xs text-gray-400 mt-1">Скидка 50% на первую оплату при наличии кода</p>
        </div>

        {selectedPlan && (
          <div className={cn('rounded-lg p-3 mb-4 text-sm', canAfford ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800')}>
            {canAfford
              ? `Будет списано ${price.toLocaleString('ru')} ₽. На балансе останется ${(balance - price).toLocaleString('ru')} ₽`
              : `Недостаточно средств. Нужно ${price.toLocaleString('ru')} ₽, на балансе ${balance.toLocaleString('ru')} ₽`}
          </div>
        )}

        {error && <p className="text-red-600 text-sm mb-3">{error}</p>}

        <div className="flex gap-2">
          <button
            onClick={() => mutation.mutate({ plan: selectedPlan, code: referralCode })}
            disabled={!selectedPlan || !canAfford || mutation.isPending}
            className="flex-1 bg-blue-600 text-white py-2.5 rounded-xl font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {mutation.isPending ? 'Оплата...' : 'Оплатить с баланса'}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2.5 border border-gray-300 rounded-xl text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
}

export default function BillingPage() {
  const { user } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();
  const [showCardForm, setShowCardForm] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [topUpAmount, setTopUpAmount] = useState('');
  const [topUpError, setTopUpError] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['billing', 'summary'],
    queryFn: () => billingApi.getSummary() as Promise<any>,
    enabled: !!user,
  });

  const removeCardMutation = useMutation({
    mutationFn: (id: string) => billingApi.removeCard(id) as Promise<any>,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['billing', 'summary'] }),
  });

  const setDefaultMutation = useMutation({
    mutationFn: (id: string) => billingApi.setDefaultCard(id) as Promise<any>,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['billing', 'summary'] }),
  });

  const billingTypeMutation = useMutation({
    mutationFn: (type: 'CARD' | 'LEGAL_ENTITY') => billingApi.setBillingType(type) as Promise<any>,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['billing', 'summary'] }),
  });

  const topUpMutation = useMutation({
    mutationFn: (amount: number) => billingApi.topUp(amount) as Promise<any>,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['billing', 'summary'] });
      setTopUpAmount('');
    },
    onError: (e: any) => setTopUpError(e?.message || 'Ошибка'),
  });

  if (user?.role !== 'OWNER') {
    return (
      <div className="p-8 text-center text-gray-500">
        Этот раздел доступен только владельцу ресторана.
      </div>
    );
  }

  if (isLoading || !data) {
    return (
      <div className="p-8 flex justify-center">
        <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const { balance, billingType, cards, restaurant, limitStatus, prices } = data;
  const plan = restaurant.plan as string;
  const planExpiresAt = restaurant.planExpiresAt;

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Тариф и баланс</h1>

      {/* Current plan */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm text-gray-500 mb-1">Текущий тариф</p>
            <div className="flex items-center gap-2">
              <span className={cn('text-xl font-bold', plan === 'FREE' ? 'text-gray-700' : plan === 'STANDARD' ? 'text-blue-700' : 'text-purple-700')}>
                {PLAN_LABELS[plan] ?? plan}
              </span>
              {planExpiresAt && (
                <span className="text-xs text-gray-400">
                  до {new Date(planExpiresAt).toLocaleDateString('ru')}
                </span>
              )}
            </div>
            {limitStatus && (
              <div className="mt-2 space-y-1 text-sm text-gray-600">
                {limitStatus.bookingLimit !== null && (
                  <p>
                    Брони: {limitStatus.bookingsUsed}/{limitStatus.bookingLimit} в этом месяце
                    {limitStatus.bookingLimitExceeded && (
                      <span className="ml-2 text-red-600 font-medium">· Лимит исчерпан</span>
                    )}
                  </p>
                )}
                {limitStatus.hallLimit !== null && (
                  <p>Залы: {limitStatus.hallsUsed}/{limitStatus.hallLimit}</p>
                )}
                {limitStatus.bookingLimit === null && limitStatus.hallLimit === null && (
                  <p className="text-green-600">Безлимитный тариф</p>
                )}
              </div>
            )}
          </div>
          {plan !== 'PREMIUM' && (
            <button
              onClick={() => setShowUpgrade(true)}
              className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors flex-shrink-0"
            >
              Улучшить тариф
            </button>
          )}
        </div>

        {/* Plan comparison */}
        <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
          {Object.entries(PLAN_LABELS).map(([p, label]) => (
            <div
              key={p}
              className={cn(
                'rounded-xl p-3 border',
                p === plan
                  ? 'border-blue-300 bg-blue-50'
                  : 'border-gray-100 bg-gray-50',
              )}
            >
              <p className="font-medium text-gray-800 mb-1">{label}</p>
              <p className="text-gray-500">
                {p === 'FREE' ? '0 ₽' : `${(prices[p] ?? 0).toLocaleString('ru')} ₽/мес`}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Balance */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-sm text-gray-500">Баланс</p>
            <p className="text-3xl font-bold text-gray-900">{(balance ?? 0).toLocaleString('ru')} ₽</p>
          </div>
        </div>

        <div className="flex items-end gap-3">
          <div className="flex-1">
            <label className="block text-xs text-gray-500 mb-1">Сумма пополнения (₽)</label>
            <input
              type="number"
              min={100}
              value={topUpAmount}
              onChange={(e) => { setTopUpAmount(e.target.value); setTopUpError(''); }}
              placeholder="1000"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            onClick={() => topUpMutation.mutate(parseInt(topUpAmount, 10))}
            disabled={!topUpAmount || parseInt(topUpAmount, 10) < 100 || topUpMutation.isPending}
            className="bg-green-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition-colors"
          >
            {topUpMutation.isPending ? 'Пополняем...' : 'Пополнить'}
          </button>
        </div>
        {topUpError && <p className="text-red-600 text-sm mt-2">{topUpError}</p>}
        <p className="text-xs text-gray-400 mt-2">
          Демо-режим: пополнение мгновенное без реальной оплаты.
        </p>
      </div>

      {/* Payment method */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-4">Способ оплаты</h2>

        {/* Billing type toggle */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => billingTypeMutation.mutate('CARD')}
            className={cn(
              'px-4 py-2 rounded-xl text-sm font-medium transition-colors',
              billingType === 'CARD' || !billingType
                ? 'bg-blue-100 text-blue-700'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
            )}
          >
            💳 Банковская карта
          </button>
          <button
            onClick={() => billingTypeMutation.mutate('LEGAL_ENTITY')}
            className={cn(
              'px-4 py-2 rounded-xl text-sm font-medium transition-colors',
              billingType === 'LEGAL_ENTITY'
                ? 'bg-blue-100 text-blue-700'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
            )}
          >
            🏢 Юридическое лицо
          </button>
        </div>

        {billingType === 'LEGAL_ENTITY' ? (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
            <p className="font-medium mb-1">Оплата для юридических лиц</p>
            <p>
              Для выставления счёта напишите нам на{' '}
              <a href="mailto:billing@nakryto.ru" className="underline">billing@nakryto.ru</a>{' '}
              с указанием реквизитов вашей организации. Мы подготовим договор и счёт на оплату.
            </p>
          </div>
        ) : (
          <>
            {cards && cards.length > 0 && (
              <div className="space-y-2 mb-3">
                {cards.map((card: any) => (
                  <div key={card.id} className="flex items-center justify-between p-3 border border-gray-200 rounded-xl">
                    <div className="flex items-center gap-3">
                      <span className="text-lg">{card.brand === 'Visa' ? '💳' : '💳'}</span>
                      <div>
                        <p className="text-sm font-medium text-gray-800">
                          {card.brand} •••• {card.last4}
                          {card.isDefault && (
                            <span className="ml-2 text-xs text-blue-600 font-medium">основная</span>
                          )}
                        </p>
                        <p className="text-xs text-gray-400">
                          {String(card.expiryMonth).padStart(2, '0')}/{String(card.expiryYear).slice(-2)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {!card.isDefault && (
                        <button
                          onClick={() => setDefaultMutation.mutate(card.id)}
                          className="text-xs text-blue-600 hover:text-blue-800"
                        >
                          Сделать основной
                        </button>
                      )}
                      <button
                        onClick={() => removeCardMutation.mutate(card.id)}
                        className="text-xs text-gray-400 hover:text-red-600"
                      >
                        Удалить
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {!showCardForm ? (
              <button
                onClick={() => setShowCardForm(true)}
                className="text-sm text-blue-600 hover:text-blue-800 font-medium"
              >
                + Добавить карту
              </button>
            ) : (
              <CardForm onAdd={() => setShowCardForm(false)} />
            )}
          </>
        )}
      </div>

      {/* Transactions */}
      <TransactionHistory />

      {showUpgrade && (
        <UpgradeModal
          currentPlan={plan}
          prices={prices}
          balance={balance}
          onClose={() => setShowUpgrade(false)}
        />
      )}
    </div>
  );
}

function TransactionHistory() {
  const { data, isLoading } = useQuery({
    queryKey: ['billing', 'transactions'],
    queryFn: () => billingApi.getTransactions({ limit: 10 }) as Promise<any>,
  });

  if (isLoading) return null;
  if (!data?.items?.length) return null;

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6">
      <h2 className="text-base font-semibold text-gray-900 mb-4">История операций</h2>
      <div className="space-y-2">
        {data.items.map((tx: any) => (
          <div key={tx.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
            <div>
              <p className="text-sm text-gray-800">{tx.description}</p>
              <p className="text-xs text-gray-400">
                {new Date(tx.createdAt).toLocaleDateString('ru', {
                  day: '2-digit', month: 'short', year: 'numeric',
                })}
              </p>
            </div>
            <span className={cn(
              'text-sm font-semibold',
              Number(tx.amount) > 0 ? 'text-green-600' : 'text-red-600',
            )}>
              {Number(tx.amount) > 0 ? '+' : ''}{Number(tx.amount).toLocaleString('ru')} ₽
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
