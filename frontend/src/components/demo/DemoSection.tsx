'use client';

import { useState, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import type { FloorPlan } from '@/types';
import { loadDemoFloorPlan, saveDemoFloorPlan, DEMO_INITIAL_FLOOR_PLAN } from '@/lib/demo-storage';

const DemoEditor = dynamic(() => import('./DemoEditor'), {
  ssr: false,
  loading: () => <PanelLoader label="Загрузка редактора..." />,
});

const DemoPreview = dynamic(() => import('./DemoPreview'), {
  ssr: false,
  loading: () => <PanelLoader label="Загрузка превью..." />,
});

function PanelLoader({ label }: { label: string }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 h-full bg-gray-50">
      <div className="w-7 h-7 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" />
      <p className="text-xs text-gray-400">{label}</p>
    </div>
  );
}

export default function DemoSection() {
  const [floorPlan, setFloorPlan]     = useState<FloorPlan>(DEMO_INITIAL_FLOOR_PLAN);
  const [hasInteracted, setHasInteracted] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const saved = loadDemoFloorPlan();
    if (saved) {
      setFloorPlan(saved);
      setHasInteracted(true);
    }
  }, []);

  const handleChange = (fp: FloorPlan) => {
    setFloorPlan(fp);
    setHasInteracted(true);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => saveDemoFloorPlan(fp), 1000);
  };

  return (
    <section className="py-20 bg-gradient-to-b from-white to-orange-50/40 px-6">
      <div className="max-w-6xl mx-auto">

        {/* Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-1.5 bg-orange-100 text-orange-700 text-xs font-semibold px-3 py-1.5 rounded-full mb-4">
            <span>⚡</span> Демо-режим — без регистрации
          </div>
          <h2 className="text-3xl font-bold mb-3">Попробуйте прямо сейчас</h2>
          <p className="text-gray-500 max-w-xl mx-auto text-base">
            Расставьте столы в редакторе — и сразу увидите, как это выглядит для ваших гостей.
            Изменения сохраняются в браузере на 5 дней.
          </p>
        </div>

        {/* Vertical panels */}
        <div className="flex flex-col gap-6">

          {/* Editor */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-gray-700">✏️ Редактор зала</h3>
              <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                Демо · макс. 15 объектов
              </span>
            </div>
            <div className="border border-gray-200 rounded-2xl overflow-hidden shadow-sm bg-white h-[640px] md:h-[520px]">
              <DemoEditor floorPlan={floorPlan} onChange={handleChange} />
            </div>
            <p className="text-xs text-gray-400 mt-2 text-center">
              {hasInteracted
                ? '💾 Сохранено в браузере на 5 дней'
                : 'Выберите инструмент слева и кликните на схему, чтобы добавить объект'}
            </p>
          </div>

          {/* Preview */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-gray-700">👁 Вид гостя</h3>
              <span className="text-xs text-orange-600 bg-orange-50 border border-orange-100 px-2 py-0.5 rounded-full">
                Так видит ваш клиент
              </span>
            </div>
            <div className="border border-gray-200 rounded-2xl overflow-hidden shadow-sm bg-white">
              <DemoPreview floorPlan={floorPlan} />
            </div>
            <p className="text-xs text-gray-400 mt-2 text-center">
              В полной версии: настраиваемые часы, email и Telegram уведомления гостям
            </p>
          </div>

        </div>

        {/* Bottom CTA */}
        <div className="mt-12 text-center">
          <p className="text-gray-500 text-sm mb-5 max-w-lg mx-auto">
            Понравилось? В полной версии — несколько залов, управление сотрудниками,
            статистика и мгновенные уведомления гостям.
          </p>
          <Link
            href="/register"
            className="inline-flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-semibold px-9 py-3.5 rounded-xl text-base transition-colors shadow-md shadow-orange-100"
          >
            Попробовать бесплатно →
          </Link>
          <p className="text-xs text-gray-400 mt-3">
            Тариф FREE навсегда · Без кредитной карты · Настройка за 5 минут
          </p>
        </div>

      </div>
    </section>
  );
}
