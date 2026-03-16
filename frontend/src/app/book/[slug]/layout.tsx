import type { Metadata } from 'next';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export async function generateMetadata(
  { params }: { params: { slug: string } },
): Promise<Metadata> {
  try {
    const res = await fetch(`${API_URL}/api/public/${params.slug}`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) throw new Error('not found');
    const json = await res.json();
    const restaurant = json.data ?? json;
    const name: string = restaurant.name ?? 'Ресторан';
    const address: string = restaurant.address ? ` · ${restaurant.address}` : '';

    return {
      title: `${name} — выбрать и забронировать столик`,
      description: `Забронируйте столик онлайн в ресторане ${name}${address}. Визуальный выбор стола на интерактивной карте — мгновенное подтверждение без звонка.`,
      // TODO: убрать этот блок когда будем открывать страницы для индексации
      robots: { index: false, follow: false },
    };
  } catch {
    return {
      title: 'Бронирование столика',
      robots: { index: false, follow: false },
    };
  }
}

export default function BookLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
