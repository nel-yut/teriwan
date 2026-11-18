import { describe, expect, it } from 'vitest';
import { Game } from '../src/application/game';
import { playThrough } from './bot';

describe('headless playthrough', () => {
  it('can be cleared by AI auto-play only (progression is reachable)', () => {
    const g = Game.create(null, 0, 20260101);
    const st = playThrough(g);
    console.log(JSON.stringify({ ...st, log: undefined }), '\n' + st.log.join('\n'));
    expect(st.finished).toBe(true);
  }, 300000);
});
