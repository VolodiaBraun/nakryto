import type { Metadata } from 'next';
import { HydrationBoundary, QueryClient, dehydrate } from '@tanstack/react-query';

// Внутренний URL бэкенда (SSR → server-to-server, без внешнего интернета)
const API_URL = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

async function ssrFetch(url: string) {
  try {
    const res = await fetch(url, { next: { revalidate: 60 } });
    if (!res.ok) return null;
    const json = await res.json();
    return json.data ?? json;
  } catch {
    return null;
  }
}

export async function generateMetadata(
  { params }: { params: { slug: string } },
): Promise<Metadata> {
  try {
    const restaurant = await ssrFetch(`${API_URL}/api/public/${params.slug}`);
    if (!restaurant) throw new Error('not found');
    const name: string = restaurant.name ?? 'Ресторан';
    const address: string = restaurant.address ? ` · ${restaurant.address}` : '';

    return {
      title: `${name} — выбрать и забронировать столик`,
      description: `Забронируйте столик онлайн в ресторане ${name}${address}. Визуальный выбор стола на интерактивной карте — мгновенное подтверждение без звонка.`,
      robots: { index: false, follow: false },
    };
  } catch {
    return {
      title: 'Бронирование столика',
      robots: { index: false, follow: false },
    };
  }
}

export default async function BookLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { slug: string };
}) {
  const { slug } = params;
  const queryClient = new QueryClient();

  // Pre-fetch ресторана и залов параллельно на сервере
  // → страница гостя получает данные без единого спиннера
  await Promise.all([
    queryClient.prefetchQuery({
      queryKey: ['public', slug],
      queryFn: () => ssrFetch(`${API_URL}/api/public/${slug}`),
    }),
    queryClient.prefetchQuery({
      queryKey: ['public', slug, 'halls'],
      queryFn: () => ssrFetch(`${API_URL}/api/public/${slug}/halls`),
    }),
  ]);

  // Preload hint для снапшота первого зала (если уже сгенерирован)
  const halls = queryClient.getQueryData<any[]>(['public', slug, 'halls']);
  const snapshotUrl: string | undefined = halls?.[0]?.floorPlan?.snapshotUrl;

  return (
    <>
      {/* Браузер начнёт грузить снапшот зала параллельно с JS-бандлом */}
      {snapshotUrl && (
        // eslint-disable-next-line @next/next/no-head-element
        <link rel="preload" as="image" href={snapshotUrl} />
      )}
      <HydrationBoundary state={dehydrate(queryClient)}>
        {children}
      </HydrationBoundary>
    </>
  );
}
