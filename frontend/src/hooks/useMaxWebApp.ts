'use client';

import { useEffect, useState } from 'react';

export interface MaxUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  photo_url?: string;
}

export interface MaxWebApp {
  ready: () => void;
  close?: () => void;
  colorScheme: 'light' | 'dark';
  initData: string;
  initDataUnsafe: {
    user?: MaxUser;
    start_param?: string;
  };
  BackButton: {
    show: () => void;
    hide: () => void;
    onClick: (fn: () => void) => void;
    offClick: (fn: () => void) => void;
  };
}

declare global {
  interface Window {
    WebApp?: MaxWebApp;
  }
}

export function useMaxWebApp() {
  const [mwa, setMwa] = useState<MaxWebApp | null>(null);
  const [isMwa, setIsMwa] = useState(false);

  useEffect(() => {
    // MAX Bridge injects window.WebApp automatically (no script tag needed)
    const webapp = window.WebApp;
    if (webapp && webapp.initData !== undefined) {
      webapp.ready();
      setMwa(webapp);
      setIsMwa(true);

      // Apply CSS vars reusing same --tg-* variables as TWA
      const { colorScheme } = webapp;
      const root = document.documentElement;
      root.setAttribute('data-twa-scheme', colorScheme);

      if (colorScheme === 'dark') {
        root.style.setProperty('--tg-bg', '#1c1c1e');
        root.style.setProperty('--tg-text', '#f2f2f7');
        root.style.setProperty('--tg-hint', '#8e8e93');
        root.style.setProperty('--tg-link', '#0a84ff');
        root.style.setProperty('--tg-btn', '#0a84ff');
        root.style.setProperty('--tg-btn-text', '#ffffff');
        root.style.setProperty('--tg-secondary-bg', '#2c2c2e');
      } else {
        root.style.setProperty('--tg-bg', '#ffffff');
        root.style.setProperty('--tg-text', '#111827');
        root.style.setProperty('--tg-hint', '#6b7280');
        root.style.setProperty('--tg-link', '#2563eb');
        root.style.setProperty('--tg-btn', '#2563eb');
        root.style.setProperty('--tg-btn-text', '#ffffff');
        root.style.setProperty('--tg-secondary-bg', '#f3f4f6');
      }
    }
  }, []);

  return { mwa, isMwa };
}
