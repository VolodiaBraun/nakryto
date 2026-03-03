import Link from 'next/link';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white text-gray-900">
      {/* Навбар */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-white/90 backdrop-blur border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="text-xl font-bold text-orange-500">Накрыто</div>
          <nav className="flex items-center gap-4">
            <Link
              href="/login"
              className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
            >
              Войти
            </Link>
            <Link
              href="/register"
              className="text-sm bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg transition-colors"
            >
              Попробовать бесплатно
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="pt-32 pb-24 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-5xl font-bold leading-tight mb-6">
            Бронирование столов<br />
            <span className="text-orange-500">для вашего ресторана</span>
          </h1>
          <p className="text-xl text-gray-500 mb-10 max-w-2xl mx-auto">
            Интерактивная карта зала, онлайн-брони в реальном времени и уведомления гостям —
            всё в одном сервисе без лишних настроек.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/register"
              className="w-full sm:w-auto bg-orange-500 hover:bg-orange-600 text-white text-base font-medium px-8 py-3.5 rounded-xl transition-colors"
            >
              Начать бесплатно
            </Link>
            <Link
              href="/book/demo-restaurant"
              className="w-full sm:w-auto border border-gray-200 hover:border-gray-300 text-gray-700 text-base font-medium px-8 py-3.5 rounded-xl transition-colors"
            >
              Смотреть демо →
            </Link>
          </div>
        </div>
      </section>

      {/* Возможности */}
      <section className="py-20 bg-gray-50 px-6">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12">Всё что нужно ресторану</h2>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                icon: '🗺️',
                title: 'Интерактивная карта зала',
                desc: 'Нарисуйте схему зала с точным расположением столов. Гости видят наглядную карту и выбирают понравившееся место.',
              },
              {
                icon: '⚡',
                title: 'Реальное время',
                desc: 'Статусы столов обновляются мгновенно по WebSocket. Новая бронь сразу видна всем менеджерам без обновления страницы.',
              },
              {
                icon: '📱',
                title: 'Уведомления гостям',
                desc: 'Гость получает ссылку на бронь с возможностью отмены. Никаких звонков — всё онлайн.',
              },
            ].map((f) => (
              <div key={f.title} className="bg-white rounded-2xl p-8 shadow-sm">
                <div className="text-4xl mb-4">{f.icon}</div>
                <h3 className="text-lg font-semibold mb-2">{f.title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Тарифы */}
      <section className="py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-3">Тарифные планы</h2>
          <p className="text-gray-500 text-center mb-12">Начните бесплатно, масштабируйтесь по мере роста</p>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                name: 'Бесплатный',
                price: '0 ₽',
                period: '',
                highlight: false,
                features: ['1 зал', '50 броней в месяц', 'Карта зала', 'Онлайн-брони'],
              },
              {
                name: 'Стандарт',
                price: '990 ₽',
                period: '/мес',
                highlight: true,
                features: ['3 зала', 'Безлимитные брони', 'Все функции Free', 'WebSocket real-time'],
              },
              {
                name: 'Премиум',
                price: '2 490 ₽',
                period: '/мес',
                highlight: false,
                features: ['Безлимит залов', 'Безлимитные брони', 'Все функции Стандарт', 'Приоритетная поддержка'],
              },
            ].map((plan) => (
              <div
                key={plan.name}
                className={`rounded-2xl p-8 border-2 flex flex-col ${
                  plan.highlight
                    ? 'border-orange-500 bg-orange-50'
                    : 'border-gray-100 bg-white'
                }`}
              >
                {plan.highlight && (
                  <div className="text-xs font-semibold text-orange-600 uppercase tracking-wide mb-2">
                    Популярный
                  </div>
                )}
                <h3 className="text-xl font-bold mb-1">{plan.name}</h3>
                <div className="text-3xl font-bold mb-6">
                  {plan.price}
                  <span className="text-base font-normal text-gray-400">{plan.period}</span>
                </div>
                <ul className="space-y-2 mb-8 flex-1">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-sm text-gray-600">
                      <span className="text-green-500">✓</span>
                      {f}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/register"
                  className={`block text-center py-2.5 rounded-xl text-sm font-medium transition-colors ${
                    plan.highlight
                      ? 'bg-orange-500 hover:bg-orange-600 text-white'
                      : 'border border-gray-200 hover:border-gray-300 text-gray-700'
                  }`}
                >
                  Подключить
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Футер */}
      <footer className="border-t border-gray-100 py-8 px-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-gray-400">
          <div className="font-semibold text-gray-600">Накрыто</div>
          <div>© {new Date().getFullYear()} Nakryto. Все права защищены.</div>
        </div>
      </footer>
    </div>
  );
}
