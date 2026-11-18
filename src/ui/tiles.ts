import { GATE_THEME } from './art';

/** 16x16 のドット絵タイルをコードで生成する(門ごとの配色と模様) */
export type TileName = 'floorA' | 'floorB' | 'wallTop' | 'wallFace' | 'up' | 'down' | 'chest' | 'chestOpen' | 'boss';
export const TILE_PX = 16;

type RGB = [number, number, number];
const parse = (hex: string): RGB => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const mix = (c: RGB, t: number): RGB => (t >= 0 ? [c[0] + (255 - c[0]) * t, c[1] + (255 - c[1]) * t, c[2] + (255 - c[2]) * t] : [c[0] * (1 + t), c[1] * (1 + t), c[2] * (1 + t)]).map(Math.round) as RGB;
const css = (c: RGB) => `rgb(${c[0]},${c[1]},${c[2]})`;

function rnd(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function canvas(): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = TILE_PX;
  c.height = TILE_PX;
  return [c, c.getContext('2d')!];
}

/** 文字列グリッドからアイコンを描く */
function icon(ctx: CanvasRenderingContext2D, rows: string[], colors: Record<string, string>, ox = 0, oy = 0): void {
  rows.forEach((r, y) => [...r].forEach((ch, x) => {
    const col = colors[ch];
    if (col) {
      ctx.fillStyle = col;
      ctx.fillRect(ox + x, oy + y, 1, 1);
    }
  }));
}

type DecorFn = (ctx: CanvasRenderingContext2D, r: () => number, light: RGB, dark: RGB) => void;

const DECOR: Record<string, DecorFn> = {
  // 草むら
  gate01: (ctx, r, light, dark) => {
    for (let i = 0; i < 5; i++) {
      const x = Math.floor(r() * 14) + 1;
      const y = Math.floor(r() * 12) + 3;
      ctx.fillStyle = css(light);
      ctx.fillRect(x, y, 1, 2);
      ctx.fillStyle = css(dark);
      ctx.fillRect(x + 1, y + 1, 1, 1);
    }
  },
  // 空の石畳
  gate02: (ctx, _r, light) => {
    ctx.fillStyle = css(light);
    ctx.fillRect(0, 7, 16, 1);
    ctx.fillRect(7, 0, 1, 8);
    ctx.fillRect(3, 8, 1, 8);
    ctx.fillRect(11, 8, 1, 8);
  },
  // 水面の波紋
  gate03: (ctx, r, light) => {
    ctx.fillStyle = css(light);
    for (let i = 0; i < 3; i++) {
      const x = Math.floor(r() * 10) + 1;
      const y = Math.floor(r() * 12) + 2;
      ctx.fillRect(x, y, 4, 1);
      ctx.fillRect(x + 1, y + 1, 2, 1);
    }
  },
  // 金属板とリベット
  gate04: (ctx, _r, light, dark) => {
    ctx.fillStyle = css(dark);
    ctx.fillRect(0, 0, 16, 1);
    ctx.fillRect(0, 0, 1, 16);
    ctx.fillStyle = css(light);
    for (const [x, y] of [[2, 2], [13, 2], [2, 13], [13, 13]] as const) ctx.fillRect(x, y, 1, 1);
  },
  // 溶岩のひび割れ
  gate05: (ctx, r) => {
    ctx.fillStyle = 'rgb(255,150,60)';
    let x = Math.floor(r() * 10) + 3;
    for (let y = 1; y < 15; y++) {
      ctx.fillRect(x, y, 1, 1);
      x += r() < 0.5 ? -1 : 1;
      x = Math.max(1, Math.min(14, x));
    }
  },
  // 雪のきらめき
  gate06: (ctx, r) => {
    ctx.fillStyle = 'rgb(255,255,255)';
    for (let i = 0; i < 5; i++) ctx.fillRect(Math.floor(r() * 15), Math.floor(r() * 15), 1, 1);
  },
  // 霧
  gate07: (ctx, r, light) => {
    ctx.fillStyle = css(light);
    for (let i = 0; i < 6; i++) ctx.fillRect(Math.floor(r() * 13), Math.floor(r() * 15), 3, 1);
  },
  // 星屑
  gate08: (ctx, r) => {
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = r() < 0.5 ? 'rgb(255,240,160)' : 'rgb(170,190,255)';
      ctx.fillRect(Math.floor(r() * 15), Math.floor(r() * 15), 1, 1);
    }
  },
};

const tilesetCache = new Map<string, Record<TileName, HTMLCanvasElement>>();

