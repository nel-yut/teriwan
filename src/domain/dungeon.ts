import { Rng } from './rng';

export const MAP_W = 24;
export const MAP_H = 24;

export const T = { WALL: 0, FLOOR: 1, DOWN: 2, UP: 3, CHEST: 4, BOSS: 5 } as const;
export type Tile = (typeof T)[keyof typeof T];

export interface FloorMap {
  w: number;
  h: number;
  tiles: Tile[];
  start: { x: number; y: number };
  exit: { x: number; y: number };
  chests: { x: number; y: number; id: number }[];
  isBossFloor: boolean;
}

interface Room {
  x: number;
  y: number;
  w: number;
  h: number;
}

const center = (r: Room) => ({ x: Math.floor(r.x + r.w / 2), y: Math.floor(r.y + r.h / 2) });
const idx = (x: number, y: number) => y * MAP_W + x;

export function tileAt(m: FloorMap, x: number, y: number): Tile {
  if (x < 0 || y < 0 || x >= m.w || y >= m.h) return T.WALL;
  return m.tiles[idx(x, y)]!;
}

export function isWalkable(m: FloorMap, x: number, y: number): boolean {
  return tileAt(m, x, y) !== T.WALL;
}

export function bossFloor(): FloorMap {
  const tiles: Tile[] = new Array(MAP_W * MAP_H).fill(T.WALL);
  for (let y = 6; y <= 17; y++) for (let x = 6; x <= 17; x++) tiles[idx(x, y)] = T.FLOOR;
  const start = { x: 12, y: 16 };
  const exit = { x: 12, y: 8 };
  tiles[idx(start.x, start.y)] = T.UP;
  tiles[idx(exit.x, exit.y)] = T.BOSS;
  return { w: MAP_W, h: MAP_H, tiles, start, exit, chests: [], isBossFloor: true };
}

/** seed からフロアを決定的に生成。入口と出口は必ず徒歩で到達可能(通路で全部屋を連結)。 */
export function generateFloor(seed: number): FloorMap {
  const rng = new Rng(seed);
  for (let attempt = 0; attempt < 50; attempt++) {
    const m = tryGenerate(rng);
    if (m) return m;
  }
  return fallbackFloor();
}

function carveRoom(tiles: Tile[], r: Room) {
  for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) tiles[idx(x, y)] = T.FLOOR;
}

function carveCorridor(tiles: Tile[], a: { x: number; y: number }, b: { x: number; y: number }, rng: Rng) {
  let { x, y } = a;
  const horizFirst = rng.chance(0.5);
  const stepX = () => {
    while (x !== b.x) {
      x += Math.sign(b.x - x);
      tiles[idx(x, y)] = tiles[idx(x, y)] === T.WALL ? T.FLOOR : tiles[idx(x, y)]!;
    }
  };
  const stepY = () => {
    while (y !== b.y) {
      y += Math.sign(b.y - y);
      tiles[idx(x, y)] = tiles[idx(x, y)] === T.WALL ? T.FLOOR : tiles[idx(x, y)]!;
    }
  };
  if (horizFirst) {
    stepX();
    stepY();
  } else {
    stepY();
    stepX();
  }
}

