import Link from 'next/link';

export const dynamic = 'force-dynamic';

async function getPrivacyPolicy(): Promise<string> {
  try {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
    const res = await fetch(`${apiUrl}/api/public/landing-settings`, { cache: 'no-store' });
    if (res.ok) {
      const json = await res.json();
      const data = json.data ?? json;
      if (data.privacyPolicy) return data.privacyPolicy;
    }
  } catch {}
  return '';
}

function renderMarkdown(text: string) {
  return text.split('\n').map((line, i) => {
    if (line.startsWith('# ')) return <h1 key={i} className="text-2xl font-bold text-gray-900 mb-4 mt-6">{line.slice(2)}</h1>;
    if (line.startsWith('## ')) return <h2 key={i} className="text-lg font-semibold text-gray-800 mb-2 mt-5">{line.slice(3)}</h2>;
    if (line.startsWith('- ')) return <li key={i} className="ml-4 text-gray-600 list-disc">{line.slice(2)}</li>;
    if (line.trim() === '') return <div key={i} className="mb-2" />;
    return <p key={i} className="text-gray-600 mb-1 leading-relaxed">{line}</p>;
  });
}

export default async function PrivacyPage() {
  const content = await getPrivacyPolicy();

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center gap-4">
          <Link href="/" className="text-orange-500 font-bold text-lg">Накрыто</Link>
          <span className="text-gray-300">/</span>
          <span className="text-gray-600 text-sm">Политика конфиденциальности</span>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-6 py-10">
        <div className="bg-white rounded-2xl border border-gray-200 p-8">
          {content ? (
            <div>{renderMarkdown(content)}</div>
          ) : (
            <p className="text-gray-400">Документ временно недоступен.</p>
          )}
        </div>
        <div className="mt-6 text-center">
          <Link href="/" className="text-sm text-gray-400 hover:text-gray-600 transition-colors">← На главную</Link>
        </div>
      </main>
    </div>
  );
}
