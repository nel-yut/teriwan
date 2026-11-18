/** seed 付き PRNG (mulberry32)。状態は 32bit 整数 1 つなのでセーブ可能。 */
export class Rng {
  private s: number;

  constructor(seed: number | string) {
    this.s = (typeof seed === 'number' ? seed : hashString(seed)) >>> 0;
  }

  getState(): number {
    return this.s;
  }

  setState(state: number): void {
    this.s = state >>> 0;
  }

  /** [0,1) */
  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** min..max (両端含む) の整数 */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(arr: readonly T[]): T {
    if (arr.length === 0) throw new Error('pick from empty array');
    return arr[Math.floor(this.next() * arr.length)] as T;
  }

  /** 独立した子 RNG。親の状態を 1 回だけ消費する。 */
  fork(): Rng {
    return new Rng(Math.floor(this.next() * 4294967296));
  }
}

export function hashString(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
