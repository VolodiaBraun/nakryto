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

type Tab = 'restaurants' | 'landing' | 'content';

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
            {([['restaurants', 'Рестораны'], ['landing', 'Лендинг'], ['content', 'Контент']] as [Tab, string][]).map(([id, label]) => (
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
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={7} className="text-center py-12 text-gray-500">Загрузка...</td>
                    </tr>
                  ) : restaurants.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-12 text-gray-500">Ничего не найдено</td>
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
    </div>
  );
}
