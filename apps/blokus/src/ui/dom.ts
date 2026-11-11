/** Tiny DOM helpers — no framework needed. */

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function clear(node: HTMLElement): void {
  node.replaceChildren();
}

export function qs<T extends HTMLElement>(root: ParentNode, selector: string): T {
  const found = root.querySelector<T>(selector);
  if (!found) throw new Error(`missing element: ${selector}`);
  return found;
}

export function button(className: string, label: string, onClick: () => void): HTMLButtonElement {
  const b = el('button', className, label);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}

/** copy text to clipboard, tolerating non-secure contexts */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = el('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

export function isTauri(): boolean {
  return '__TAURI_INTERNALS__' in window;
}

let toastHost: HTMLElement | null = null;

export function toast(msg: string, ms = 2400): void {
  if (!toastHost) {
    toastHost = el('div', 'toast-host');
    document.body.appendChild(toastHost);
  }
  const node = el('div', 'toast', msg);
  toastHost.appendChild(node);
  setTimeout(() => node.remove(), ms);
}

export function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export async function invokeTauri<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const internals = (window as unknown as {
    __TAURI_INTERNALS__?: { invoke: (cmd: string, args?: unknown) => Promise<T> };
  }).__TAURI_INTERNALS__;
  if (!internals) throw new Error('not running in Tauri');
  return internals.invoke(cmd, args);
}
