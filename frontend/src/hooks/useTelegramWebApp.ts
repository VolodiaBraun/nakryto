'use client';

import { useEffect, useState } from 'react';

export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

export interface TelegramWebApp {
  ready: () => void;
  close: () => void;
  expand: () => void;
  colorScheme: 'light' | 'dark';
  themeParams: {
    bg_color?: string;
    text_color?: string;
    hint_color?: string;
    link_color?: string;
    button_color?: string;
    button_text_color?: string;
    secondary_bg_color?: string;
  };
  initDataUnsafe: {
    user?: TelegramUser;
  };
  BackButton: {
    show: () => void;
    hide: () => void;
    onClick: (fn: () => void) => void;
    offClick: (fn: () => void) => void;
  };
  MainButton: {
    text: string;
    color: string;
    textColor: string;
    isVisible: boolean;
    isActive: boolean;
    show: () => void;
    hide: () => void;
    enable: () => void;
    disable: () => void;
    setText: (text: string) => void;
    onClick: (fn: () => void) => void;
    offClick: (fn: () => void) => void;
    showProgress: (leaveActive?: boolean) => void;
    hideProgress: () => void;
  };
  HapticFeedback: {
    impactOccurred: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => void;
    notificationOccurred: (type: 'error' | 'success' | 'warning') => void;
    selectionChanged: () => void;
  };
}

declare global {
  interface Window {
    Telegram?: { WebApp: TelegramWebApp };
  }
}

export function useTelegramWebApp() {
  const [twa, setTwa] = useState<TelegramWebApp | null>(null);
  const [isTwa, setIsTwa] = useState(false);

  useEffect(() => {
    const webapp = window.Telegram?.WebApp;
    if (webapp) {
      webapp.ready();
      webapp.expand();
      setTwa(webapp);
      setIsTwa(true);

      // Apply Telegram theme CSS variables
      const { themeParams, colorScheme } = webapp;
      const root = document.documentElement;
      if (themeParams.bg_color) root.style.setProperty('--tg-bg', themeParams.bg_color);
      if (themeParams.text_color) root.style.setProperty('--tg-text', themeParams.text_color);
      if (themeParams.hint_color) root.style.setProperty('--tg-hint', themeParams.hint_color);
      if (themeParams.link_color) root.style.setProperty('--tg-link', themeParams.link_color);
      if (themeParams.button_color) root.style.setProperty('--tg-btn', themeParams.button_color);
      if (themeParams.button_text_color) root.style.setProperty('--tg-btn-text', themeParams.button_text_color);
      if (themeParams.secondary_bg_color) root.style.setProperty('--tg-secondary-bg', themeParams.secondary_bg_color);
      root.setAttribute('data-twa-scheme', colorScheme);
    }
  }, []);

  return { twa, isTwa };
}
