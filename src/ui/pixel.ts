import { getSpecies } from '../domain/monster';
import type { FamilyId, MonsterSpecies } from '../domain/types';

/** 24x24 のドット絵をコードで生成する。後から PNG 素材に差し替え可能(assets.ts)。 */
const N = 24;
type RGB = [number, number, number];
type Pix = RGB | null;

// ---------- 色ユーティリティ ----------
function hexToRgb(hex: string): RGB {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbToHsl([r, g, b]: RGB): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return [(h + 360) % 360, s, l];
}
function hslToRgb(h: number, s: number, l: number): RGB {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}
const shade = (c: RGB, dl: number, dh = 0): RGB => {
  const [h, s, l] = rgbToHsl(c);
  return hslToRgb((h + dh + 360) % 360, Math.min(1, s), Math.max(0.06, Math.min(0.94, l + dl)));
};

const BASE: Record<FamilyId, { body: string; accent: string }> = {
  sprout: { body: '#7bd36b', accent: '#f6e27a' },
  beast: { body: '#e0a465', accent: '#f4d8a8' },
  wing: { body: '#7fc8f0', accent: '#fff3c4' },
  scale: { body: '#4fc3b0', accent: '#c8f2e8' },
  metal: { body: '#aab4c4', accent: '#e8c15a' },
  shade: { body: '#9a7bd1', accent: '#e6d6ff' },
  flame: { body: '#f08a4b', accent: '#ffe08a' },
  frost: { body: '#a8e4f5', accent: '#ffffff' },
  astral: { body: '#f2d36b', accent: '#fff7cf' },
  dragon: { body: '#d86f7a', accent: '#f3c46b' },
};

// ---------- 描画バッファ ----------
class Buf {
  px: Pix[] = new Array(N * N).fill(null);
  /** 0=なし 1=体(陰影の対象) 2=飾り */
  kind: number[] = new Array(N * N).fill(0);
  set(x: number, y: number, c: Pix, kind = 2): void {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= N || y >= N) return;
    this.px[y * N + x] = c;
    this.kind[y * N + x] = c ? kind : 0;
  }
  get(x: number, y: number): Pix {
    if (x < 0 || y < 0 || x >= N || y >= N) return null;
    return this.px[y * N + x] ?? null;
  }
  fill(test: (x: number, y: number) => boolean, c: RGB, kind = 2): void {
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (test(x, y)) this.set(x, y, c, kind);
  }
  ellipse(cx: number, cy: number, rx: number, ry: number, c: RGB, kind = 1): void {
    this.fill((x, y) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1, c, kind);
  }
  rect(x0: number, y0: number, x1: number, y1: number, c: RGB, kind = 2): void {
    this.fill((x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1, c, kind);
  }
  /** 左右対称に点を打つ */
  sym(x: number, y: number, c: RGB, kind = 2): void {
    this.set(x, y, c, kind);
    this.set(N - 1 - x, y, c, kind);
  }
  poly(pts: [number, number][], c: RGB, kind = 2): void {
    this.fill((x, y) => {
      let inside = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i]!;
        const [xj, yj] = pts[j]!;
        if (yi > y + 0.5 !== yj > y + 0.5 && x + 0.5 < ((xj - xi) * (y + 0.5 - yi)) / (yj - yi) + xi) inside = !inside;
      }
      return inside;
    }, c, kind);
  }
}

function hash(n: number): number {
  n = (n ^ 61) ^ (n >>> 16);
  n = Math.imul(n + (n << 3), 0x27d4eb2d);
  return ((n ^ (n >>> 15)) >>> 0) / 4294967296;
}

interface Pal {
  body: RGB;
  light: RGB;
  dark: RGB;
  outline: RGB;
  accent: RGB;
  accentDark: RGB;
}

function makePalette(sp: MonsterSpecies): Pal {
  const base = BASE[sp.family];
  const hue = (sp.index - 4) * 7;
  const body = shade(hexToRgb(base.body), 0, hue);
  const accent = shade(hexToRgb(base.accent), 0, hue * 0.5);
  return { body, light: shade(body, 0.14), dark: shade(body, -0.16, -6), outline: shade(body, -0.38, -10), accent, accentDark: shade(accent, -0.22) };
}

