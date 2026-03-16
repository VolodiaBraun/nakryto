'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

const COOKIE_KEY = 'nakryto_cookies_accepted';

export default function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem(COOKIE_KEY)) {
      setVisible(true);
    }
  }, []);

  if (!visible) return null;

  function accept() {
    localStorage.setItem(COOKIE_KEY, '1');
    setVisible(false);
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-gray-900 text-white px-4 py-4 shadow-2xl border-t border-gray-700">
      <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-start sm:items-center gap-3 justify-between">
        <p className="text-sm text-gray-300 leading-relaxed">
          Мы используем файлы cookie для обеспечения работы сайта. Продолжая пользоваться сайтом,
          вы соглашаетесь с нашей{' '}
          <Link href="/privacy" className="underline hover:text-white transition-colors">
            политикой конфиденциальности
          </Link>{' '}
          и{' '}
          <Link href="/personal-data" className="underline hover:text-white transition-colors">
            обработкой персональных данных
          </Link>.
        </p>
        <button
          onClick={accept}
          className="flex-shrink-0 px-5 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium rounded-lg transition-colors"
        >
          Согласен
        </button>
      </div>
    </div>
  );
}