export function buildTileset(gateId: string): Record<TileName, HTMLCanvasElement> {
  const hit = tilesetCache.get(gateId);
  if (hit) return hit;
  const [floorHex, wallHex, patHex] = GATE_THEME[gateId] ?? GATE_THEME['gate01']!;
  const floor = parse(floorHex);
  const wall = parse(wallHex);
  const pat = parse(patHex);
  const seed = gateId.charCodeAt(gateId.length - 1) * 977;

  const makeFloor = (base: RGB, variant: number) => {
    const [c, ctx] = canvas();
    const r = rnd(seed + variant * 31);
    ctx.fillStyle = css(base);
    ctx.fillRect(0, 0, 16, 16);
    // ノイズ
    for (let i = 0; i < 18; i++) {
      ctx.fillStyle = css(mix(base, r() < 0.5 ? 0.07 : -0.08));
      ctx.fillRect(Math.floor(r() * 16), Math.floor(r() * 16), 1, 1);
    }
    DECOR[gateId]?.(ctx, r, mix(base, 0.2), mix(base, -0.2));
    return c;
  };

  const makeWallTop = () => {
    const [c, ctx] = canvas();
    ctx.fillStyle = css(mix(wall, -0.15));
    ctx.fillRect(0, 0, 16, 16);
    const r = rnd(seed + 7);
    for (let i = 0; i < 14; i++) {
      ctx.fillStyle = css(mix(wall, r() < 0.5 ? 0.05 : -0.3));
      ctx.fillRect(Math.floor(r() * 16), Math.floor(r() * 16), 2, 1);
    }
    return c;
  };

  const makeWallFace = () => {
    const [c, ctx] = canvas();
    ctx.fillStyle = css(wall);
    ctx.fillRect(0, 0, 16, 16);
    ctx.fillStyle = css(mix(wall, 0.18));
    ctx.fillRect(0, 0, 16, 2); // 上端のハイライト
    ctx.fillStyle = css(mix(wall, -0.35));
    for (let y = 5; y < 16; y += 5) ctx.fillRect(0, y, 16, 1);
    for (let row = 0; row < 3; row++) {
      const off = row % 2 === 0 ? 4 : 10;
      ctx.fillRect(off, 2 + row * 5 + (row === 0 ? 0 : 0), 1, 4);
    }
    ctx.fillStyle = css(mix(wall, -0.5));
    ctx.fillRect(0, 14, 16, 2); // 足元の影
    return c;
  };

  const makeUp = () => {
    const [c, ctx] = canvas();
    ctx.drawImage(makeFloor(floor, 5), 0, 0);
    ctx.fillStyle = css(mix(pat, -0.3));
    ctx.fillRect(2, 2, 12, 12);
    icon(ctx, ['....##....', '...####...', '..######..', '.########.', '....##....', '....##....', '....##....'], { '#': '#dfe8ff' }, 3, 4);
    return c;
  };

  const makeDown = () => {
    const [c, ctx] = canvas();
    ctx.drawImage(makeFloor(floor, 6), 0, 0);
    ctx.fillStyle = '#2a2000';
    ctx.fillRect(2, 2, 12, 12);
    icon(ctx, ['....##....', '....##....', '....##....', '.########.', '..######..', '...####...', '....##....'], { '#': '#ffd86b' }, 3, 4);
    return c;
  };

  const makeChest = (open: boolean) => {
    const [c, ctx] = canvas();
    ctx.drawImage(makeFloor(floor, 8), 0, 0);
    const col = { o: '#3a2410', b: '#b9772e', l: '#e0a24a', g: '#ffd86b', d: '#6a3f14', e: '#1a0f06' };
    if (!open)
      icon(ctx, ['..oooooooooo..', '.obbbbbbbbbbo.', 'oblllllllllbbo', 'obbbbggbbbbbbo', 'oooooggooooooo', 'obbbbggbbbbbbo', 'obbbbbbbbbbbbo', 'obddddddddddbo', '.oooooooooooo.'], col, 1, 4);
    else
      icon(ctx, ['.ooooooooooo..', 'oblllllllllbo..', 'oeeeeeeeeeeeo..', 'oeeeeeeeeeeeo..', 'oooooooooooooo', 'obbbbbbbbbbbbo', 'obddddddddddbo', '.oooooooooooo.'], col, 1, 5);
    return c;
  };

  const makeBoss = () => {
    const [c, ctx] = canvas();
    ctx.drawImage(makeFloor(floor, 9), 0, 0);
    ctx.fillStyle = 'rgba(255,60,60,0.35)';
    ctx.fillRect(1, 1, 14, 14);
    icon(ctx, ['o..o..o..o', 'ogoogoogoo', 'oggggggggo', 'oyyyyyyyyo', 'oyyrrrryyo', 'oyyyyyyyyo', 'oooooooooo'], { o: '#4a2a00', g: '#ffe27a', y: '#ffc83a', r: '#e23a3a' }, 3, 4);
    return c;
  };

  const set: Record<TileName, HTMLCanvasElement> = {
    floorA: makeFloor(floor, 1),
    floorB: makeFloor(pat, 2),
    wallTop: makeWallTop(),
    wallFace: makeWallFace(),
    up: makeUp(),
    down: makeDown(),
    chest: makeChest(false),
    chestOpen: makeChest(true),
    boss: makeBoss(),
  };
  tilesetCache.set(gateId, set);
  return set;
}
