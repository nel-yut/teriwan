import { Game } from '../application/game';
import type { Strategy } from '../domain/battle';
import { IdbSaveStore, MemorySaveStore, type SaveStore } from '../infrastructure/save';
import type { Line } from '../data/story';
import { h, sleep } from './dom';
import { setVolume, sfx } from './sfx';

export interface Settings {
  textSpeed: 'slow' | 'normal' | 'fast';
  volume: number;
  strategy: Strategy;
}

const SETTINGS_KEY = 'teriwan.settings.v1';
const DEFAULT_SETTINGS: Settings = { textSpeed: 'normal', volume: 0.5, strategy: 'bacchiri' };

export type ScreenName =
  | 'title'
  | 'base'
  | 'gates'
  | 'explore'
  | 'party'
  | 'breeding'
  | 'hatchery'
  | 'shop'
  | 'arena'
  | 'bestiary'
  | 'settings';
export type ScreenFn = (app: App, arg?: unknown) => void | Promise<void>;

export class App {
  readonly root: HTMLElement;
  store: SaveStore;
  storeWarning: string | null = null;
  game: Game | null = null;
  slot = 0;
  settings: Settings = { ...DEFAULT_SETTINGS };
  screens: Partial<Record<ScreenName, ScreenFn>> = {};
  current: ScreenName = 'title';
  private cleanup: (() => void) | null = null;
  private lastTick = Date.now();

  constructor(root: HTMLElement) {
    this.root = root;
    try {
      this.store = new IdbSaveStore();
    } catch {
      this.store = new MemorySaveStore();
      this.storeWarning = 'このブラウザでは保存が使えません。セーブはこのタブを閉じると消えます。';
    }
    this.loadSettings();
    setInterval(() => this.tick(), 1000);
  }

  private tick(): void {
    const now = Date.now();
    if (this.game && !document.hidden) this.game.save.playSeconds += Math.min(5, Math.round((now - this.lastTick) / 1000));
    this.lastTick = now;
  }

  // ---------- 設定 ----------

  private loadSettings(): void {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) this.settings = { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) };
    } catch {
      /* 初期設定のまま */
    }
    setVolume(this.settings.volume);
  }

  saveSettings(): void {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
    } catch {
      /* 保存できなくても動作は継続 */
    }
    setVolume(this.settings.volume);
    if (this.game) this.game.strategy = this.settings.strategy;
  }

  get textDelay(): number {
    return { slow: 900, normal: 550, fast: 220 }[this.settings.textSpeed];
  }

  // ---------- 画面遷移 ----------

  /** 画面を差し替える。cleanup は画面を離れるときに呼ばれる。 */
  go(name: ScreenName, arg?: unknown): void {
    this.cleanup?.();
    this.cleanup = null;
    this.current = name;
    this.root.replaceChildren();
    this.root.scrollTop = 0;
    void this.screens[name]?.(this, arg);
  }

  setCleanup(fn: () => void): void {
    this.cleanup = fn;
  }

  mount(...nodes: Node[]): void {
    this.root.replaceChildren(...nodes);
  }

  get g(): Game {
    if (!this.game) throw new Error('ゲームが開始されていません');
    return this.game;
  }

  async autosave(): Promise<void> {
    if (!this.game) return;
    await this.game.persist();
    if (this.game.lastSaveError) this.toast('⚠ セーブに失敗しました: ' + this.game.lastSaveError, 4000);
  }

  // ---------- 共通 UI ----------

  toast(text: string, ms = 2200): void {
    const el = h('div', { class: 'toast', role: 'status' }, text);
    document.body.append(el);
    setTimeout(() => el.remove(), ms);
  }

  /** タップで送る会話ウィンドウ */
  dialog(lines: Line[], vars: Record<string, string> = {}): Promise<void> {
    const name = vars.name ?? this.game?.save.playerName ?? '旅人';
    const fill = (t: string) => t.replace(/\{name\}/g, name);
    return new Promise((resolve) => {
      let i = 0;
      const who = h('div', { class: 'dlg-who' });
      const text = h('div', { class: 'dlg-text' });
      const hint = h('div', { class: 'dlg-hint' }, '▼');
      const box = h('div', { class: 'dialog', tabindex: '0', role: 'dialog' }, who, text, hint);
      const overlay = h('div', { class: 'overlay dlg' }, box);
      const show = () => {
        const l = lines[i]!;
        who.textContent = l.who ?? '';
        who.style.display = l.who ? '' : 'none';
        text.textContent = fill(l.text);
      };
      const next = () => {
        sfx.click();
        i += 1;
        if (i >= lines.length) {
          document.removeEventListener('keydown', onKey);
          overlay.remove();
          resolve();
        } else show();
      };
      const onKey = (e: KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'z') {
          e.preventDefault();
          next();
        }
      };
      overlay.addEventListener('click', next);
      document.addEventListener('keydown', onKey);
      document.body.append(overlay);
      show();
      box.focus();
    });
  }

  confirm(message: string, okLabel = 'はい', cancelLabel = 'やめる'): Promise<boolean> {
    return new Promise((resolve) => {
      const done = (v: boolean) => {
        overlay.remove();
        resolve(v);
      };
      const overlay = h(
        'div',
        { class: 'overlay' },
        h(
          'div',
          { class: 'modal', role: 'alertdialog' },
          h('p', { class: 'modal-text' }, message),
          h('div', { class: 'row end' }, h('button', { class: 'btn', onclick: () => done(false) }, cancelLabel), h('button', { class: 'btn primary', onclick: () => done(true) }, okLabel)),
        ),
      );
      document.body.append(overlay);
    });
  }

  /** 任意の内容を載せたモーダル。閉じるボタンで resolve。 */
  modal(title: string, content: Node | Node[], closeLabel = 'とじる'): Promise<void> {
    return new Promise((resolve) => {
      const overlay = h(
        'div',
        { class: 'overlay' },
        h(
          'div',
          { class: 'modal wide', role: 'dialog' },
          h('h3', null, title),
          h('div', { class: 'modal-body' }, ...(Array.isArray(content) ? content : [content])),
          h('div', { class: 'row end' }, h('button', { class: 'btn primary', onclick: () => (overlay.remove(), resolve()) }, closeLabel)),
        ),
      );
      document.body.append(overlay);
    });
  }

  /** 選択肢から 1 つ選ぶシンプルなメニュー(キャンセルで null) */
  choose<T>(title: string, options: { label: string; value: T; sub?: string; disabled?: boolean }[], cancel = 'もどる', body?: Node[]): Promise<T | null> {
    return new Promise((resolve) => {
      const done = (v: T | null) => {
        overlay.remove();
        resolve(v);
      };
      const list = h(
        'div',
        { class: 'choose-list' },
        options.map((o) =>
          h(
            'button',
            { class: 'btn choice', disabled: o.disabled, onclick: () => (sfx.click(), done(o.value)) },
            h('span', null, o.label),
            o.sub ? h('small', null, o.sub) : null,
          ),
        ),
      );
      const overlay = h(
        'div',
        { class: 'overlay' },
        h('div', { class: 'modal', role: 'dialog' }, h('h3', null, title), body ? h('div', { class: 'modal-body' }, ...body) : null, list, h('div', { class: 'row end' }, h('button', { class: 'btn', onclick: () => done(null) }, cancel))),
      );
      document.body.append(overlay);
    });
  }

  async wait(ms: number): Promise<void> {
    await sleep(ms);
  }
}
