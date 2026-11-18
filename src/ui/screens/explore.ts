import { getItem } from '../../application/game';
import { GATE_CLEAR, GATE_INTRO } from '../../data/story';
import { GATES } from '../../data/world';
import { STRATEGY_LABEL } from '../../domain/battle';
import { MAP_H, MAP_W, T, tileAt } from '../../domain/dungeon';
import { getGate } from '../../domain/encounter';
import { monsterName } from '../../domain/monster';
import type { App } from '../app';
import { GATE_THEME, monsterSvg } from '../art';
import { bar, h } from '../dom';
import { sfx } from '../sfx';
import { runBattle } from './battle';
import { describeRequirement } from '../../application/game';

export function gatesScreen(app: App): void {
  const g = app.g;
  const rows = GATES.map((gate) => {
    const unlocked = g.isGateUnlocked(gate);
    const cleared = !!g.flag(`${gate.id}Clear`);
    const m = /^tournament:(\d+)$/.exec(gate.unlock);
    const reason = unlocked ? '' : `競技場の「${['', '見習い', '青銅', '白銀', '黄金', '星冠'][Number(m?.[1] ?? 0)]}」大会に優勝すると開く`;
    return h(
      'div',
      { class: `gate-row${unlocked ? '' : ' locked'}` },
      h('div', { class: 'gate-info' }, h('strong', null, `${gate.name}${cleared ? ' ✅' : ''}`), h('small', null, `全${gate.floors}階 / 推奨Lv ${gate.recommendedLevel[0]}〜${gate.recommendedLevel[1]}`), reason ? h('small', { class: 'warn' }, reason) : null),
      h(
        'button',
        {
          class: 'btn primary',
          disabled: !unlocked,
          onclick: async () => {
            const err = g.canEnterGate(gate);
            if (err) return app.toast(err);
            sfx.click();
            g.startRun(gate.id);
            await app.autosave();
            await app.dialog([{ text: `${gate.name}に入った。` }, ...(GATE_INTRO[gate.id] ?? [])]);
            app.go('explore');
          },
        },
        '出発',
      ),
    );
  });
  app.mount(
    h('main', { class: 'screen' }, h('h2', null, '門の間'), h('p', { class: 'fine' }, 'パーティが全員戦闘不能のときは入れません。街に戻ると全回復します。'), h('div', { class: 'stack' }, rows), h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => app.go('base') }, 'もどる'))),
  );
  void describeRequirement;
}

const VIEW = 11;
const TILE = 32;

