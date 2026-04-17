/** Встроенные иконки стульев (вид сверху) — SVG data URLs */

function svg(body: string): string {
  const markup = `<svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
}

export interface ChairIcon {
  id: string;
  label: string;
  dataUrl: string;
}

export const CHAIR_ICONS: ChairIcon[] = [
  {
    id: 'wood-classic',
    label: 'Деревянный',
    dataUrl: svg(`
      <rect x="8" y="4" width="24" height="8" rx="2" fill="#8B6843" stroke="#5C3D1E" stroke-width="1.5"/>
      <rect x="8" y="14" width="24" height="18" rx="3" fill="#A67C52" stroke="#5C3D1E" stroke-width="1.5"/>
      <circle cx="12" cy="30" r="2.5" fill="#5C3D1E"/>
      <circle cx="28" cy="30" r="2.5" fill="#5C3D1E"/>
    `),
  },
  {
    id: 'stool-round',
    label: 'Табурет',
    dataUrl: svg(`
      <circle cx="20" cy="20" r="15" fill="#C49A6C" stroke="#8B6843" stroke-width="1.5"/>
      <circle cx="20" cy="20" r="9"  fill="none"    stroke="#8B6843" stroke-width="1" opacity="0.45"/>
      <circle cx="20" cy="20" r="3"  fill="#8B6843" opacity="0.35"/>
    `),
  },
  {
    id: 'armchair',
    label: 'Кресло',
    dataUrl: svg(`
      <rect x="2"  y="11" width="8"  height="20" rx="4" fill="#8B6843" stroke="#5C3D1E" stroke-width="1.5"/>
      <rect x="30" y="11" width="8"  height="20" rx="4" fill="#8B6843" stroke="#5C3D1E" stroke-width="1.5"/>
      <rect x="8"  y="4"  width="24" height="9"  rx="2" fill="#8B6843" stroke="#5C3D1E" stroke-width="1.5"/>
      <rect x="8"  y="13" width="24" height="18" rx="3" fill="#B08050" stroke="#5C3D1E" stroke-width="1.5"/>
    `),
  },
  {
    id: 'bench',
    label: 'Скамья',
    dataUrl: svg(`
      <rect x="3"  y="5"  width="34" height="8"  rx="2" fill="#8B6843" stroke="#5C3D1E" stroke-width="1.5"/>
      <rect x="3"  y="15" width="34" height="14" rx="2" fill="#A67C52" stroke="#5C3D1E" stroke-width="1.5"/>
      <rect x="5"  y="29" width="5"  height="8"  rx="1" fill="#5C3D1E"/>
      <rect x="30" y="29" width="5"  height="8"  rx="1" fill="#5C3D1E"/>
    `),
  },
  {
    id: 'soft-chair',
    label: 'Мягкий',
    dataUrl: svg(`
      <rect x="8"  y="4"  width="24" height="9"  rx="5" fill="#7BA7C8" stroke="#4A6A8E" stroke-width="1.5"/>
      <rect x="5"  y="15" width="30" height="21" rx="8" fill="#8FBBD8" stroke="#4A6A8E" stroke-width="1.5"/>
      <line x1="20" y1="17" x2="20" y2="34" stroke="#5E8FB0" stroke-width="1" stroke-dasharray="3,2"/>
    `),
  },
  {
    id: 'barstool',
    label: 'Барный',
    dataUrl: svg(`
      <circle cx="20" cy="16" r="12"  fill="#D4A870" stroke="#8B6843" stroke-width="1.5"/>
      <circle cx="20" cy="16" r="6"   fill="none"    stroke="#8B6843" stroke-width="1" opacity="0.4"/>
      <rect   x="18" y="28"  width="4" height="9" rx="2" fill="#8B6843"/>
      <rect   x="13" y="34"  width="14" height="3" rx="1.5" fill="#6B5030"/>
    `),
  },
];
