'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/lib/utils';

const ROLE_LABELS: Record<string, string> = {
  OWNER: 'Владелец',
  MANAGER: 'Менеджер',
  HOSTESS: 'Хостес',
};

const navItems = [
  { href: '/dashboard', label: 'Главная', icon: '📊', exact: true },
  { href: '/dashboard/bookings', label: 'Брони', icon: '📅' },
  { href: '/dashboard/halls', label: 'Залы и схемы', icon: '🗺️' },
  { href: '/dashboard/tables', label: 'Столы', icon: '🪑' },
  { href: '/dashboard/staff', label: 'Сотрудники', icon: '👥', roles: ['OWNER'] as string[] },
  { href: '/dashboard/referral', label: 'Рефералы', icon: '🤝', roles: ['OWNER'] as string[] },
  { href: '/dashboard/settings', label: 'Настройки', icon: '⚙️', roles: ['OWNER'] as string[] },
];

export function Sidebar() {
  const pathname = usePathname();
  const { restaurant, user, logout } = useAuth();

  const isActive = (href: string, exact = false) => {
    if (exact) return pathname === href;
    return pathname.startsWith(href);
  };

  const visibleItems = navItems.filter(
    (item) => !item.roles || (user && item.roles.includes(user.role)),
  );

  return (
    <aside className="w-60 bg-white border-r border-gray-200 flex flex-col h-full">
      {/* Logo */}
      <div className="p-5 border-b border-gray-200">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
            <span className="text-lg">🍽</span>
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-gray-900 truncate text-sm">{restaurant?.name}</p>
            <p className="text-xs text-gray-500 truncate">/book/{restaurant?.slug}</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-0.5">
        {visibleItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors',
              isActive(item.href, item.exact)
                ? 'bg-blue-50 text-blue-700 font-medium'
                : 'text-gray-600 hover:bg-gray-100',
            )}
          >
            <span className="text-base">{item.icon}</span>
            {item.label}
          </Link>
        ))}
      </nav>

      {/* Public link */}
      <div className="p-3 border-t border-gray-100">
        <a
          href={`/book/${restaurant?.slug}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-600 hover:bg-gray-100 transition-colors"
        >
          <span className="text-base">🔗</span>
          Страница гостя
        </a>
      </div>

      {/* User */}
      <div className="p-4 border-t border-gray-200">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center text-sm font-medium text-gray-600 flex-shrink-0">
            {user?.name?.[0]?.toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">{user?.name}</p>
            <p className="text-xs text-gray-400 truncate">{user?.email}</p>
          </div>
        </div>
        {user?.role && (
          <p className="text-xs text-blue-600 font-medium mb-2 pl-11">
            {ROLE_LABELS[user.role] ?? user.role}
          </p>
        )}
        <button
          onClick={logout}
          className="w-full text-left text-sm text-gray-500 hover:text-red-600 transition-colors px-1 py-1"
        >
          Выйти
        </button>
      </div>
    </aside>
  );
}
