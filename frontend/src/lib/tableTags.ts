export const TABLE_TAGS = [
  { id: 'soft',    icon: '🛋',  label: 'Мягкие кресла' },
  { id: 'wooden',  icon: '🪑',  label: 'Деревянные стулья' },
  { id: 'bar',     icon: '🍸',  label: 'Барные стулья' },
  { id: 'window',  icon: '🪟',  label: 'У окна' },
  { id: 'terrace', icon: '☀️',  label: 'Терраса' },
  { id: 'vip',     icon: '⭐',  label: 'VIP' },
  { id: 'quiet',   icon: '🔇',  label: 'Тихая зона' },
] as const;

export type TableTagId = typeof TABLE_TAGS[number]['id'];
