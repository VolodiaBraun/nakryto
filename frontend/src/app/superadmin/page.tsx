'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useSuperAdmin } from '@/context/SuperAdminContext';
import { superadminApi, ApiError } from '@/lib/api';

const PLAN_COLORS: Record<string, string> = {
  FREE: 'bg-gray-100 text-gray-600',
  STANDARD: 'bg-blue-50 text-blue-700',
  PREMIUM: 'bg-orange-50 text-orange-700',
};

interface Restaurant {
  id: string;
  name: string;
  slug: string;
  plan: string;
  ownerEmail: string | null;
  ownerUserId: string | null;
  ownerBalance: number | null;
  hallCount: number;
  bookings30d: number;
  createdAt: string;
  telegramBotActive: boolean;
  maxBotActive: boolean;
}

interface Stats {
  totalRestaurants: number;
  totalBookings: number;
  perPlan: Record<string, number>;
}

interface RestaurantsResponse {
  items: Restaurant[];
  total: number;
  page: number;
  limit: number;
}

interface PricingPlan {
  id: string;
  name: string;
  price: string;
  period: string;
  highlight: boolean;
  features: string[];
}

interface LandingSettings {
  showPricing: boolean;
  pricingTitle: string;
  pricingSubtitle: string;
  plans: PricingPlan[];
  supportEmail?: string;
  privacyPolicy?: string;
  personalDataPolicy?: string;
}

type Tab = 'restaurants' | 'landing' | 'content' | 'referrers' | 'withdrawals' | 'plan-config' | 'logs';

interface Referrer {
  id: string;
  name: string;
  email: string;
  isPartner?: boolean;
  restaurantName?: string;
  referralCode: string | null;
  balance: number;
  totalPaid: number;
  referredCount: number;
  transactionCount: number;
  customReferralConditions: boolean;
  customCommissionRate: number | null;
  customDiscountRate: number | null;
}

interface Withdrawal {
  id: string;
  amount: number;
  status: string;
  paymentDetails?: string;
  adminNote?: string;
  processedAt?: string;
  createdAt: string;
  user: { name: string; email: string; restaurant?: { name: string } };
}

interface ReferralSettings {
  referralDiscountPercent: number;
  referralCommissionPercent: number;
}

