import type { Lang } from './i18n';

export function formatChips(lang: Lang, value: number): string {
  const safe = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  try {
    return safe.toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US');
  } catch {
    return String(safe);
  }
}

export function formatDate(lang: Lang, at: number): string {
  try {
    return new Intl.DateTimeFormat(lang === 'zh' ? 'zh-CN' : 'en', {
      month: 'short',
      day: 'numeric',
    }).format(new Date(at));
  } catch {
    return '';
  }
}