// ---------- 系統ごとの体型 ----------
function drawFamily(b: Buf, sp: MonsterSpecies, p: Pal): { eyeY: number; eyeDX: number } {
  const idx = sp.index;
  const big = 1 + idx * 0.035;
  const cx = 11.5;
  switch (sp.family) {
    case 'sprout': {
      b.ellipse(cx, 15, 8.5 * big, 7.5 * big, p.body);
      b.set(11, 6, p.accentDark);
      b.set(12, 6, p.accentDark);
      b.set(11, 5, p.accentDark);
      b.poly([[12, 5], [17, 2], [19, 5], [15, 7]], p.accent);
      b.poly([[11, 5], [7, 2], [5, 5], [9, 7]], shade(p.accent, -0.08, -20));
      if (idx >= 4) b.poly([[11.5, 2], [13, 0], [14, 3]], p.accent);
      return { eyeY: 13, eyeDX: 3.5 };
    }
    case 'beast': {
      b.poly([[3, 9], [5, 2], [9, 7]], p.dark, 2);
      b.poly([[20, 9], [18, 2], [14, 7]], p.dark, 2);
      b.poly([[4, 8], [5, 4], [8, 7]], p.accent, 2);
      b.poly([[19, 8], [18, 4], [15, 7]], p.accent, 2);
      b.ellipse(cx, 15, 9 * big, 7.5 * big, p.body);
      b.rect(5, 20, 8, 22, p.body);
      b.rect(15, 20, 18, 22, p.body);
      b.ellipse(cx, 18, 4.5, 3, p.accent, 2);
      if (idx >= 3) {
        b.sym(4, 10, p.accentDark);
        b.sym(4, 11, p.accentDark);
      }
      return { eyeY: 13, eyeDX: 3.5 };
    }
    case 'wing': {
      b.poly([[2, 11], [0, 16], [4, 21], [7, 15]], p.accent, 2);
      b.poly([[21, 11], [23, 16], [19, 21], [16, 15]], p.accent, 2);
      for (let i = 0; i < 3 + (idx > 5 ? 1 : 0); i++) {
        b.sym(2 + i, 14 + i * 2, p.accentDark);
      }
      b.ellipse(cx, 14, 7.5 * big, 7.5 * big, p.body);
      b.poly([[10, 15], [13, 15], [11.5, 18]], [245, 185, 66], 2);
      b.rect(9, 5, 14, 5, p.accent, 2);
      if (idx >= 2) b.poly([[10, 6], [11.5, 1], [13, 6]], p.accent, 2);
      b.sym(8, 22, [240, 170, 70], 2);
      b.sym(9, 22, [240, 170, 70], 2);
      return { eyeY: 12, eyeDX: 3 };
    }
    case 'scale': {
      b.ellipse(21, 17, 2.5, 1.7, p.dark, 2);
      b.ellipse(cx - 0.5, 15, 9 * big, 6.5 * big, p.body);
      b.ellipse(cx - 0.5, 19, 6, 2.5, p.accent, 2);
      for (let x = 6; x <= 16; x += 3) for (let y = 11; y <= 13; y += 2) b.set(x + (y % 4 === 1 ? 1 : 0), y, p.dark, 2);
      if (idx >= 3) b.poly([[6, 10], [8, 6], [10, 9]], p.accentDark, 2);
      if (idx >= 3) b.poly([[13, 9], [15, 6], [17, 10]], p.accentDark, 2);
      b.rect(6, 21, 8, 22, p.body);
      b.rect(15, 21, 17, 22, p.body);
      return { eyeY: 13, eyeDX: 3.5 };
    }
    case 'metal': {
      b.rect(4, 8, 19, 21, p.body);
      b.rect(5, 7, 18, 7, p.body);
      b.rect(5, 22, 18, 22, p.body);
      b.rect(11, 3, 12, 6, p.dark, 2);
      b.ellipse(cx, 2.5, 2, 2, p.accent, 2);
      b.rect(6, 17, 17, 19, p.dark, 2);
      b.rect(6, 17, 17, 17, p.accentDark, 2);
      for (const [x, y] of [[5, 9], [18, 9], [5, 20], [18, 20]] as const) b.set(x, y, p.accent, 2);
      if (idx >= 3) b.rect(2, 12, 3, 15, p.dark, 2), b.rect(20, 12, 21, 15, p.dark, 2);
      return { eyeY: 12, eyeDX: 3.5 };
    }
    case 'shade': {
      b.ellipse(cx, 11, 8.5 * big, 8 * big, p.body);
      b.rect(3, 11, 20, 20, p.body);
      for (let x = 3; x <= 20; x++) {
        const wave = ((x - 3) % 6) < 3 ? 22 : 20;
        for (let y = 21; y <= wave; y++) b.set(x, y, p.body);
        if (wave === 20) b.set(x, 21, null);
      }
      b.set(11, 2, p.accent, 2);
      b.set(12, 2, p.accent, 2);
      b.set(11, 3, p.accent, 2);
      if (idx >= 3) b.sym(3, 13, p.accent, 2);
      return { eyeY: 11, eyeDX: 3.5 };
    }
    case 'flame': {
      b.poly([[11.5, 0], [16, 8], [20, 13], [20, 19], [16, 22], [7, 22], [3, 19], [3, 13], [7, 8]], p.body);
      b.poly([[11.5, 10], [15, 15], [14, 21], [9, 21], [8, 15]], p.accent, 2);
      b.set(5, 6, p.accent, 2);
      b.set(18, 5, p.accent, 2);
      if (idx >= 3) b.poly([[4, 10], [2, 5], [6, 8]], p.body);
      if (idx >= 3) b.poly([[19, 10], [21, 5], [17, 8]], p.body);
      return { eyeY: 15, eyeDX: 3 };
    }
    case 'frost': {
      b.poly([[11.5, 1], [19, 8], [19, 17], [11.5, 23], [4, 17], [4, 8]], p.body);
      b.poly([[11.5, 1], [11.5, 23], [4, 8]], p.light, 2);
      b.poly([[11.5, 4], [16, 8], [11.5, 12]], p.accent, 2);
      if (idx >= 3) b.poly([[2, 14], [0, 10], [4, 12]], p.accent, 2), b.poly([[21, 14], [23, 10], [19, 12]], p.accent, 2);
      return { eyeY: 13, eyeDX: 3 };
    }
    case 'astral': {
      const pts: [number, number][] = [];
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const r = i % 2 === 0 ? 11.5 : 5.2;
        pts.push([11.5 + Math.cos(a) * r, 12.5 + Math.sin(a) * r]);
      }
      b.poly(pts, p.body);
      b.ellipse(cx, 12.5, 2.5, 2.5, p.accent, 2);
      if (idx >= 5) b.set(2, 3, p.accent, 2), b.set(21, 4, p.accent, 2), b.set(20, 21, p.accent, 2);
      return { eyeY: 11, eyeDX: 2.5 };
    }
    case 'dragon': {
      b.poly([[2, 8], [0, 15], [5, 18], [8, 12]], p.dark, 2);
      b.poly([[21, 8], [23, 15], [18, 18], [15, 12]], p.dark, 2);
      b.ellipse(21, 19, 2.5, 1.5, p.dark, 2);
      b.ellipse(cx, 15, 8 * big, 7.5 * big, p.body);
      b.poly([[6, 9], [4, 2], [9, 7]], p.accent, 2);
      b.poly([[17, 9], [19, 2], [14, 7]], p.accent, 2);
      b.ellipse(cx, 19, 4, 2.5, p.accent, 2);
      b.rect(6, 21, 8, 22, p.body);
      b.rect(15, 21, 17, 22, p.body);
      return { eyeY: 13, eyeDX: 3.5 };
    }
  }
}