export default function SuperAdminPage() {
  const { logout } = useSuperAdmin();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>('restaurants');

  // ─── Рестораны ─────────────────────────────────────────────────────────────
  const [stats, setStats] = useState<Stats | null>(null);
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [updatingPlan, setUpdatingPlan] = useState<string | null>(null);

  // ─── Реферальная программа ─────────────────────────────────────────────────
  const [referralSettings, setReferralSettings] = useState<ReferralSettings | null>(null);
  const [referralSaving, setReferralSaving] = useState(false);
  const [referralSaved, setReferralSaved] = useState(false);
  const [referrers, setReferrers] = useState<Referrer[]>([]);
  const [referrersTotal, setReferrersTotal] = useState(0);
  const [referrersLoading, setReferrersLoading] = useState(false);
  const [referrersSearch, setReferrersSearch] = useState('');
  const [editingReferrer, setEditingReferrer] = useState<Referrer | null>(null);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [withdrawalsTotal, setWithdrawalsTotal] = useState(0);
  const [withdrawalsLoading, setWithdrawalsLoading] = useState(false);
  const [withdrawalStatusFilter, setWithdrawalStatusFilter] = useState('');
  const [processingWithdrawal, setProcessingWithdrawal] = useState<string | null>(null);

  // ─── Конфиг тарифов ────────────────────────────────────────────────────────
  const [planConfig, setPlanConfig] = useState<{
    limits: Record<string, { maxHalls: number | null; maxBookingsPerMonth: number | null }>;
    prices: Record<string, number>;
  } | null>(null);
  const [planConfigLoading, setPlanConfigLoading] = useState(false);
  const [planConfigSaving, setPlanConfigSaving] = useState(false);
  const [planConfigSaved, setPlanConfigSaved] = useState(false);
  // userId → adjusting balance
  const [adjustingBalance, setAdjustingBalance] = useState<string | null>(null);
  const [balanceAmount, setBalanceAmount] = useState('');
  const [balanceDesc, setBalanceDesc] = useState('');

  // ─── Лендинг ───────────────────────────────────────────────────────────────
  const [landingSettings, setLandingSettings] = useState<LandingSettings | null>(null);
  const [landingLoading, setLandingLoading] = useState(false);
  const [landingSaving, setLandingSaving] = useState(false);
  const [landingSaved, setLandingSaved] = useState(false);
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [newFeatureText, setNewFeatureText] = useState<Record<string, string>>({});

  const handleAuthError = useCallback((err: unknown) => {
    if (err instanceof ApiError && err.status === 401) {
      logout();
      router.replace('/superadmin/login');
    }
  }, [logout, router]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [statsData, listData] = await Promise.all([
        superadminApi.getStats() as Promise<Stats>,
        superadminApi.getRestaurants({ page, limit: 20, search: search || undefined }) as Promise<RestaurantsResponse>,
      ]);
      setStats(statsData);
      setRestaurants(listData.items);
      setTotal(listData.total);
    } catch (err) {
      handleAuthError(err);
    } finally {
      setLoading(false);
    }
  }, [page, search, handleAuthError]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const loadLandingSettings = useCallback(async () => {
    if (landingSettings) return;
    setLandingLoading(true);
    try {
      const data = await superadminApi.getLandingSettings() as LandingSettings;
      setLandingSettings(data);
    } catch (err) {
      handleAuthError(err);
    } finally {
      setLandingLoading(false);
    }
  }, [landingSettings, handleAuthError]);

  useEffect(() => {
    if (activeTab === 'landing' || activeTab === 'content') loadLandingSettings();
  }, [activeTab, loadLandingSettings]);

  const loadPlanConfig = useCallback(async () => {
    if (planConfig) return;
    setPlanConfigLoading(true);
    try {
      const data = await superadminApi.getPlanConfig() as any;
      setPlanConfig(data);
    } catch (err) { handleAuthError(err); } finally { setPlanConfigLoading(false); }
  }, [planConfig, handleAuthError]);

  useEffect(() => {
    if (activeTab === 'plan-config') loadPlanConfig();
  }, [activeTab, loadPlanConfig]);

  async function handleSavePlanConfig() {
    if (!planConfig) return;
    setPlanConfigSaving(true);
    try {
      await superadminApi.updatePlanConfig({ limits: planConfig.limits, prices: planConfig.prices });
      setPlanConfigSaved(true);
      setTimeout(() => setPlanConfigSaved(false), 2000);
    } catch (err) { handleAuthError(err); } finally { setPlanConfigSaving(false); }
  }

  async function handleAdjustBalance(userId: string) {
    const amt = parseFloat(balanceAmount);
    if (!amt || !balanceDesc) return;
    try {
      await superadminApi.adjustUserBalance(userId, { amount: amt, description: balanceDesc });
      setAdjustingBalance(null);
      setBalanceAmount('');
      setBalanceDesc('');
      // refresh restaurants list to show updated balances
      loadData();
    } catch (err) { handleAuthError(err); }
  }

  const loadReferralSettings = useCallback(async () => {
    if (referralSettings) return;
    try {
      const data = await superadminApi.getReferralSettings() as ReferralSettings;
      setReferralSettings(data);
    } catch (err) { handleAuthError(err); }
  }, [referralSettings, handleAuthError]);

  const loadReferrers = useCallback(async () => {
    setReferrersLoading(true);
    try {
      const data = await superadminApi.getReferrers({ search: referrersSearch || undefined }) as any;
      setReferrers(data.items);
      setReferrersTotal(data.total);
    } catch (err) { handleAuthError(err); } finally { setReferrersLoading(false); }
  }, [referrersSearch, handleAuthError]);

  const loadWithdrawals = useCallback(async () => {
    setWithdrawalsLoading(true);
    try {
      const data = await superadminApi.getWithdrawals({ status: withdrawalStatusFilter || undefined }) as any;
      setWithdrawals(data.items);
      setWithdrawalsTotal(data.total);
    } catch (err) { handleAuthError(err); } finally { setWithdrawalsLoading(false); }
  }, [withdrawalStatusFilter, handleAuthError]);

  useEffect(() => {
    if (activeTab === 'referrers') { loadReferralSettings(); loadReferrers(); }
    if (activeTab === 'withdrawals') loadWithdrawals();
  }, [activeTab, loadReferralSettings, loadReferrers, loadWithdrawals]);

  // ─── Логи ──────────────────────────────────────────────────────────────────
  const [logs, setLogs] = useState<any[]>([]);
  const [logsTotal, setLogsTotal] = useState(0);
  const [logsPage, setLogsPage] = useState(1);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsFilter, setLogsFilter] = useState({ action: '', status: '', restaurantName: '', dateFrom: '', dateTo: '' });

  const loadLogs = useCallback(async (page = 1, filter = logsFilter) => {
    setLogsLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '50' });
      if (filter.action) params.set('action', filter.action);
      if (filter.status) params.set('status', filter.status);
      if (filter.restaurantName) params.set('restaurantName', filter.restaurantName);
      if (filter.dateFrom) params.set('dateFrom', filter.dateFrom);
      if (filter.dateTo) params.set('dateTo', filter.dateTo);
      const data = await superadminApi.getAuditLogs(params.toString()) as any;
      setLogs(data.rows);
      setLogsTotal(data.total);
      setLogsPage(page);
    } catch (err) { handleAuthError(err); } finally { setLogsLoading(false); }
  }, [logsFilter, handleAuthError]);

  useEffect(() => {
    if (activeTab === 'logs') loadLogs(1);
  }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSaveReferralSettings() {
    if (!referralSettings) return;
    setReferralSaving(true);
    try {
      await superadminApi.updateReferralSettings(referralSettings);
      setReferralSaved(true);
      setTimeout(() => setReferralSaved(false), 2000);
    } catch (err) { handleAuthError(err); } finally { setReferralSaving(false); }
  }

  async function handleSaveReferrerConditions() {
    if (!editingReferrer) return;
    try {
      await superadminApi.updateReferrerConditions(editingReferrer.id, {
        customReferralConditions: editingReferrer.customReferralConditions,
        customCommissionRate: editingReferrer.customCommissionRate,
        customDiscountRate: editingReferrer.customDiscountRate,
      });
      setReferrers((prev) => prev.map((r) => r.id === editingReferrer.id ? editingReferrer : r));
      setEditingReferrer(null);
    } catch (err) { handleAuthError(err); }
  }

  async function handleWithdrawalAction(id: string, status: string, adminNote?: string) {
    setProcessingWithdrawal(id);
    try {
      await superadminApi.updateWithdrawal(id, { status, adminNote });
      await loadWithdrawals();
    } catch (err) { handleAuthError(err); } finally { setProcessingWithdrawal(null); }
  }

  async function handlePlanChange(id: string, plan: string) {
    setUpdatingPlan(id);
    try {
      await superadminApi.updatePlan(id, plan);
      setRestaurants((prev) => prev.map((r) => (r.id === id ? { ...r, plan } : r)));
    } finally {
      setUpdatingPlan(null);
    }
  }

  async function handleSaveLanding() {
    if (!landingSettings) return;
    setLandingSaving(true);
    try {
      await superadminApi.updateLandingSettings(landingSettings);
      setLandingSaved(true);
      setTimeout(() => setLandingSaved(false), 2000);
    } catch (err) {
      handleAuthError(err);
    } finally {
      setLandingSaving(false);
    }
  }

  function updateLanding(patch: Partial<LandingSettings>) {
    setLandingSettings((prev) => prev ? { ...prev, ...patch } : prev);
  }

  function updatePricingPlan(planId: string, patch: Partial<PricingPlan>) {
    setLandingSettings((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        plans: prev.plans.map((p) => (p.id === planId ? { ...p, ...patch } : p)),
      };
    });
  }

  function addPricingPlan() {
    const id = `plan-${Date.now()}`;
    setLandingSettings((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        plans: [
          ...prev.plans,
          { id, name: 'Новый тариф', price: '0 ₽', period: '/мес', highlight: false, features: [] },
        ],
      };
    });
    setEditingPlanId(id);
  }

  function removePricingPlan(planId: string) {
    setLandingSettings((prev) => {
      if (!prev) return prev;
      return { ...prev, plans: prev.plans.filter((p) => p.id !== planId) };
    });
  }

  function addFeature(planId: string) {
    const text = (newFeatureText[planId] || '').trim();
    if (!text) return;
    updatePricingPlan(planId, {
      features: [...(landingSettings?.plans.find((p) => p.id === planId)?.features ?? []), text],
    });
    setNewFeatureText((prev) => ({ ...prev, [planId]: '' }));
  }

  function removeFeature(planId: string, idx: number) {
    const plan = landingSettings?.plans.find((p) => p.id === planId);
    if (!plan) return;
    updatePricingPlan(planId, { features: plan.features.filter((_, i) => i !== idx) });
  }

  function movePlan(planId: string, dir: -1 | 1) {
    setLandingSettings((prev) => {
      if (!prev) return prev;
      const plans = [...prev.plans];
      const idx = plans.findIndex((p) => p.id === planId);
      const newIdx = idx + dir;
      if (newIdx < 0 || newIdx >= plans.length) return prev;
      [plans[idx], plans[newIdx]] = [plans[newIdx], plans[idx]];
      return { ...prev, plans };
    });
  }

  function handleLogout() {
    logout();
    router.replace('/superadmin/login');
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Шапка */}
      <header className="border-b border-gray-800 px-6 h-14 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <div className="text-sm font-semibold text-orange-400">Накрыто — Суперадмин</div>
          <nav className="flex gap-1">
            {([['restaurants', 'Рестораны'], ['landing', 'Лендинг'], ['content', 'Контент'], ['referrers', 'Рефералы'], ['withdrawals', 'Выводы'], ['plan-config', 'Тарифы'], ['logs', 'Логи']] as [Tab, string][]).map(([id, label]) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`text-xs px-3 py-1.5 rounded-md transition-colors ${
                  activeTab === id
                    ? 'bg-gray-700 text-white'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
                }`}
              >
                {label}
              </button>
            ))}
          </nav>
        </div>
        <button
          onClick={handleLogout}
          className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
        >
          Выйти
        </button>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">

        {/* ─── Вкладка: Рестораны ──────────────────────────────────────────── */}
        {activeTab === 'restaurants' && (
          <>
            {stats && (
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                {[
                  { label: 'Ресторанов', value: stats.totalRestaurants },
                  { label: 'Броней всего', value: stats.totalBookings },
                  { label: 'Free', value: stats.perPlan.FREE ?? 0 },
                  { label: 'Стандарт', value: stats.perPlan.STANDARD ?? 0 },
                  { label: 'Премиум', value: stats.perPlan.PREMIUM ?? 0 },
                ].map((s) => (
                  <div key={s.label} className="bg-gray-900 rounded-xl p-4 border border-gray-800">
                    <div className="text-2xl font-bold">{s.value}</div>
                    <div className="text-gray-400 text-xs mt-0.5">{s.label}</div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center gap-3">
              <input
                type="text"
                placeholder="Поиск по названию или slug..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="bg-gray-900 border border-gray-700 text-white text-sm rounded-lg px-3.5 py-2 w-72 focus:outline-none focus:ring-2 focus:ring-orange-500 placeholder-gray-500"
              />
              <div className="text-gray-500 text-sm">{total} ресторанов</div>
            </div>

            <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800 text-gray-400 text-xs uppercase tracking-wide">
                    <th className="text-left px-4 py-3">Ресторан</th>
                    <th className="text-left px-4 py-3">Владелец</th>
                    <th className="text-center px-4 py-3">Залов</th>
                    <th className="text-center px-4 py-3">Бронь/30д</th>
                    <th className="text-center px-4 py-3">Telegram</th>
                    <th className="text-center px-4 py-3">MAX</th>
                    <th className="text-left px-4 py-3">Тариф</th>
                    <th className="text-center px-4 py-3">Баланс</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={8} className="text-center py-12 text-gray-500">Загрузка...</td>
                    </tr>
                  ) : restaurants.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="text-center py-12 text-gray-500">Ничего не найдено</td>
                    </tr>
                  ) : (
                    restaurants.map((r) => (
                      <tr key={r.id} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                        <td className="px-4 py-3">
                          <div className="font-medium text-white">{r.name}</div>
                          <div className="text-gray-500 text-xs mt-0.5">{r.slug}</div>
                        </td>
                        <td className="px-4 py-3 text-gray-400">{r.ownerEmail ?? '—'}</td>
                        <td className="px-4 py-3 text-center text-gray-300">{r.hallCount}</td>
                        <td className="px-4 py-3 text-center text-gray-300">{r.bookings30d}</td>
                        <td className="px-4 py-3 text-center">
                          {r.telegramBotActive ? (
                            <span className="inline-flex items-center gap-1 text-xs text-green-400 font-medium">
                              <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />
                              Подключён
                            </span>
                          ) : (
                            <span className="text-xs text-gray-600">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {r.maxBotActive ? (
                            <span className="inline-flex items-center gap-1 text-xs text-blue-400 font-medium">
                              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 inline-block" />
                              Подключён
                            </span>
                          ) : (
                            <span className="text-xs text-gray-600">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <select
                            value={r.plan}
                            onChange={(e) => handlePlanChange(r.id, e.target.value)}
                            disabled={updatingPlan === r.id}
                            className={`text-xs font-medium px-2.5 py-1 rounded-full border-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:opacity-50 ${PLAN_COLORS[r.plan]}`}
                          >
                            <option value="FREE">Free</option>
                            <option value="STANDARD">Стандарт</option>
                            <option value="PREMIUM">Премиум</option>
                          </select>
                        </td>
                        <td className="px-4 py-3 text-center">
                          {r.ownerUserId ? (
                            <button
                              onClick={() => { setAdjustingBalance(r.ownerUserId!); setBalanceAmount(''); setBalanceDesc(''); }}
                              className="text-xs text-orange-400 hover:text-orange-300"
                              title={`Баланс: ${r.ownerBalance ?? 0} ₽`}
                            >
                              {(r.ownerBalance ?? 0).toLocaleString('ru')} ₽
                            </button>
                          ) : (
                            <span className="text-gray-600 text-xs">—</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {total > 20 && (
              <div className="flex items-center justify-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-1.5 text-sm bg-gray-800 hover:bg-gray-700 disabled:opacity-40 rounded-lg transition-colors"
                >
                  ←
                </button>
                <span className="text-gray-400 text-sm">
                  Стр. {page} из {Math.ceil(total / 20)}
                </span>
                <button
                  onClick={() => setPage((p) => p + 1)}
                  disabled={page >= Math.ceil(total / 20)}
                  className="px-3 py-1.5 text-sm bg-gray-800 hover:bg-gray-700 disabled:opacity-40 rounded-lg transition-colors"
                >
                  →
                </button>
              </div>
            )}
          </>
        )}

        {/* ─── Вкладка: Контент ────────────────────────────────────────────── */}
        {activeTab === 'content' && (
          <div className="max-w-3xl space-y-6">
            {landingLoading ? (
              <div className="text-gray-500 py-12 text-center">Загрузка...</div>
            ) : landingSettings ? (
              <>
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold">Контент и контакты</h2>
                  <button
                    onClick={handleSaveLanding}
                    disabled={landingSaving}
                    className="px-4 py-1.5 text-sm bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white rounded-lg transition-colors"
                  >
                    {landingSaved ? '✓ Сохранено' : landingSaving ? 'Сохранение...' : 'Сохранить'}
                  </button>
                </div>

                {/* Email поддержки */}
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-3">
                  <div className="font-medium">Email технической поддержки</div>
                  <div className="text-xs text-gray-500">Отображается в подвале сайта</div>
                  <input
                    type="email"
                    value={landingSettings.supportEmail ?? ''}
                    onChange={(e) => updateLanding({ supportEmail: e.target.value })}
                    placeholder="info@nakryto.ru"
                    className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>

                {/* Политика конфиденциальности */}
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-3">
                  <div className="font-medium">Политика конфиденциальности</div>
                  <div className="text-xs text-gray-500">Поддерживается Markdown: # заголовок, ## подзаголовок, - список</div>
                  <textarea
                    value={landingSettings.privacyPolicy ?? ''}
                    onChange={(e) => updateLanding({ privacyPolicy: e.target.value })}
                    rows={16}
                    className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500 resize-y font-mono"
                  />
                  <a href="/privacy" target="_blank" className="text-xs text-orange-400 hover:underline">
                    Просмотреть страницу →
                  </a>
                </div>

                {/* Политика обработки ПД */}
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-3">
                  <div className="font-medium">Политика обработки персональных данных</div>
                  <div className="text-xs text-gray-500">Поддерживается Markdown: # заголовок, ## подзаголовок, - список</div>
                  <textarea
                    value={landingSettings.personalDataPolicy ?? ''}
                    onChange={(e) => updateLanding({ personalDataPolicy: e.target.value })}
                    rows={16}
                    className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500 resize-y font-mono"
                  />
                  <a href="/personal-data" target="_blank" className="text-xs text-orange-400 hover:underline">
                    Просмотреть страницу →
                  </a>
                </div>
              </>
            ) : null}
          </div>
        )}

        {/* ─── Вкладка: Рефералы ───────────────────────────────────────────── */}
        {activeTab === 'referrers' && (
          <div className="space-y-6">
            {/* Глобальные настройки */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold">Глобальные условия реферальной программы</h2>
                <button
                  onClick={handleSaveReferralSettings}
                  disabled={referralSaving}
                  className="px-4 py-1.5 text-sm bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white rounded-lg transition-colors"
                >
                  {referralSaved ? '✓ Сохранено' : referralSaving ? 'Сохранение...' : 'Сохранить'}
                </button>
              </div>
              {referralSettings && (
                <div className="grid grid-cols-2 gap-6 max-w-md">
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">Скидка для рефералов (%)</label>
                    <input
                      type="number"
                      min={0} max={100}
                      value={referralSettings.referralDiscountPercent}
                      onChange={(e) => setReferralSettings((prev) => prev ? { ...prev, referralDiscountPercent: Number(e.target.value) } : prev)}
                      className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
                    />
                    <p className="text-xs text-gray-500 mt-1">На первую покупку тарифа</p>
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">Комиссия реферёру (%)</label>
                    <input
                      type="number"
                      min={0} max={100}
                      value={referralSettings.referralCommissionPercent}
                      onChange={(e) => setReferralSettings((prev) => prev ? { ...prev, referralCommissionPercent: Number(e.target.value) } : prev)}
                      className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
                    />
                    <p className="text-xs text-gray-500 mt-1">От каждого платежа реферала</p>
                  </div>
                </div>
              )}
            </div>

            {/* Список реферёров */}
            <div>
              <div className="flex items-center gap-3 mb-4">
                <input
                  type="text"
                  placeholder="Поиск по имени, email, коду..."
                  value={referrersSearch}
                  onChange={(e) => setReferrersSearch(e.target.value)}
                  className="bg-gray-900 border border-gray-700 text-white text-sm rounded-lg px-3.5 py-2 w-72 focus:outline-none focus:ring-2 focus:ring-orange-500 placeholder-gray-500"
                />
                <button onClick={loadReferrers} className="text-xs px-3 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors">
                  Обновить
                </button>
                <div className="text-gray-500 text-sm">{referrersTotal} реферёров</div>
              </div>

              <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-800 text-gray-400 text-xs uppercase tracking-wide">
                      <th className="text-left px-4 py-3">Реферёр</th>
                      <th className="text-left px-4 py-3">Код</th>
                      <th className="text-center px-4 py-3">Рефералов</th>
                      <th className="text-center px-4 py-3">Баланс</th>
                      <th className="text-center px-4 py-3">Выплачено</th>
                      <th className="text-center px-4 py-3">Условия</th>
                      <th className="text-left px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {referrersLoading ? (
                      <tr><td colSpan={7} className="text-center py-12 text-gray-500">Загрузка...</td></tr>
                    ) : referrers.length === 0 ? (
                      <tr><td colSpan={7} className="text-center py-12 text-gray-500">Нет реферёров</td></tr>
                    ) : referrers.map((r) => (
                      <tr key={r.id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-white">{r.name}</span>
                            {r.isPartner && (
                              <span className="text-xs bg-violet-900 text-violet-300 px-1.5 py-0.5 rounded">Партнёр</span>
                            )}
                          </div>
                          <div className="text-gray-500 text-xs">{r.email}</div>
                          {r.restaurantName && <div className="text-gray-600 text-xs">{r.restaurantName}</div>}
                        </td>
                        <td className="px-4 py-3 font-mono text-orange-400">{r.referralCode || '—'}</td>
                        <td className="px-4 py-3 text-center text-gray-300">{r.referredCount}</td>
                        <td className="px-4 py-3 text-center text-green-400 font-medium">{r.balance.toFixed(0)} ₽</td>
                        <td className="px-4 py-3 text-center text-gray-400">{r.totalPaid.toFixed(0)} ₽</td>
                        <td className="px-4 py-3 text-center">
                          {r.customReferralConditions ? (
                            <span className="text-xs bg-purple-500/20 text-purple-400 px-2 py-0.5 rounded-full">
                              Особые
                            </span>
                          ) : (
                            <span className="text-xs text-gray-600">Глобальные</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => setEditingReferrer({ ...r })}
                            className="text-xs px-2.5 py-1 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
                          >
                            Изменить
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ─── Вкладка: Выводы ─────────────────────────────────────────────── */}
        {activeTab === 'withdrawals' && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <select
                value={withdrawalStatusFilter}
                onChange={(e) => setWithdrawalStatusFilter(e.target.value)}
                className="bg-gray-900 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
              >
                <option value="">Все статусы</option>
                <option value="PENDING">Ожидают</option>
                <option value="PROCESSING">В обработке</option>
                <option value="COMPLETED">Выплачены</option>
                <option value="REJECTED">Отклонены</option>
              </select>
              <button onClick={loadWithdrawals} className="text-xs px-3 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors">
                Обновить
              </button>
              <div className="text-gray-500 text-sm">{withdrawalsTotal} заявок</div>
            </div>

            <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800 text-gray-400 text-xs uppercase tracking-wide">
                    <th className="text-left px-4 py-3">Пользователь</th>
                    <th className="text-left px-4 py-3">Сумма</th>
                    <th className="text-left px-4 py-3">Реквизиты</th>
                    <th className="text-left px-4 py-3">Дата</th>
                    <th className="text-center px-4 py-3">Статус</th>
                    <th className="text-left px-4 py-3">Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {withdrawalsLoading ? (
                    <tr><td colSpan={6} className="text-center py-12 text-gray-500">Загрузка...</td></tr>
                  ) : withdrawals.length === 0 ? (
                    <tr><td colSpan={6} className="text-center py-12 text-gray-500">Нет заявок</td></tr>
                  ) : withdrawals.map((w) => (
                    <tr key={w.id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                      <td className="px-4 py-3">
                        <div className="font-medium text-white">{w.user.name}</div>
                        <div className="text-gray-500 text-xs">{w.user.email}</div>
                        {w.user.restaurant && <div className="text-gray-600 text-xs">{w.user.restaurant.name}</div>}
                      </td>
                      <td className="px-4 py-3 font-semibold text-green-400">{Number(w.amount).toFixed(0)} ₽</td>
                      <td className="px-4 py-3 text-gray-400 text-xs max-w-[200px]">
                        {w.paymentDetails ? (
                          <span className="break-all">{w.paymentDetails}</span>
                        ) : <span className="text-gray-600">Не указаны</span>}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">
                        {new Date(w.createdAt).toLocaleDateString('ru')}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                          w.status === 'PENDING' ? 'bg-yellow-500/20 text-yellow-400' :
                          w.status === 'PROCESSING' ? 'bg-blue-500/20 text-blue-400' :
                          w.status === 'COMPLETED' ? 'bg-green-500/20 text-green-400' :
                          'bg-red-500/20 text-red-400'
                        }`}>
                          {w.status === 'PENDING' ? 'Ожидает' :
                           w.status === 'PROCESSING' ? 'В обработке' :
                           w.status === 'COMPLETED' ? 'Выплачено' : 'Отклонено'}
                        </span>
                        {w.adminNote && <div className="text-xs text-gray-500 mt-1">{w.adminNote}</div>}
                      </td>
                      <td className="px-4 py-3">
                        {w.status === 'PENDING' && (
                          <div className="flex gap-1.5">
                            <button
                              onClick={() => handleWithdrawalAction(w.id, 'PROCESSING')}
                              disabled={processingWithdrawal === w.id}
                              className="text-xs px-2.5 py-1 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 rounded-lg transition-colors disabled:opacity-50"
                            >
                              В обработку
                            </button>
                            <button
                              onClick={() => handleWithdrawalAction(w.id, 'REJECTED')}
                              disabled={processingWithdrawal === w.id}
                              className="text-xs px-2.5 py-1 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg transition-colors disabled:opacity-50"
                            >
                              Отклонить
                            </button>
                          </div>
                        )}
                        {w.status === 'PROCESSING' && (
                          <button
                            onClick={() => handleWithdrawalAction(w.id, 'COMPLETED')}
                            disabled={processingWithdrawal === w.id}
                            className="text-xs px-2.5 py-1 bg-green-500/20 hover:bg-green-500/30 text-green-400 rounded-lg transition-colors disabled:opacity-50"
                          >
                            Выплачено
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ─── Вкладка: Тарифы (лимиты и цены) ────────────────────────────── */}
        {activeTab === 'plan-config' && (
          <div className="max-w-2xl space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Лимиты и цены тарифов</h2>
              <button
                onClick={handleSavePlanConfig}
                disabled={planConfigSaving}
                className="px-4 py-1.5 text-sm bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white rounded-lg transition-colors"
              >
                {planConfigSaved ? '✓ Сохранено' : planConfigSaving ? 'Сохранение...' : 'Сохранить'}
              </button>
            </div>
            {planConfigLoading || !planConfig ? (
              <div className="text-gray-500 py-12 text-center">Загрузка...</div>
            ) : (
              <>
                {/* Prices */}
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                  <h3 className="font-medium mb-4">Цены (₽/мес)</h3>
                  <div className="grid grid-cols-2 gap-4">
                    {Object.entries(planConfig.prices).map(([plan, price]) => (
                      <div key={plan}>
                        <label className="block text-xs text-gray-400 mb-1">{plan}</label>
                        <input
                          type="number"
                          min={0}
                          value={price}
                          onChange={(e) => setPlanConfig((prev) => prev ? {
                            ...prev,
                            prices: { ...prev.prices, [plan]: parseInt(e.target.value, 10) || 0 },
                          } : prev)}
                          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-orange-500"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Limits */}
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                  <h3 className="font-medium mb-4">Лимиты (null = безлимит)</h3>
                  <div className="space-y-4">
                    {Object.entries(planConfig.limits).map(([plan, lim]) => (
                      <div key={plan} className="border border-gray-700 rounded-lg p-4">
                        <p className="text-sm font-medium text-orange-400 mb-3">{plan}</p>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs text-gray-400 mb-1">Макс. залов</label>
                            <input
                              type="number"
                              min={0}
                              placeholder="null = ∞"
                              value={lim.maxHalls ?? ''}
                              onChange={(e) => {
                                const val = e.target.value === '' ? null : parseInt(e.target.value, 10);
                                setPlanConfig((prev) => prev ? {
                                  ...prev,
                                  limits: { ...prev.limits, [plan]: { ...lim, maxHalls: val } },
                                } : prev);
                              }}
                              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-orange-500"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-400 mb-1">Макс. броней/мес</label>
                            <input
                              type="number"
                              min={0}
                              placeholder="null = ∞"
                              value={lim.maxBookingsPerMonth ?? ''}
                              onChange={(e) => {
                                const val = e.target.value === '' ? null : parseInt(e.target.value, 10);
                                setPlanConfig((prev) => prev ? {
                                  ...prev,
                                  limits: { ...prev.limits, [plan]: { ...lim, maxBookingsPerMonth: val } },
                                } : prev);
                              }}
                              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-orange-500"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* User balance adjustments — shown in restaurants list */}
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                  <h3 className="font-medium mb-2">Корректировка баланса пользователей</h3>
                  <p className="text-sm text-gray-400 mb-4">
                    Для корректировки баланса конкретного владельца найдите его в таблице на вкладке «Рестораны» и нажмите «Баланс».
                  </p>
                </div>
              </>
            )}
          </div>
        )}

        {/* ─── Вкладка: Логи ───────────────────────────────────────────────── */}
        {activeTab === 'logs' && (
          <div className="space-y-4">
            {/* Легенда действий */}
            <details className="bg-gray-900 border border-gray-800 rounded-xl">
              <summary className="px-4 py-3 text-sm font-medium text-gray-300 cursor-pointer select-none hover:text-white">
                📋 Справка по действиям
              </summary>
              <div className="px-4 pb-4 pt-1">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-gray-500 border-b border-gray-800">
                      <th className="text-left py-1.5 pr-4 font-medium w-56">Действие</th>
                      <th className="text-left py-1.5 pr-4 font-medium w-24">Актор</th>
                      <th className="text-left py-1.5 font-medium">Описание</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800/50">
                    {([
                      ['auth.register',                 'user',        'Регистрация нового ресторана и владельца'],
                      ['auth.login',                    'user',        'Успешный вход в дашборд'],
                      ['auth.login_failed',             'user',        'Неудачная попытка входа (неверный пароль или email)'],
                      ['booking.create',                'user/guest',  'Создание брони (вручную сотрудником или онлайн гостем)'],
                      ['booking.status_update',         'user',        'Изменение статуса брони (CONFIRMED, SEATED, CANCELLED и т.д.)'],
                      ['booking.cancel_guest',          'guest',       'Отмена брони гостем по ссылке из письма'],
                      ['superadmin.update_plan',        'superadmin',  'Смена тарифного плана ресторана'],
                      ['superadmin.balance_adjustment', 'superadmin',  'Ручная корректировка баланса владельца'],
                    ] as [string, string, string][]).map(([action, actor, desc]) => (
                      <tr key={action} className="hover:bg-gray-800/30">
                        <td className="py-1.5 pr-4">
                          <span className="font-mono text-blue-300">{action}</span>
                        </td>
                        <td className="py-1.5 pr-4 text-gray-400">{actor}</td>
                        <td className="py-1.5 text-gray-400">{desc}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>

            {/* Фильтры */}
            <div className="flex flex-wrap gap-3 items-end">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Ресторан</label>
                <input
                  value={logsFilter.restaurantName}
                  onChange={(e) => setLogsFilter((f) => ({ ...f, restaurantName: e.target.value }))}
                  placeholder="Название ресторана"
                  className="bg-gray-800 border border-gray-700 text-sm rounded-lg px-3 py-1.5 w-44 focus:outline-none focus:border-gray-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Действие</label>
                <input
                  value={logsFilter.action}
                  onChange={(e) => setLogsFilter((f) => ({ ...f, action: e.target.value }))}
                  placeholder="booking.create"
                  className="bg-gray-800 border border-gray-700 text-sm rounded-lg px-3 py-1.5 w-44 focus:outline-none focus:border-gray-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Статус</label>
                <select
                  value={logsFilter.status}
                  onChange={(e) => setLogsFilter((f) => ({ ...f, status: e.target.value }))}
                  className="bg-gray-800 border border-gray-700 text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:border-gray-500"
                >
                  <option value="">Все</option>
                  <option value="ok">ok</option>
                  <option value="error">error</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">С даты</label>
                <input
                  type="date"
                  value={logsFilter.dateFrom}
                  onChange={(e) => setLogsFilter((f) => ({ ...f, dateFrom: e.target.value }))}
                  className="bg-gray-800 border border-gray-700 text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:border-gray-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">По дату</label>
                <input
                  type="date"
                  value={logsFilter.dateTo}
                  onChange={(e) => setLogsFilter((f) => ({ ...f, dateTo: e.target.value }))}
                  className="bg-gray-800 border border-gray-700 text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:border-gray-500"
                />
              </div>
              <button
                onClick={() => loadLogs(1, logsFilter)}
                className="px-4 py-1.5 text-sm bg-orange-500 hover:bg-orange-600 text-white rounded-lg transition-colors"
              >
                Применить
              </button>
              <button
                onClick={() => {
                  const f = { action: '', status: '', restaurantName: '', dateFrom: '', dateTo: '' };
                  setLogsFilter(f);
                  loadLogs(1, f);
                }}
                className="px-4 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
              >
                Сбросить
              </button>
              <span className="text-xs text-gray-500 ml-auto">Всего: {logsTotal}</span>
            </div>

            {/* Таблица */}
            {logsLoading ? (
              <div className="text-gray-500 py-12 text-center">Загрузка...</div>
            ) : logs.length === 0 ? (
              <div className="text-gray-500 py-12 text-center">Нет записей</div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-gray-800">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-800 text-xs text-gray-400">
                      <th className="text-left px-3 py-2.5 font-medium">Время</th>
                      <th className="text-left px-3 py-2.5 font-medium">Действие</th>
                      <th className="text-left px-3 py-2.5 font-medium">Актор</th>
                      <th className="text-left px-3 py-2.5 font-medium">Ресторан</th>
                      <th className="text-left px-3 py-2.5 font-medium">Статус</th>
                      <th className="text-left px-3 py-2.5 font-medium">Детали</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((log) => (
                      <tr key={log.id} className="border-b border-gray-800/50 hover:bg-gray-900/50">
                        <td className="px-3 py-2 text-gray-400 whitespace-nowrap text-xs">
                          {new Date(log.createdAt).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'medium' })}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs text-blue-300">{log.action}</td>
                        <td className="px-3 py-2 text-xs text-gray-300">
                          <div>{log.actorType}</div>
                          {log.actorEmail && <div className="text-gray-500 truncate max-w-[140px]">{log.actorEmail}</div>}
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-300 max-w-[150px]">
                          {log.restaurantName ?? (log.restaurantId ? log.restaurantId.slice(0, 8) + '…' : '—')}
                        </td>
                        <td className="px-3 py-2">
                          <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                            log.status === 'ok' ? 'bg-green-900/50 text-green-400' : 'bg-red-900/50 text-red-400'
                          }`}>
                            {log.status}
                          </span>
                          {log.errorMessage && (
                            <div className="text-xs text-red-400 mt-0.5 max-w-[160px] truncate" title={log.errorMessage}>
                              {log.errorMessage}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-500 max-w-[200px]">
                          {log.meta ? (
                            <details>
                              <summary className="cursor-pointer hover:text-gray-300">показать</summary>
                              <pre className="mt-1 text-xs text-gray-400 whitespace-pre-wrap break-all">
                                {JSON.stringify(log.meta, null, 2)}
                              </pre>
                            </details>
                          ) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Пагинация */}
            {logsTotal > 50 && (
              <div className="flex gap-2 justify-center pt-2">
                <button
                  disabled={logsPage === 1}
                  onClick={() => loadLogs(logsPage - 1)}
                  className="px-3 py-1 text-sm bg-gray-800 hover:bg-gray-700 disabled:opacity-40 rounded-lg"
                >
                  ← Назад
                </button>
                <span className="px-3 py-1 text-sm text-gray-400">
                  {logsPage} / {Math.ceil(logsTotal / 50)}
                </span>
                <button
                  disabled={logsPage >= Math.ceil(logsTotal / 50)}
                  onClick={() => loadLogs(logsPage + 1)}
                  className="px-3 py-1 text-sm bg-gray-800 hover:bg-gray-700 disabled:opacity-40 rounded-lg"
                >
                  Вперёд →
                </button>
              </div>
            )}
          </div>
        )}

        {/* ─── Вкладка: Лендинг ────────────────────────────────────────────── */}
        {activeTab === 'landing' && (
          <div className="max-w-3xl space-y-6">
            {landingLoading ? (
              <div className="text-gray-500 py-12 text-center">Загрузка...</div>
            ) : landingSettings ? (
              <>
                {/* Заголовок + кнопка сохранить */}
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold">Настройки лендинга</h2>
                  <button
                    onClick={handleSaveLanding}
                    disabled={landingSaving}
                    className="px-4 py-1.5 text-sm bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white rounded-lg transition-colors"
                  >
                    {landingSaved ? '✓ Сохранено' : landingSaving ? 'Сохранение...' : 'Сохранить'}
                  </button>
                </div>

                {/* Блок тарифов — вкл/выкл */}
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium">Блок тарифов</div>
                      <div className="text-xs text-gray-500 mt-0.5">Отображать секцию тарифов на главной странице</div>
                    </div>
                    <button
                      onClick={() => updateLanding({ showPricing: !landingSettings.showPricing })}
                      className={`relative w-11 h-6 rounded-full transition-colors ${
                        landingSettings.showPricing ? 'bg-orange-500' : 'bg-gray-600'
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                          landingSettings.showPricing ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>

                  {landingSettings.showPricing && (
                    <div className="space-y-3 pt-2 border-t border-gray-800">
                      <div>
                        <label className="text-xs text-gray-400 block mb-1">Заголовок секции</label>
                        <input
                          type="text"
                          value={landingSettings.pricingTitle}
                          onChange={(e) => updateLanding({ pricingTitle: e.target.value })}
                          className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-400 block mb-1">Подзаголовок</label>
                        <input
                          type="text"
                          value={landingSettings.pricingSubtitle}
                          onChange={(e) => updateLanding({ pricingSubtitle: e.target.value })}
                          className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Тарифы */}
                {landingSettings.showPricing && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="font-medium text-gray-200">Тарифные планы ({landingSettings.plans.length})</h3>
                      <button
                        onClick={addPricingPlan}
                        className="text-xs px-3 py-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg transition-colors"
                      >
                        + Добавить тариф
                      </button>
                    </div>

                    {landingSettings.plans.map((plan, idx) => (
                      <div key={plan.id} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                        {/* Заголовок карточки */}
                        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
                          <button
                            onClick={() => setEditingPlanId(editingPlanId === plan.id ? null : plan.id)}
                            className="flex items-center gap-2 text-sm font-medium hover:text-orange-400 transition-colors"
                          >
                            <span>{editingPlanId === plan.id ? '▾' : '▸'}</span>
                            <span>{plan.name}</span>
                            <span className="text-gray-400 font-normal">{plan.price}{plan.period}</span>
                            {plan.highlight && (
                              <span className="text-xs bg-orange-500/20 text-orange-400 px-2 py-0.5 rounded-full">Популярный</span>
                            )}
                          </button>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => movePlan(plan.id, -1)}
                              disabled={idx === 0}
                              className="p-1.5 text-gray-500 hover:text-gray-200 disabled:opacity-30 transition-colors"
                              title="Переместить вверх"
                            >↑</button>
                            <button
                              onClick={() => movePlan(plan.id, 1)}
                              disabled={idx === landingSettings.plans.length - 1}
                              className="p-1.5 text-gray-500 hover:text-gray-200 disabled:opacity-30 transition-colors"
                              title="Переместить вниз"
                            >↓</button>
                            <button
                              onClick={() => removePricingPlan(plan.id)}
                              className="p-1.5 text-gray-500 hover:text-red-400 transition-colors"
                              title="Удалить тариф"
                            >✕</button>
                          </div>
                        </div>

                        {/* Редактирование */}
                        {editingPlanId === plan.id && (
                          <div className="p-4 space-y-4">
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="text-xs text-gray-400 block mb-1">Название</label>
                                <input
                                  type="text"
                                  value={plan.name}
                                  onChange={(e) => updatePricingPlan(plan.id, { name: e.target.value })}
                                  className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
                                />
                              </div>
                              <div>
                                <label className="text-xs text-gray-400 block mb-1">Цена (текст)</label>
                                <input
                                  type="text"
                                  value={plan.price}
                                  onChange={(e) => updatePricingPlan(plan.id, { price: e.target.value })}
                                  placeholder="990 ₽"
                                  className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
                                />
                              </div>
                              <div>
                                <label className="text-xs text-gray-400 block mb-1">Период (текст)</label>
                                <input
                                  type="text"
                                  value={plan.period}
                                  onChange={(e) => updatePricingPlan(plan.id, { period: e.target.value })}
                                  placeholder="/мес"
                                  className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
                                />
                              </div>
                              <div className="flex items-end">
                                <label className="flex items-center gap-2 cursor-pointer pb-2">
                                  <input
                                    type="checkbox"
                                    checked={plan.highlight}
                                    onChange={(e) => updatePricingPlan(plan.id, { highlight: e.target.checked })}
                                    className="w-4 h-4 accent-orange-500"
                                  />
                                  <span className="text-sm text-gray-300">Выделить как популярный</span>
                                </label>
                              </div>
                            </div>

                            {/* Фичи */}
                            <div>
                              <label className="text-xs text-gray-400 block mb-2">Преимущества</label>
                              <div className="space-y-1.5">
                                {plan.features.map((f, i) => (
                                  <div key={i} className="flex items-center gap-2">
                                    <span className="text-green-500 text-xs">✓</span>
                                    <input
                                      type="text"
                                      value={f}
                                      onChange={(e) => {
                                        const newFeatures = [...plan.features];
                                        newFeatures[i] = e.target.value;
                                        updatePricingPlan(plan.id, { features: newFeatures });
                                      }}
                                      className="flex-1 bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-orange-500"
                                    />
                                    <button
                                      onClick={() => removeFeature(plan.id, i)}
                                      className="text-gray-500 hover:text-red-400 transition-colors text-sm px-1"
                                    >✕</button>
                                  </div>
                                ))}
                                <div className="flex items-center gap-2 mt-2">
                                  <input
                                    type="text"
                                    value={newFeatureText[plan.id] || ''}
                                    onChange={(e) => setNewFeatureText((prev) => ({ ...prev, [plan.id]: e.target.value }))}
                                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addFeature(plan.id); } }}
                                    placeholder="Новое преимущество..."
                                    className="flex-1 bg-gray-800 border border-dashed border-gray-600 text-white text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-orange-500 placeholder-gray-600"
                                  />
                                  <button
                                    onClick={() => addFeature(plan.id)}
                                    className="text-xs px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
                                  >
                                    + Добавить
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}

                    {landingSettings.plans.length === 0 && (
                      <div className="text-center py-8 text-gray-500 text-sm border border-dashed border-gray-700 rounded-xl">
                        Нет тарифов. Нажмите «+ Добавить тариф»
                      </div>
                    )}
                  </div>
                )}
              </>
            ) : null}
          </div>
        )}
      </div>

      {/* Модал: редактирование условий реферёра */}
      {editingReferrer && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-md shadow-2xl">
            <h2 className="text-lg font-semibold mb-1">Условия реферёра</h2>
            <p className="text-gray-400 text-sm mb-5">{editingReferrer.name} · {editingReferrer.email}</p>

            <div className="space-y-4">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editingReferrer.customReferralConditions}
                  onChange={(e) => setEditingReferrer((prev) => prev ? { ...prev, customReferralConditions: e.target.checked } : prev)}
                  className="w-4 h-4 accent-orange-500"
                />
                <div>
                  <div className="text-sm font-medium text-white">Особые условия</div>
                  <div className="text-xs text-gray-500">Глобальные настройки не применяются, используются индивидуальные</div>
                </div>
              </label>

              {editingReferrer.customReferralConditions && (
                <div className="grid grid-cols-2 gap-4 pl-7">
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">Комиссия реферёру (%)</label>
                    <input
                      type="number"
                      min={0} max={100}
                      value={editingReferrer.customCommissionRate ?? ''}
                      placeholder="глобальная"
                      onChange={(e) => setEditingReferrer((prev) => prev ? {
                        ...prev,
                        customCommissionRate: e.target.value === '' ? null : Number(e.target.value)
                      } : prev)}
                      className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">Скидка для рефералов (%)</label>
                    <input
                      type="number"
                      min={0} max={100}
                      value={editingReferrer.customDiscountRate ?? ''}
                      placeholder="глобальная"
                      onChange={(e) => setEditingReferrer((prev) => prev ? {
                        ...prev,
                        customDiscountRate: e.target.value === '' ? null : Number(e.target.value)
                      } : prev)}
                      className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setEditingReferrer(null)}
                className="flex-1 px-4 py-2 border border-gray-700 text-gray-300 text-sm rounded-lg hover:bg-gray-800 transition-colors"
              >
                Отмена
              </button>
              <button
                onClick={handleSaveReferrerConditions}
                className="flex-1 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium rounded-lg transition-colors"
              >
                Сохранить
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Модал: корректировка баланса ─────────────────────────────────────── */}
      {adjustingBalance && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-sm shadow-2xl">
            <h2 className="text-base font-semibold mb-4">Корректировка баланса</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Сумма (+ пополнение, − списание)</label>
                <input
                  type="number"
                  value={balanceAmount}
                  onChange={(e) => setBalanceAmount(e.target.value)}
                  placeholder="-1000 или 500"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-orange-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Причина</label>
                <input
                  type="text"
                  value={balanceDesc}
                  onChange={(e) => setBalanceDesc(e.target.value)}
                  placeholder="Ручная корректировка"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-orange-500"
                />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button
                onClick={() => handleAdjustBalance(adjustingBalance)}
                disabled={!balanceAmount || !balanceDesc}
                className="flex-1 px-4 py-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
              >
                Применить
              </button>
              <button
                onClick={() => setAdjustingBalance(null)}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-sm rounded-lg transition-colors"
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
