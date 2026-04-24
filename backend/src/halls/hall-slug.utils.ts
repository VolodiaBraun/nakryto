const RU_EN: Record<string, string> = {
  а: 'a',  б: 'b',  в: 'v',  г: 'g',  д: 'd',  е: 'e',  ё: 'yo', ж: 'zh',
  з: 'z',  и: 'i',  й: 'y',  к: 'k',  л: 'l',  м: 'm',  н: 'n',  о: 'o',
  п: 'p',  р: 'r',  с: 's',  т: 't',  у: 'u',  ф: 'f',  х: 'kh', ц: 'ts',
  ч: 'ch', ш: 'sh', щ: 'shch', ъ: '', ы: 'y',  ь: '',   э: 'e',  ю: 'yu',
  я: 'ya',
};

export function nameToSlug(name: string): string {
  return name
    .toLowerCase()
    .split('')
    .map((c) => RU_EN[c] ?? c)
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50) || 'hall';
}