export function exploreScreen(app: App): void {
  const g = app.g;
  if (!g.run) return app.go('base');
  const gate = getGate(g.run.gateId);

  const canvas = h('canvas', { width: VIEW * TILE, height: VIEW * TILE, class: 'map', 'aria-label': 'ダンジョンマップ' });
  const mini = h('canvas', { width: MAP_W * 3, height: MAP_H * 3, class: 'minimap', 'aria-label': 'ミニマップ' });
  const ctx = canvas.getContext('2d')!;
  const mctx = mini.getContext('2d')!;
  const title = h('div', { class: 'hud-title' });
  const party = h('div', { class: 'hud-party' });
  let busy = false;
  const visited = new Set<string>();
  let spriteImg: HTMLImageElement | null = null;

  const loadSprite = () => {
    const lead = g.party.find((m) => m.currentHp > 0) ?? g.party[0]!;
    const img = new Image();
    img.onload = () => {
      spriteImg = img;
      draw();
    };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(monsterSvg(lead.speciesId, 64));
  };

  const theme = () => GATE_THEME[gate.id]!;

  const draw = () => {
    const run = g.run;
    if (!run) return;
    const map = g.currentMap();
    const [floorC, wallC, patC, bg] = theme();
    visited.add(`${run.floor}:${run.x},${run.y}`);
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) visited.add(`${run.floor}:${run.x + dx},${run.y + dy}`);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const half = Math.floor(VIEW / 2);
    for (let vy = 0; vy < VIEW; vy++) {
      for (let vx = 0; vx < VIEW; vx++) {
        const mx = run.x - half + vx;
        const my = run.y - half + vy;
        const t = tileAt(map, mx, my);
        const px = vx * TILE;
        const py = vy * TILE;
        if (t === T.WALL) {
          // 周囲に床がある壁だけ描く(奥行き感)
          const near = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]].some(([ax, ay]) => tileAt(map, mx + ax!, my + ay!) !== T.WALL);
          if (!near) continue;
          ctx.fillStyle = wallC;
          ctx.fillRect(px, py, TILE, TILE);
          ctx.fillStyle = 'rgba(0,0,0,.25)';
          ctx.fillRect(px, py + TILE - 6, TILE, 6);
          ctx.strokeStyle = 'rgba(255,255,255,.07)';
          ctx.strokeRect(px + 0.5, py + 0.5, TILE - 1, TILE - 1);
          continue;
        }
        ctx.fillStyle = (mx + my) % 2 === 0 ? floorC : patC;
        ctx.fillRect(px, py, TILE, TILE);
        if (t === T.UP) {
          ctx.fillStyle = 'rgba(255,255,255,.55)';
          ctx.font = `${TILE * 0.7}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('⬆', px + TILE / 2, py + TILE / 2);
        } else if (t === T.DOWN) {
          ctx.fillStyle = '#ffd86b';
          ctx.font = `${TILE * 0.7}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('⬇', px + TILE / 2, py + TILE / 2);
        } else if (t === T.BOSS) {
          ctx.fillStyle = 'rgba(255,60,60,.35)';
          ctx.beginPath();
          ctx.arc(px + TILE / 2, py + TILE / 2, TILE * 0.45, 0, Math.PI * 2);
          ctx.fill();
          ctx.font = `${TILE * 0.7}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = '#fff';
          ctx.fillText('👑', px + TILE / 2, py + TILE / 2);
        } else if (t === T.CHEST) {
          const chest = map.chests.find((c) => c.x === mx && c.y === my);
          const opened = chest && run.openedChests.includes(chest.id);
          ctx.font = `${TILE * 0.65}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(opened ? '📭' : '🎁', px + TILE / 2, py + TILE / 2);
        }
      }
    }
    // プレイヤー
    const cx = half * TILE;
    if (spriteImg) ctx.drawImage(spriteImg, cx - 2, cx - 6, TILE + 4, TILE + 4);
    else {
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(cx + TILE / 2, cx + TILE / 2, 10, 0, Math.PI * 2);
      ctx.fill();
    }
    // ミニマップ
    mctx.fillStyle = 'rgba(0,0,0,.6)';
    mctx.fillRect(0, 0, mini.width, mini.height);
    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        if (!visited.has(`${run.floor}:${x},${y}`)) continue;
        const t = tileAt(map, x, y);
        if (t === T.WALL) continue;
        mctx.fillStyle = t === T.DOWN ? '#ffd86b' : t === T.BOSS ? '#ff5a5a' : t === T.UP ? '#9bd' : t === T.CHEST ? '#e8a' : '#789';
        mctx.fillRect(x * 3, y * 3, 3, 3);
      }
    }
    mctx.fillStyle = '#fff';
    mctx.fillRect(run.x * 3 - 1, run.y * 3 - 1, 5, 5);
    title.textContent = `${gate.name}  ${run.floor}/${gate.floors}F${map.isBossFloor ? '  (最奥)' : ''}`;
    party.replaceChildren(
      ...g.party.map((m) =>
        h('div', { class: `mini-unit${m.currentHp <= 0 ? ' dead' : ''}` }, h('span', null, `${monsterName(m)} Lv${m.level}`), bar(m.currentHp, m.stats.hp), bar(m.currentMp, m.stats.mp, 'mp'), h('small', null, `${m.currentHp}/${m.stats.hp}`)),
      ),
    );
  };

  const goHome = async () => {
    await app.autosave();
    app.go('base');
  };

  const afterBattle = async (result: 'victory' | 'defeat' | 'escape') => {
    if (result === 'defeat') {
      g.defeatReturn();
      await goHome();
      return true;
    }
    await app.autosave();
    loadSprite();
    return false;
  };

  const step = async (dx: number, dy: number) => {
    if (busy || !g.run) return;
    const ev = g.move(dx, dy);
    if (ev.kind === 'blocked') return;
    sfx.step();
    draw();
    if (ev.kind === 'step') return;
    busy = true;
    try {
      if (ev.kind === 'encounter') {
        const b = g.startWildBattle();
        const s = await runBattle(app, b, 'wild', `${b.enemies.map((e) => e.name).join('、')}が現れた!`);
        if (await afterBattle(s.result)) return;
      } else if (ev.kind === 'floor') {
        app.toast(`${ev.floor}階へ進んだ。`);
        await app.autosave();
      } else if (ev.kind === 'chest') {
        sfx.chest();
        await app.dialog([{ text: ev.text }]);
        await app.autosave();
      } else if (ev.kind === 'boss') {
        await app.dialog([{ text: '最奥に、強い気配が立ちふさがっている…!' }]);
        const b = g.startBossBattle();
        const s = await runBattle(app, b, 'boss', `${b.enemies[0]!.name}が襲いかかってきた!`);
        if (s.result === 'victory') {
          const firstClear = !g.flag(`${gate.id}Clear`);
          g.clearGate(gate.id);
          await app.autosave();
          if (firstClear) await app.dialog(GATE_CLEAR[gate.id] ?? []);
          app.toast(`${gate.name}を踏破した!`);
          await goHome();
          return;
        }
        if (await afterBattle(s.result)) return;
      } else if (ev.kind === 'exit') {
        if (await app.confirm('街へ戻りますか?(この探索は終了します)', '戻る', 'まだ探索する')) {
          g.leaveDungeon();
          await goHome();
          return;
        }
      }
    } finally {
      busy = false;
      draw();
    }
  };

  // ---------- 入力 ----------
  const dirs: Record<string, [number, number]> = {
    ArrowUp: [0, -1], w: [0, -1], ArrowDown: [0, 1], s: [0, 1], ArrowLeft: [-1, 0], a: [-1, 0], ArrowRight: [1, 0], d: [1, 0],
  };
  let held: [number, number] | null = null;
  let timer: number | null = null;
  const startHold = (d: [number, number]) => {
    held = d;
    void step(d[0], d[1]);
    if (timer) clearInterval(timer);
    timer = window.setInterval(() => held && void step(held[0], held[1]), 140);
  };
  const stopHold = () => {
    held = null;
    if (timer) clearInterval(timer);
    timer = null;
  };
  const onKeyDown = (e: KeyboardEvent) => {
    const d = dirs[e.key];
    if (!d || e.repeat || document.querySelector('.overlay')) return;
    e.preventDefault();
    startHold(d);
  };
  const onKeyUp = (e: KeyboardEvent) => {
    if (dirs[e.key]) stopHold();
  };
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);
  app.setCleanup(() => {
    stopHold();
    document.removeEventListener('keydown', onKeyDown);
    document.removeEventListener('keyup', onKeyUp);
  });

  const pad = (label: string, d: [number, number], cls: string) => {
    const b = h('button', { class: `pad ${cls}`, 'aria-label': label }, { up: '▲', down: '▼', left: '◀', right: '▶' }[cls]);
    b.addEventListener('pointerdown', (e) => (e.preventDefault(), startHold(d)));
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, stopHold);
    return b;
  };

  const menu = async () => {
    const a = await app.choose<string>('メニュー', [
      { label: 'どうぐ', value: 'item' },
      { label: '作戦', value: 'strategy', sub: undefined },
      { label: '帰還石を使う', value: 'stone', sub: `所持 ${g.count('IT06')}`, disabled: g.count('IT06') <= 0 },
      { label: '街へ戻る(探索を終了)', value: 'leave' },
    ], 'とじる');
    if (a === 'item') await useItems();
    else if (a === 'strategy') {
      const s = await app.choose('作戦', (Object.keys(STRATEGY_LABEL) as (keyof typeof STRATEGY_LABEL)[]).map((k) => ({ label: STRATEGY_LABEL[k], value: k, sub: g.strategy === k ? '現在' : undefined })));
      if (s) {
        g.strategy = s;
        app.settings.strategy = s;
        app.saveSettings();
      }
    } else if (a === 'stone') {
      if (await app.confirm('帰還石を使って街へ戻りますか?', '使う')) {
        g.useReturnStone();
        await goHome();
      }
    } else if (a === 'leave') {
      if (await app.confirm('探索を終了して街へ戻ります。よろしいですか?', '戻る')) {
        g.leaveDungeon();
        await goHome();
      }
    }
  };

  const useItems = async () => {
    for (;;) {
      const ids = ['IT01', 'IT02', 'IT03', 'IT10', 'IT11', 'IT12', 'IT13', 'IT14', 'IT15'].filter((id) => g.count(id) > 0);
      if (ids.length === 0) return app.toast('ここで使えるどうぐがありません。');
      const id = await app.choose('どうぐ', ids.map((i) => ({ label: getItem(i).name, value: i, sub: `×${g.count(i)}` })));
      if (!id) return;
      const uuid = await app.choose('だれに使う?', g.party.map((m) => ({ label: `${monsterName(m)} Lv${m.level}`, value: m.uuid, sub: `HP ${m.currentHp}/${m.stats.hp} MP ${m.currentMp}/${m.stats.mp}` })));
      if (!uuid) continue;
      const err = g.useItemOn(id, uuid);
      if (err) app.toast(err);
      else {
        sfx.heal();
        draw();
        await app.autosave();
      }
    }
  };

  app.mount(
    h(
      'main',
      { class: 'screen explore' },
      title,
      h('div', { class: 'map-wrap' }, canvas, mini),
      party,
      h(
        'div',
        { class: 'controls' },
        h('div', { class: 'dpad' }, pad('上', [0, -1], 'up'), pad('左', [-1, 0], 'left'), pad('右', [1, 0], 'right'), pad('下', [0, 1], 'down')),
        h('div', { class: 'stack' }, h('button', { class: 'btn primary', onclick: () => void menu() }, 'メニュー')),
      ),
      h('p', { class: 'fine' }, '矢印キー/WASD またはボタンで移動。⬇で下の階へ。'),
    ),
  );
  loadSprite();
  draw();
}
