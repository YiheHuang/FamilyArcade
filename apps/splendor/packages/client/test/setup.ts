/**
 * vitest 全局准备：把界面语言固定为中文，保证断言稳定。
 * 必须在任何模块（尤其是 store/i18n）被导入之前写入 localStorage。
 */
try {
  const KEY = 'splendor.settings.v1';
  const raw = localStorage.getItem(KEY);
  const cur = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
  cur.lang = 'zh';
  localStorage.setItem(KEY, JSON.stringify(cur));
} catch {
  /* ignore */
}
