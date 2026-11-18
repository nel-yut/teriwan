import { getSpecies } from '../domain/monster';
import type { ArtShape, MonsterSpecies } from '../domain/types';

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

const BASE: Record<ArtShape, { body: string; accent: string }> = {
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

/** 種族ごとの見た目の個性(同じ体型テンプレートの10種が別物に見えるよう、形・部位・模様・目・口を組み合わせる) */
interface Traits {
  sx: number;
  sy: number;
  mask: number;
  pattern: number;
  eye: number;
  mouth: number;
  acc: number;
  /** 0..1 の決定的な乱数 */
  h: (k: number) => number;
}

const RANK_SCALE = { E: 0.8, D: 0.86, C: 0.93, B: 1.0, A: 1.07, S: 1.13 } as const;
const MASKS = [0b0001, 0b0010, 0b0100, 0b1000, 0b0011, 0b0101, 0b0110, 0b1001, 0b0111, 0b1111];

function traitsOf(sp: MonsterSpecies): Traits {
  const fam = ['sprout', 'beast', 'wing', 'scale', 'metal', 'shade', 'flame', 'frost', 'astral', 'dragon'].indexOf(sp.art.shape);
  const seed = fam * 100 + sp.art.variant * 7 + 13;
  const h = (k: number) => hash(seed * 31 + k * 977);
  const rs = RANK_SCALE[sp.rank];
  return {
    sx: rs * (0.86 + 0.28 * h(1)),
    sy: rs * (0.86 + 0.28 * h(2)),
    mask: MASKS[sp.art.variant]!,
    pattern: (sp.art.variant + fam * 2) % 6,
    eye: (sp.art.variant * 2 + fam) % 4,
    mouth: (sp.art.variant + fam) % 3,
    acc: sp.art.variant % 5,
    h,
  };
}

function makePalette(sp: MonsterSpecies, t: Traits): Pal {
  const base = BASE[sp.art.shape];
  const hue = (t.h(3) - 0.5) * 90;
  const body = shade(shade(hexToRgb(base.body), (t.h(4) - 0.5) * 0.14, hue), 0);
  const accent = shade(hexToRgb(base.accent), (t.h(5) - 0.5) * 0.1, (t.h(6) - 0.5) * 120);
  return { body, light: shade(body, 0.14), dark: shade(body, -0.16, -6), outline: shade(body, -0.38, -10), accent, accentDark: shade(accent, -0.22) };
}

// ---------- 体型テンプレートごとの描画 ----------
function drawFamily(b: Buf, sp: MonsterSpecies, p: Pal, t: Traits): { eyeY: number; eyeDX: number } {
  const cx = 11.5;
  const has = (bit: number) => (t.mask & bit) !== 0;
  const { sx, sy } = t;
  const rx = (v: number) => Math.min(11, v * sx);
  const ry = (v: number) => Math.min(9.5, v * sy);
  const gold: RGB = [255, 216, 107];
  switch (sp.art.shape) {
    case 'sprout': {
      const cy = 15.5;
      b.ellipse(cx, cy, rx(8.5), ry(7.5), p.body);
      const top = Math.round(cy - ry(7.5));
      b.set(11, top, p.accentDark);
      b.set(12, top, p.accentDark);
      b.set(11, top - 1, p.accentDark);
      b.poly([[12, top], [17, top - 3], [19, top], [15, top + 2]], p.accent);
      b.poly([[11, top], [7, top - 3], [5, top], [9, top + 2]], shade(p.accent, -0.08, -20));
      if (has(1)) b.poly([[11.5, top - 3], [13, top - 5], [14, top - 2]], p.accent);
      if (has(2)) {
        // 花
        for (const [dx, dy] of [[-2, -1], [2, -1], [0, -3], [0, 1]] as const) b.set(11.5 + dx, top - 2 + dy, [255, 140, 170]);
        b.set(11, top - 2, gold);
        b.set(12, top - 2, gold);
      }
      if (has(4)) {
        // キノコの傘
        b.ellipse(cx, top + 1, rx(8), 2.6, [220, 90, 90], 2);
        b.set(7, top, [255, 255, 255], 2);
        b.set(12, top - 1, [255, 255, 255], 2);
        b.set(16, top, [255, 255, 255], 2);
      }
      if (has(8)) {
        b.rect(1, cy + 1, 3, cy + 2, p.dark, 2);
        b.rect(20, cy + 1, 22, cy + 2, p.dark, 2);
        b.set(1, cy, p.accent, 2);
        b.set(22, cy, p.accent, 2);
      }
      return { eyeY: Math.round(cy - 2), eyeDX: 3.5 };
    }
    case 'beast': {
      const cy = 15;
      const earH = 4 + Math.round(t.h(7) * 4);
      b.poly([[3, 9], [5, 9 - earH], [9, 7]], p.dark, 2);
      b.poly([[20, 9], [18, 9 - earH], [14, 7]], p.dark, 2);
      b.poly([[4, 8], [5, 9 - earH + 2], [8, 7]], p.accent, 2);
      b.poly([[19, 8], [18, 9 - earH + 2], [15, 7]], p.accent, 2);
      if (has(2)) b.ellipse(cx, cy - 1, rx(10.5), ry(8.5), p.dark, 2);
      b.ellipse(cx, cy, rx(9), ry(7.5), p.body);
      b.rect(5, 20, 8, 22, p.body);
      b.rect(15, 20, 18, 22, p.body);
      b.ellipse(cx, 18, 4.5, 3, p.accent, 2);
      if (has(1)) {
        b.poly([[19, 17], [23, 12], [23, 18], [20, 20]], p.dark, 2);
        b.set(23, 12, p.accent, 2);
      }
      if (has(4)) b.poly([[11, 8], [12, 4], [13, 8]], p.accent, 2);
      if (has(8)) {
        b.set(8, 19, [255, 255, 255], 2);
        b.set(15, 19, [255, 255, 255], 2);
      }
      return { eyeY: 13, eyeDX: 3.5 };
    }
    case 'wing': {
      const wingR = has(4) ? 1.25 : 1;
      b.poly([[2, 11], [0, 16 * wingR], [4, 21], [7, 15]], p.accent, 2);
      b.poly([[21, 11], [23, 16 * wingR], [19, 21], [16, 15]], p.accent, 2);
      for (let i = 0; i < 3; i++) b.sym(2 + i, 14 + i * 2, p.accentDark);
      b.ellipse(cx, 14, rx(7.5), ry(7.5), p.body);
      b.poly([[10, 15], [13, 15], [11.5, 18]], [245, 185, 66], 2);
      if (has(1)) b.poly([[10, 6], [11.5, 1], [13, 6]], p.accent, 2);
      if (has(8)) {
        b.poly([[8, 7], [6, 3], [10, 6]], p.accentDark, 2);
        b.poly([[15, 7], [17, 3], [13, 6]], p.accentDark, 2);
      }
      if (has(2)) b.poly([[10, 21], [11.5, 24], [13, 21]], p.accent, 2);
      b.sym(8, 22, [240, 170, 70], 2);
      b.sym(9, 22, [240, 170, 70], 2);
      return { eyeY: 12, eyeDX: 3 };
    }
    case 'scale': {
      const cy = 15;
      b.ellipse(21, 17, 2.5, 1.7, p.dark, 2);
      b.ellipse(cx - 0.5, cy, rx(9), ry(6.5), p.body);
      b.ellipse(cx - 0.5, 19, 6, 2.5, p.accent, 2);
      for (let x = 6; x <= 16; x += 3) for (let y = 11; y <= 13; y += 2) b.set(x + (y % 4 === 1 ? 1 : 0), y, p.dark, 2);
      if (has(1)) for (const x of [7, 10, 13, 16]) b.poly([[x - 1, 10], [x, 6 + (x % 3)], [x + 1, 10]], p.accentDark, 2);
      if (has(2)) b.ellipse(cx - 0.5, 16, rx(8), ry(5), p.dark, 2);
      if (has(4)) {
        b.poly([[3, 14], [0, 11], [3, 18]], p.accent, 2);
        b.poly([[20, 14], [23, 11], [20, 18]], p.accent, 2);
      }
      if (has(8)) b.poly([[10, 8], [11.5, 3], [13, 8]], p.accent, 2);
      b.rect(6, 21, 8, 22, p.body);
      b.rect(15, 21, 17, 22, p.body);
      return { eyeY: 13, eyeDX: 3.5 };
    }
    case 'metal': {
      const w = Math.round(rx(7.5));
      const x0 = 11 - w + 1;
      const x1 = 12 + w - 1;
      const top = Math.round(12 - ry(5));
      b.rect(x0, top, x1, 21, p.body);
      b.rect(x0 + 1, top - 1, x1 - 1, top - 1, p.body);
      b.rect(x0 + 1, 22, x1 - 1, 22, p.body);
      b.rect(11, top - 4, 12, top - 2, p.dark, 2);
      b.ellipse(cx, top - 4.5, 2, 2, p.accent, 2);
      b.rect(x0 + 2, 17, x1 - 2, 19, p.dark, 2);
      b.rect(x0 + 2, 17, x1 - 2, 17, p.accentDark, 2);
      for (const [x, y] of [[x0 + 1, top + 2], [x1 - 1, top + 2], [x0 + 1, 20], [x1 - 1, 20]] as const) b.set(x, y, p.accent, 2);
      if (has(1)) {
        b.rect(x0 - 3, 12, x0 - 1, 15, p.dark, 2);
        b.rect(x1 + 1, 12, x1 + 3, 15, p.dark, 2);
      }
      if (has(2)) {
        b.rect(x0 + 1, top - 4, x0 + 1, top - 2, p.dark, 2);
        b.rect(x1 - 1, top - 4, x1 - 1, top - 2, p.dark, 2);
      }
      if (has(4)) b.rect(x0 + 1, 10, x1 - 1, 12, [60, 90, 140], 2);
      if (has(8)) b.ellipse(cx, top, 4, 2, p.dark, 2);
      return { eyeY: has(4) ? 10 : 12, eyeDX: 3.5 };
    }
    case 'shade': {
      const cy = 11;
      b.ellipse(cx, cy, rx(8.5), ry(8), p.body);
      b.rect(3, cy, 20, 20, p.body);
      for (let x = 3; x <= 20; x++) {
        const wave = ((x - 3) % 6) < 3 ? 22 : 20;
        for (let y = 21; y <= wave; y++) b.set(x, y, p.body);
        if (wave === 20) b.set(x, 21, null);
      }
      if (has(1)) b.poly([[7, 7], [11.5, 0], [16, 7]], p.dark, 2);
      if (has(2)) {
        b.rect(0, 14, 2, 15, p.body);
        b.rect(21, 14, 23, 15, p.body);
      }
      if (has(4)) {
        b.set(2, 6, p.accent, 2);
        b.set(21, 8, p.accent, 2);
        b.set(1, 10, p.accent, 2);
      }
      if (has(8)) {
        b.poly([[7, 5], [6, 1], [10, 4]], p.accent, 2);
        b.poly([[16, 5], [17, 1], [13, 4]], p.accent, 2);
      }
      b.set(11, 2, p.accent, 2);
      b.set(12, 2, p.accent, 2);
      return { eyeY: 11, eyeDX: 3.5 };
    }
    case 'flame': {
      const k = sy;
      b.poly([[11.5, 24 - 24 * k + 0], [16, 8 + (1 - k) * 8], [20, 13 + (1 - k) * 5], [20, 19], [16, 22], [7, 22], [3, 19], [3, 13 + (1 - k) * 5], [7, 8 + (1 - k) * 8]], p.body);
      b.poly([[11.5, 10 + (1 - k) * 4], [15, 15], [14, 21], [9, 21], [8, 15]], p.accent, 2);
      if (has(1)) {
        b.poly([[4, 10], [2, 5], [6, 8]], p.body);
        b.poly([[19, 10], [21, 5], [17, 8]], p.body);
      }
      if (has(2)) b.poly([[20, 18], [23, 14], [23, 20]], p.accent, 2);
      if (has(4)) {
        b.poly([[7, 9], [5, 5], [9, 8]], p.dark, 2);
        b.poly([[16, 9], [18, 5], [14, 8]], p.dark, 2);
      }
      if (has(8)) {
        b.set(5, 6, p.accent, 2);
        b.set(18, 5, p.accent, 2);
        b.set(2, 12, p.accent, 2);
        b.set(21, 11, p.accent, 2);
      }
      return { eyeY: 15, eyeDX: 3 };
    }
    case 'frost': {
      const k = sy;
      b.poly([[11.5, 12 - 11 * k], [4 + (1 - sx) * 4, 8 + (1 - k) * 4], [4 + (1 - sx) * 4, 17], [11.5, 23], [19 - (1 - sx) * 4, 17], [19 - (1 - sx) * 4, 8 + (1 - k) * 4]], p.body);
      b.poly([[11.5, 12 - 11 * k], [11.5, 23], [4, 8]], p.light, 2);
      b.poly([[11.5, 4], [16, 8], [11.5, 12]], p.accent, 2);
      if (has(1)) {
        b.poly([[3, 14], [0, 10], [4, 12]], p.accent, 2);
        b.poly([[20, 14], [23, 10], [19, 12]], p.accent, 2);
      }
      if (has(2)) b.poly([[10, 4], [11.5, 0], [13, 4]], p.accent, 2);
      if (has(4)) {
        b.set(5, 20, [255, 255, 255], 2);
        b.set(18, 20, [255, 255, 255], 2);
        b.set(12, 21, [255, 255, 255], 2);
      }
      if (has(8)) for (const x of [9, 11, 13, 15]) b.rect(x, 20, x, 22 + (x % 2), p.accent, 2);
      return { eyeY: 13, eyeDX: 3 };
    }
    case 'astral': {
      const pts: [number, number][] = [];
      const spikes = has(8) ? 6 : 5;
      const outer = Math.min(11.5, 9 * (sx + sy) * 0.65);
      for (let i = 0; i < spikes * 2; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / spikes;
        const r = i % 2 === 0 ? outer : outer * 0.45;
        pts.push([11.5 + Math.cos(a) * r, 12.5 + Math.sin(a) * r]);
      }
      b.poly(pts, p.body);
      b.ellipse(cx, 12.5, 2.5, 2.5, p.accent, 2);
      if (has(1)) b.poly([[17, 2], [20, 4], [17, 6], [18.5, 4]], p.accent, 2);
      if (has(2)) {
        b.set(2, 3, p.accent, 2);
        b.set(21, 4, p.accent, 2);
        b.set(20, 21, p.accent, 2);
        b.set(3, 20, p.accent, 2);
      }
      if (has(4)) {
        for (let x = 1; x <= 22; x++) if (x < 5 || x > 18) b.set(x, 13 + (x < 12 ? 0 : 1), p.accentDark, 2);
      }
      return { eyeY: 11, eyeDX: 2.5 };
    }
    case 'dragon': {
      const cy = 15;
      const wingK = has(2) ? 1.3 : 1;
      b.poly([[2, 8], [0, 15 * wingK], [5, 18], [8, 12]], p.dark, 2);
      b.poly([[21, 8], [23, 15 * wingK], [18, 18], [15, 12]], p.dark, 2);
      b.ellipse(21, 19, 2.5, 1.5, p.dark, 2);
      b.ellipse(cx, cy, rx(8), ry(7.5), p.body);
      const horn = has(1) ? 2 : 0;
      b.poly([[6, 9], [4 - horn, 2 - horn / 2], [9, 7]], p.accent, 2);
      b.poly([[17, 9], [19 + horn, 2 - horn / 2], [14, 7]], p.accent, 2);
      b.ellipse(cx, 19, 4, 2.5, p.accent, 2);
      if (has(4)) for (const x of [10, 11.5, 13]) b.poly([[x - 1, 7], [x, 4], [x + 1, 7]], p.accentDark, 2);
      if (has(8)) b.poly([[10, 17], [13, 17], [11.5, 20]], [255, 120, 60], 2);
      b.rect(6, 21, 8, 22, p.body);
      b.rect(15, 21, 17, 22, p.body);
      return { eyeY: 13, eyeDX: 3.5 };
    }
  }
}

function render(sp: MonsterSpecies): HTMLCanvasElement {
  const b = new Buf();
  const t = traitsOf(sp);
  const p = makePalette(sp, t);
  const { eyeY, eyeDX } = drawFamily(b, sp, p, t);

  // 体の陰影(左上を明るく、右下を暗く)
  const bodyPix: { x: number; y: number }[] = [];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (b.kind[y * N + x] === 1) bodyPix.push({ x, y });
  if (bodyPix.length) {
    const minX = Math.min(...bodyPix.map((q) => q.x));
    const maxX = Math.max(...bodyPix.map((q) => q.x));
    const minY = Math.min(...bodyPix.map((q) => q.y));
    const maxY = Math.max(...bodyPix.map((q) => q.y));
    for (const { x, y } of bodyPix) {
      const k = (x - minX) / Math.max(1, maxX - minX) + (y - minY) / Math.max(1, maxY - minY);
      if (k > 1.2) b.set(x, y, p.dark, 1);
      else if (k < 0.5 && hash(x * 31 + y * 17 + sp.art.variant) > 0.15) b.set(x, y, p.light, 1);
    }
    const isBody = (x: number, y: number) => b.kind[y * N + x] === 1;
    const mid = Math.round((minY + maxY) / 2);
    // 模様(種族ごとに違う)
    switch (t.pattern) {
      case 1: // 斑点
        for (let i = 0; i < 5; i++) {
          const x = minX + 2 + Math.floor(t.h(10 + i) * (maxX - minX - 3));
          const y = mid + Math.floor((t.h(20 + i) - 0.3) * (maxY - mid));
          if (isBody(x, y)) {
            b.set(x, y, p.dark, 1);
            if (isBody(x + 1, y)) b.set(x + 1, y, p.dark, 1);
          }
        }
        break;
      case 2: // 縞
        for (let y = mid; y <= maxY - 1; y += 3) for (let x = minX; x <= maxX; x++) if (isBody(x, y)) b.set(x, y, p.dark, 1);
        break;
      case 3: // おなか
        for (let y = mid + 1; y <= maxY - 1; y++) for (let x = 8; x <= 15; x++) if (isBody(x, y) && Math.abs(x - 11.5) <= 3.5 - Math.abs(y - (mid + 3)) * 0.4) b.set(x, y, shade(p.accent, -0.02), 1);
        break;
      case 4: // 頬
        for (const x of [Math.round(11.5 - eyeDX) - 2, Math.round(11.5 + eyeDX) + 1]) if (isBody(x, eyeY + 2)) b.set(x, eyeY + 2, [255, 140, 150], 1);
        break;
      case 5: // 上半分を明るく
        for (let y = minY; y < mid - 1; y++) for (let x = minX; x <= maxX; x++) if (isBody(x, y)) b.set(x, y, p.light, 1);
        break;
      default:
        break;
    }
    // 小物(個体差)
    const colTop = (x: number) => {
      for (let y = 0; y < N; y++) if (b.get(x, y)) return y;
      return minY;
    };
    if (sp.art.variant >= 2) {
      switch (t.acc) {
        case 1: // 傷
          b.set(Math.round(11.5 - eyeDX) - 1, eyeY - 2, [255, 255, 255], 4);
          b.set(Math.round(11.5 - eyeDX), eyeY - 1, [255, 255, 255], 4);
          b.set(Math.round(11.5 - eyeDX) + 1, eyeY, [255, 255, 255], 4);
          break;
        case 2: // リボン
          b.rect(10, maxY - 3, 13, maxY - 3, [230, 70, 80], 4);
          b.set(10, maxY - 2, [230, 70, 80], 4);
          b.set(13, maxY - 2, [230, 70, 80], 4);
          break;
        case 3: // 頭のはね
          for (const dx of [-1, 0, 1]) b.set(11 + dx + (dx > 0 ? 1 : 0), colTop(11) - 1 - (dx === 0 ? 1 : 0), p.accent, 4);
          break;
        case 4: // 角のこぶ
          b.set(8, colTop(8) - 1, p.accentDark, 4);
          b.set(15, colTop(15) - 1, p.accentDark, 4);
          break;
        default:
          break;
      }
    }
  }

  // アウトライン
  const outlined: [number, number][] = [];
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      if (b.get(x, y)) continue;
      if (b.get(x - 1, y) || b.get(x + 1, y) || b.get(x, y - 1) || b.get(x, y + 1)) outlined.push([x, y]);
    }
  }
  for (const [x, y] of outlined) b.set(x, y, p.outline, 3);

  // 目と口(種族ごとに違う)
  const lx = Math.round(11.5 - eyeDX);
  const rx = Math.round(11.5 + eyeDX);
  const white: RGB = [255, 255, 255];
  const dark: RGB = [26, 26, 48];
  for (const [x, dir] of [[lx, -1], [rx, 1]] as const) {
    switch (t.eye) {
      case 1: // 大きな瞳
        b.set(x, eyeY - 1, dark, 4);
        b.set(x, eyeY, dark, 4);
        b.set(x, eyeY + 1, dark, 4);
        b.set(x + dir, eyeY, dark, 4);
        b.set(x + dir, eyeY + 1, dark, 4);
        b.set(x + dir, eyeY - 1, white, 4);
        break;
      case 2: // 眠たげ(線)
        b.set(x, eyeY + 1, dark, 4);
        b.set(x + dir, eyeY + 1, dark, 4);
        b.set(x - dir, eyeY + 1, dark, 4);
        break;
      case 3: // つり目
        b.set(x, eyeY, dark, 4);
        b.set(x, eyeY + 1, dark, 4);
        b.set(x + dir, eyeY, white, 4);
        b.set(x - dir, eyeY - 1, dark, 4);
        b.set(x, eyeY - 1, dark, 4);
        break;
      default:
        b.set(x, eyeY, dark, 4);
        b.set(x, eyeY + 1, dark, 4);
        b.set(x + dir, eyeY, white, 4);
        b.set(x + dir, eyeY + 1, dark, 4);
    }
  }
  const my = eyeY + 3;
  if (t.mouth === 1) {
    b.set(11, my, dark, 4);
    b.set(12, my, dark, 4);
    b.set(11, my + 1, [220, 80, 90], 4);
    b.set(12, my + 1, [220, 80, 90], 4);
  } else if (t.mouth === 2) {
    b.set(10, my, dark, 4);
    b.set(11, my, dark, 4);
    b.set(12, my, dark, 4);
    b.set(13, my, dark, 4);
    b.set(10, my + 1, white, 4);
    b.set(13, my + 1, white, 4);
  } else {
    b.set(11, my, dark, 4);
    b.set(12, my, dark, 4);
  }

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
