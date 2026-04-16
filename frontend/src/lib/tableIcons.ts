// ─── Встроенная библиотека иконок столов ─────────────────────────────────────
// SVG data URL иконки для вида сверху. Используются в редакторе зала и на
// странице гостя вместо стандартных зелёных фигур (PREMIUM).

export interface TableIcon {
  id: string;
  label: string;
  dataUrl: string;
}

const enc = (svg: string) =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

const round = (inner: string) =>
  enc(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 60">${inner}</svg>`);

const rect = (inner: string) =>
  enc(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 50">${inner}</svg>`);

export const TABLE_ICONS: TableIcon[] = [
  {
    id: 'wood-round',
    label: 'Дерево',
    dataUrl: round(`
      <circle cx="30" cy="30" r="28" fill="#c4a265" stroke="#8b5e34" stroke-width="1.5"/>
      <circle cx="30" cy="30" r="21" fill="none" stroke="#a07840" stroke-width="0.8" opacity="0.5"/>
      <circle cx="30" cy="30" r="14" fill="none" stroke="#a07840" stroke-width="0.7" opacity="0.35"/>
      <circle cx="30" cy="30" r="7"  fill="none" stroke="#a07840" stroke-width="0.5" opacity="0.25"/>
    `),
  },
  {
    id: 'marble-round',
    label: 'Мрамор',
    dataUrl: round(`
      <circle cx="30" cy="30" r="28" fill="#eeebe4" stroke="#b8b0a4" stroke-width="1.5"/>
      <path d="M14 22 Q22 14 34 28 Q40 36 36 46" fill="none" stroke="#c8c0b4" stroke-width="1.2"/>
      <path d="M20 10 Q28 22 24 36 Q22 42 18 46" fill="none" stroke="#d0c8bc" stroke-width="0.8"/>
      <path d="M38 12 Q44 20 40 30" fill="none" stroke="#c0b8ac" stroke-width="0.7"/>
    `),
  },
  {
    id: 'dark-round',
    label: 'Тёмный',
    dataUrl: round(`
      <circle cx="30" cy="30" r="28" fill="#2c2c2c" stroke="#555" stroke-width="1.5"/>
      <circle cx="30" cy="30" r="20" fill="none" stroke="#484848" stroke-width="1"/>
      <circle cx="30" cy="30" r="10" fill="none" stroke="#3c3c3c" stroke-width="1"/>
      <circle cx="30" cy="30" r="4"  fill="#3a3a3a"/>
    `),
  },
  {
    id: 'vip-round',
    label: 'VIP',
    dataUrl: round(`
      <circle cx="30" cy="30" r="28" fill="#f0c040" stroke="#c89010" stroke-width="2"/>
      <circle cx="30" cy="30" r="22" fill="none" stroke="#c89010" stroke-width="1" opacity="0.6"/>
      <text x="30" y="35" text-anchor="middle" font-size="13" fill="#7a5c08" font-weight="bold" font-family="serif">VIP</text>
    `),
  },
  {
    id: 'glass-round',
    label: 'Стекло',
    dataUrl: round(`
      <circle cx="30" cy="30" r="28" fill="#d8eff8" stroke="#80c0dc" stroke-width="1.5"/>
      <circle cx="30" cy="30" r="20" fill="none" stroke="#a8d8ec" stroke-width="1"/>
      <ellipse cx="21" cy="21" rx="6" ry="3.5" fill="white" opacity="0.55" transform="rotate(-35 21 21)"/>
    `),
  },
  {
    id: 'modern-round',
    label: 'Модерн',
    dataUrl: round(`
      <circle cx="30" cy="30" r="28" fill="#f4f4f4" stroke="#d0d0d0" stroke-width="2"/>
      <circle cx="30" cy="30" r="18" fill="none" stroke="#e0e0e0" stroke-width="1.5"/>
      <circle cx="30" cy="30" r="5"  fill="#e8e8e8" stroke="#d0d0d0" stroke-width="1"/>
    `),
  },
  {
    id: 'rustic-round',
    label: 'Рустик',
    dataUrl: round(`
      <circle cx="30" cy="30" r="28" fill="#8b6518" stroke="#5a4010" stroke-width="2"/>
      <circle cx="30" cy="30" r="22" fill="none" stroke="#6a5010" stroke-width="1"   opacity="0.7"/>
      <circle cx="30" cy="30" r="15" fill="none" stroke="#6a5010" stroke-width="0.8" opacity="0.5"/>
      <circle cx="30" cy="30" r="8"  fill="none" stroke="#6a5010" stroke-width="0.6" opacity="0.35"/>
    `),
  },
  {
    id: 'wood-rect',
    label: 'Дерево (прямоуг.)',
    dataUrl: rect(`
      <rect x="2" y="2" width="76" height="46" rx="4" fill="#c4a265" stroke="#8b5e34" stroke-width="1.5"/>
      <line x1="2"  y1="14" x2="78" y2="14" stroke="#a07840" stroke-width="0.6" opacity="0.4"/>
      <line x1="2"  y1="27" x2="78" y2="27" stroke="#a07840" stroke-width="0.6" opacity="0.4"/>
      <line x1="2"  y1="38" x2="78" y2="38" stroke="#a07840" stroke-width="0.6" opacity="0.4"/>
    `),
  },
];