function tryGenerate(rng: Rng): FloorMap | null {
  const tiles: Tile[] = new Array(MAP_W * MAP_H).fill(T.WALL);
  const rooms: Room[] = [];
  const target = rng.int(6, 10);
  for (let i = 0; i < 80 && rooms.length < target; i++) {
    const w = rng.int(3, 6);
    const h = rng.int(3, 6);
    const x = rng.int(1, MAP_W - w - 2);
    const y = rng.int(1, MAP_H - h - 2);
    const r = { x, y, w, h };
    if (rooms.some((o) => x < o.x + o.w + 2 && x + w + 2 > o.x && y < o.y + o.h + 2 && y + h + 2 > o.y)) continue;
    rooms.push(r);
    carveRoom(tiles, r);
  }
  if (rooms.length < 4) return null;
  // 近い順に連結
  const connected = [rooms[0]!];
  const rest = rooms.slice(1);
  while (rest.length) {
    let best = { d: Infinity, a: connected[0]!, bi: 0 };
    for (const a of connected) {
      rest.forEach((b, bi) => {
        const ca = center(a);
        const cb = center(b);
        const d = Math.abs(ca.x - cb.x) + Math.abs(ca.y - cb.y);
        if (d < best.d) best = { d, a, bi };
      });
    }
    const b = rest.splice(best.bi, 1)[0]!;
    carveCorridor(tiles, center(best.a), center(b), rng);
    connected.push(b);
  }
  // 余分な通路でループを作る
  for (let i = 0; i < 2; i++) carveCorridor(tiles, center(rng.pick(rooms)), center(rng.pick(rooms)), rng);

  // 入口から最も遠い床を出口にする
  const startRoom = rng.pick(rooms);
  const start = center(startRoom);
  const dist = bfs(tiles, start);
  let far = start;
  let fd = -1;
  for (const r of rooms) {
    const c = center(r);
    const d = dist.get(idx(c.x, c.y)) ?? -1;
    if (d > fd) {
      fd = d;
      far = c;
    }
  }
  if (fd < 8) return null;
  tiles[idx(start.x, start.y)] = T.UP;
  tiles[idx(far.x, far.y)] = T.DOWN;

  // 宝箱(到達可能な床のみ、部屋の隅)
  const chests: FloorMap['chests'] = [];
  const nChests = rng.int(1, 3);
  const floorCells: { x: number; y: number }[] = [];
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) if (tiles[idx(x, y)] === T.FLOOR && dist.has(idx(x, y))) floorCells.push({ x, y });
  for (let i = 0; i < nChests && floorCells.length; i++) {
    const c = rng.pick(floorCells);
    if (chests.some((o) => o.x === c.x && o.y === c.y)) continue;
    // 通路をふさがないよう、周囲の床が多い場所(部屋内)に限る
    const open = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => tiles[idx(c.x + dx!, c.y + dy!)] !== T.WALL).length;
    if (open < 3) continue;
    tiles[idx(c.x, c.y)] = T.CHEST;
    chests.push({ x: c.x, y: c.y, id: chests.length });
  }
  // 宝箱を置いても出口へ到達できることを再確認
  const d2 = bfs(tiles, start, true);
  if (!d2.has(idx(far.x, far.y))) return null;
  return { w: MAP_W, h: MAP_H, tiles, start, exit: far, chests, isBossFloor: false };
}

/** 歩行可能な範囲(宝箱は踏める)の BFS 距離 */
function bfs(tiles: Tile[], from: { x: number; y: number }, _chestsWalkable = true): Map<number, number> {
  const dist = new Map<number, number>([[idx(from.x, from.y), 0]]);
  const q = [from];
  while (q.length) {
    const c = q.shift()!;
    const d = dist.get(idx(c.x, c.y))!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = c.x + dx;
      const ny = c.y + dy;
      if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H) continue;
      if (tiles[idx(nx, ny)] === T.WALL || dist.has(idx(nx, ny))) continue;
      dist.set(idx(nx, ny), d + 1);
      q.push({ x: nx, y: ny });
    }
  }
  return dist;
}

function fallbackFloor(): FloorMap {
  const tiles: Tile[] = new Array(MAP_W * MAP_H).fill(T.WALL);
  for (let x = 2; x <= 21; x++) tiles[idx(x, 12)] = T.FLOOR;
  tiles[idx(2, 12)] = T.UP;
  tiles[idx(21, 12)] = T.DOWN;
  return { w: MAP_W, h: MAP_H, tiles, start: { x: 2, y: 12 }, exit: { x: 21, y: 12 }, chests: [], isBossFloor: false };
}

/** テスト用: start から exit まで徒歩で行けるか */
export function isExitReachable(m: FloorMap): boolean {
  const d = bfs(m.tiles, m.start);
  return d.has(idx(m.exit.x, m.exit.y));
}

export function floorSeed(runSeed: number, gateId: string, floor: number): number {
  let h = runSeed >>> 0;
  for (const ch of `${gateId}:${floor}`) h = (Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0);
  return h >>> 0;
}