function render(sp: MonsterSpecies): HTMLCanvasElement {
  const b = new Buf();
  const p = makePalette(sp);
  const { eyeY, eyeDX } = drawFamily(b, sp, p);

  // 体の陰影(左上を明るく、右下を暗く)
  const bodyPix: { x: number; y: number }[] = [];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (b.kind[y * N + x] === 1) bodyPix.push({ x, y });
  if (bodyPix.length) {
    const minX = Math.min(...bodyPix.map((q) => q.x));
    const maxX = Math.max(...bodyPix.map((q) => q.x));
    const minY = Math.min(...bodyPix.map((q) => q.y));
    const maxY = Math.max(...bodyPix.map((q) => q.y));
    for (const { x, y } of bodyPix) {
      const t = (x - minX) / Math.max(1, maxX - minX) + (y - minY) / Math.max(1, maxY - minY);
      if (t > 1.2) b.set(x, y, p.dark, 1);
      else if (t < 0.5 && hash(x * 31 + y * 17 + sp.index) > 0.15) b.set(x, y, p.light, 1);
    }
  }
  // 模様(個体差)
  if (sp.index % 3 === 1) for (let i = 0; i < 4; i++) {
    const x = 7 + Math.floor(hash(sp.index * 9 + i) * 10);
    const y = 12 + Math.floor(hash(sp.index * 5 + i * 3) * 7);
    if (b.kind[y * N + x] === 1) b.set(x, y, p.dark, 1);
  }
  if (sp.index % 3 === 2) for (let x = 7; x <= 16; x++) if (b.kind[17 * N + x] === 1) b.set(x, 17, p.dark, 1);

  // アウトライン
  const outlined: [number, number][] = [];
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      if (b.get(x, y)) continue;
      if (b.get(x - 1, y) || b.get(x + 1, y) || b.get(x, y - 1) || b.get(x, y + 1)) outlined.push([x, y]);
    }
  }
  for (const [x, y] of outlined) b.set(x, y, p.outline, 3);

  // 目
  const lx = Math.round(11.5 - eyeDX);
  const rx = Math.round(11.5 + eyeDX);
  const white: RGB = [255, 255, 255];
  const dark: RGB = [26, 26, 48];
  for (const [x, dir] of [[lx, -1], [rx, 1]] as const) {
    b.set(x, eyeY, dark, 4);
    b.set(x, eyeY + 1, dark, 4);
    b.set(x + dir, eyeY, white, 4);
    b.set(x + dir, eyeY + 1, dark, 4);
  }
  b.set(Math.round(11.5), eyeY + 3, dark, 4);
  b.set(Math.round(12.5), eyeY + 3, dark, 4);

  // ランクの飾り
  if (sp.rank === 'A' || sp.rank === 'S') {
    const gold: RGB = sp.rank === 'S' ? [255, 216, 107] : [191, 227, 255];
    for (const [x, y] of [[1, 2], [22, 3], [2, 20], [21, 19]] as const) {
      if (!b.get(x, y)) {
        b.set(x, y, gold, 5);
        if (sp.rank === 'S') {
          b.set(x - 1, y, gold, 5);
          b.set(x + 1, y, gold, 5);
          b.set(x, y - 1, gold, 5);
          b.set(x, y + 1, gold, 5);
        }
      }
    }
  }

  const c = document.createElement('canvas');
  c.width = N;
  c.height = N;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(N, N);
  for (let i = 0; i < N * N; i++) {
    const v = b.px[i];
    if (v) {
      img.data[i * 4] = v[0];
      img.data[i * 4 + 1] = v[1];
      img.data[i * 4 + 2] = v[2];
      img.data[i * 4 + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

const cache = new Map<string, HTMLCanvasElement>();
const urlCache = new Map<string, string>();

export function monsterPixelCanvas(speciesId: string): HTMLCanvasElement {
  let c = cache.get(speciesId);
  if (!c) {
    c = render(getSpecies(speciesId));
    cache.set(speciesId, c);
  }
  return c;
}

export function monsterPixelUrl(speciesId: string): string {
  let u = urlCache.get(speciesId);
  if (!u) {
    u = monsterPixelCanvas(speciesId).toDataURL('image/png');
    urlCache.set(speciesId, u);
  }
  return u;
}

/** 卵のドット絵 */
export function eggPixelUrl(): string {
  const key = '__egg';
  let u = urlCache.get(key);
  if (u) return u;
  const c = document.createElement('canvas');
  c.width = 16;
  c.height = 16;
  const ctx = c.getContext('2d')!;
  const rows = [
    '.....oooo.....',
    '....obbbbo....',
    '...obhbbbbo...',
    '..obhbbbbbbo..',
    '..obbbssbbbo..',
    '.obbbssssbbbo.',
    '.obbbbssbbbbo.',
    '.obsbbbbbbsso.',
    '.obbbbbbbbbso.',
    '.obbbbsbbbbso.',
    '..obbbbbbbso..',
    '..obbbbbbsso..',
    '...obbbbsso...',
    '....oossoo....',
    '......oo......',
  ];
  const col: Record<string, string> = { o: '#5a4a38', b: '#f4ead2', h: '#ffffff', s: '#d8c7a0' };
  rows.forEach((r, y) => [...r].forEach((ch, x) => { if (col[ch]) { ctx.fillStyle = col[ch]!; ctx.fillRect(x + 1, y + 1, 1, 1); } }));
  u = c.toDataURL('image/png');
  urlCache.set(key, u);
  return u;
}
