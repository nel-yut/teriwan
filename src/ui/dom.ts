type Child = Node | string | number | false | null | undefined;
type Attrs = Record<string, unknown> & { class?: string; html?: string };

/** 最小限の DOM ヘルパー */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs | null = null, ...children: (Child | Child[])[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.className = String(v);
      else if (k === 'html') el.innerHTML = String(v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, String(v));
    }
  }
  for (const c of children.flat()) {
    if (c === false || c === null || c === undefined) continue;
    el.append(c instanceof Node ? c : String(c));
  }
  return el;
}

export function bar(value: number, max: number, kind: 'hp' | 'mp' | 'exp' = 'hp'): HTMLElement {
  const pct = max <= 0 ? 0 : Math.max(0, Math.min(100, (value / max) * 100));
  const low = kind === 'hp' && pct < 25 ? ' low' : '';
  return h('div', { class: `bar ${kind}${low}` }, h('div', { class: 'fill', style: `width:${pct}%` }));
}

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
