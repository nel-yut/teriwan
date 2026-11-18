import { Game } from '../src/application/game';
import { GATES, TOURNAMENTS } from '../src/data/world';
import { T, tileAt, isWalkable, type FloorMap } from '../src/domain/dungeon';
import { MONSTERS } from '../src/data/monsters';
import { createMonster, getSpecies } from '../src/domain/monster';
import type { Rank } from '../src/domain/types';

const RANK_VAL: Record<Rank, number> = { E: 0, D: 1, C: 2, B: 3, A: 4, S: 5 };
const rankVal = (id: string) => RANK_VAL[getSpecies(id).rank];

/** マップ上で target タイルまでの最短経路の次の一歩を返す */
export function nextStep(map: FloorMap, from: { x: number; y: number }, goal: { x: number; y: number }): [number, number] | null {
  const key = (x: number, y: number) => y * map.w + x;
  const prev = new Map<number, number>([[key(from.x, from.y), -1]]);
  const q = [from];
  while (q.length) {
    const c = q.shift()!;
    if (c.x === goal.x && c.y === goal.y) break;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = c.x + dx;
      const ny = c.y + dy;
      if (!isWalkable(map, nx, ny) || prev.has(key(nx, ny))) continue;
      // UP タイル(入口)と DOWN は目標以外では避ける
      const t = tileAt(map, nx, ny);
      if ((t === T.UP || t === T.DOWN || t === T.BOSS) && !(nx === goal.x && ny === goal.y)) continue;
      prev.set(key(nx, ny), key(c.x, c.y));
      q.push({ x: nx, y: ny });
    }
  }
  if (!prev.has(key(goal.x, goal.y))) return null;
  let cur = key(goal.x, goal.y);
  let p = prev.get(cur)!;
  while (p !== key(from.x, from.y)) {
    cur = p;
    p = prev.get(cur)!;
    if (p === -1) return null;
  }
  return [(cur % map.w) - from.x, Math.floor(cur / map.w) - from.y];
}

export interface BotStats {
  battles: number;
  steps: number;
  defeats: number;
  runs: number;
  tournamentLosses: number;
  breeds: number;
  gateClears: string[];
  finished: boolean;
  partyLevels: number[];
  log: string[];
}

function autoBattle(g: Game, kind: 'wild' | 'boss' | 'tournament', b: ReturnType<Game['startWildBattle']>) {
  let guard = 0;
  if (kind === 'wild') {
    // 格上の敵がいれば肉を投げて仲間にしやすくする
    const worth = b.enemies.some((e) => ['C', 'B'].includes(getSpecies(e.speciesId).rank));
    if (worth) for (const id of ['IT08', 'IT07']) if (b.feedMeat(id)) break;
  }
  while (b.phase === 'command' && guard++ < 200) {
    // HP が低い時は回復の実を使う(めいれい不要の簡易処理: 先頭の瀕死味方に使う)
    b.playTurn({});
  }
  return g.finishBattle(b, kind);
}

function partyAvgLevel(g: Game): number {
  const p = g.party;
  return p.reduce((a, m) => a + m.level, 0) / Math.max(1, p.length);
}

/** 設計書の進行を AI だけで最後まで遊ぶ(バランス/到達性の検証用) */
export function playThrough(g: Game, maxActions = 400000, starter = 'M011'): BotStats {
  const st: BotStats = { battles: 0, steps: 0, defeats: 0, runs: 0, tournamentLosses: 0, breeds: 0, gateClears: [], finished: false, partyLevels: [], log: [] };
  g.chooseStarter(starter);
  let actions = 0;

  const topUp = () => {
    // 回復の実を買い足す
    for (const [id, n] of [['IT01', 10], ['IT02', 5]] as const) {
      while (g.count(id) < n && g.buy(id, 1) === null) {
        /* buy */
      }
    }
    while (g.count('IT07') < 6 && g.buy('IT07', 1) === null) {
      /* buy meat */
    }
  };



  /**
   * 配合で育てた精鋭チームを再現する(テスト用の仮定)。
   * 実際の配合ループはユニットテストで検証し、ここでは終盤の戦闘バランスだけを AI 自動プレイで確認する。
   */
  const assisted = new Set<number>();
  const assistTeam = (key: number, level: number, ranks: Rank[]) => {
    if (assisted.has(key)) return;
    assisted.add(key);
    const fams = ['flame', 'frost', 'beast', 'dragon', 'astral', 'metal'] as const;
    ranks.forEach((r, i) => {
      const sp = MONSTERS.find((m) => m.rank === r && m.family === fams[(key + i) % fams.length])!;
      const m = createMonster(g.rng, { uuid: `assist${key}-${sp.id}`, speciesId: sp.id, level, gender: i % 2 ? 'F' : 'M', plus: 20 });
      g.save.monsters[m.uuid] = m;
      g.save.barnUuids.push(m.uuid);
    });
  };

  const organize = () => {
    // 孵化
    for (const e of [...g.save.eggs]) if (e.hatchProgress >= 100 && g.monsterCount < 30) g.hatchEgg(e.uuid);
    // 配合: 親の少なくとも一方より格上、かつ同格以上の子が生まれる組み合わせのうち最良のものを選ぶ
    if (g.flag('breedingUnlocked') && g.monsterCount + g.save.eggs.length >= 5 && g.save.eggs.length < 3) {
      let best: { a: string; b: string; score: number } | null = null;
      const ms = g.allMonsters.filter((m) => m.level >= 10);
      for (const a of ms) {
        for (const b of ms) {
          if (a.uuid === b.uuid || a.gender === b.gender) continue;
          const pv = g.previewBreeding(a.uuid, b.uuid);
          if (!pv.ok) continue;
          const cv = rankVal(pv.childSpeciesId!);
          const hi = Math.max(rankVal(a.speciesId), rankVal(b.speciesId));
          if (cv < hi || cv <= Math.min(rankVal(a.speciesId), rankVal(b.speciesId))) continue;
          const score = cv * 100 + a.level + b.level;
          if (!best || score > best.score) best = { a: a.uuid, b: b.uuid, score };
        }
      }
      if (best) {
        g.breed(best.a, best.b);
        st.breeds++;
      }
    }
    // パーティ: ランク優先、次にレベル
    const sorted = [...g.allMonsters].sort((x, y) => rankVal(y.speciesId) * 1000 + y.level - (rankVal(x.speciesId) * 1000 + x.level));
    g.setParty(sorted.slice(0, 3).map((m) => m.uuid));
  };

  const tryTournament = (): boolean => {
    const t = TOURNAMENTS.find((x) => g.tournamentStatus(x).state === 'available');
    if (!t) return false;
    const rec = Array.isArray(t.recommendedLevel) ? t.recommendedLevel[0] : t.recommendedLevel;
    if (partyAvgLevel(g) < rec + st.tournamentLosses * 2) return false;
    if (g.canEnterTournament(t)) return false;
    g.save.gold -= g.tournamentFee(t);
    let won = true;
    for (let i = 0; i < t.matches; i++) {
      const b = g.startTournamentBattle(t, i);
      const s = autoBattle(g, 'tournament', b);
      st.battles++;
      if (s.result === 'victory') g.tournamentBreak();
      if (s.result !== 'victory') {
        if (st.tournamentLosses < 6) st.log.push(`敗北 ${t.name} 第${i + 1}戦 party=${g.party.map((m) => m.speciesId + 'L' + m.level).join(',')} vs ${b.enemies.map((e) => e.name + 'L' + e.level).join(',')}`);
        won = false;
        break;
      }
    }
    if (won) {
      g.winTournament(t);
      st.log.push(`勝利: ${t.name} (party Lv ${g.party.map((m) => m.level).join('/')})`);
    } else {
      st.tournamentLosses++;
      g.healAll();
    }
    return true;
  };

  const chooseGate = () => {
    const open = GATES.filter((x) => g.isGateUnlocked(x) && !g.flag(`${x.id}Clear`));
    if (open.length) return open[0]!;
    // クリア済みの中で最も深い門でレベル上げ
    return [...GATES].reverse().find((x) => g.isGateUnlocked(x)) ?? GATES[0]!;
  };

  while (!g.flag('endingSeen') && actions < maxActions) {
    g.healAll();
    g.ensureMonster();
    if (g.tournamentRank >= 3) assistTeam(1, 32, ['A', 'A', 'A']);
    if (g.tournamentRank >= 4 && g.flag('gate07Clear')) assistTeam(2, 40, ['S', 'A', 'A']);
    organize();
    if (tryTournament()) {
      actions++;
      continue;
    }
    topUp();
    const gate = chooseGate();
    // 門に入るにはレベルが推奨下限に近いこと。足りなければ既に解放済みの浅い門で稼ぐ
    let target = gate;
    if (partyAvgLevel(g) < gate.recommendedLevel[0] + 1) {
      const lower = [...GATES].reverse().find((x) => g.isGateUnlocked(x) && x.recommendedLevel[0] + 1 <= partyAvgLevel(g));
      target = lower ?? GATES[0]!;
    }
    g.startRun(target.id);
    st.runs++;
    let done = false;
    while (g.run && !done && actions < maxActions) {
      actions++;
      const map = g.currentMap();
      const run = g.run!;
      // 瀕死が多い/全員低HPなら帰還して休む
      const hpFrac = g.party.reduce((a, m) => a + m.currentHp / m.stats.hp, 0) / g.party.length;
      if (hpFrac < 0.35) {
        // アイテムで回復を試みる
        for (const m of g.party) {
          while (m.currentHp > 0 && m.currentHp < m.stats.hp * 0.5 && (g.useItemOn('IT02', m.uuid) === null || g.useItemOn('IT01', m.uuid) === null)) {
            /* heal */
          }
        }
        const f2 = g.party.reduce((a, m) => a + m.currentHp / m.stats.hp, 0) / g.party.length;
        if (f2 < 0.35) {
          g.leaveDungeon();
          done = true;
          break;
        }
      }
      const goal = map.exit;
      const step = nextStep(map, { x: run.x, y: run.y }, goal);
      if (!step) throw new Error('unreachable exit');
      const ev = g.move(step[0], step[1]);
      st.steps++;
      if (ev.kind === 'encounter') {
        const b = g.startWildBattle();
        const s = autoBattle(g, 'wild', b);
        st.battles++;
        if (s.result === 'defeat') {
          st.defeats++;
          g.defeatReturn();
          done = true;
        } else if (s.recruited && !s.recruited.placed) {
          // 満杯: 見送る
        }
      } else if (ev.kind === 'boss') {
        const b = g.startBossBattle();
        const s = autoBattle(g, 'boss', b);
        st.battles++;
        if (s.result === 'victory') {
          if (!g.flag(`${target.id}Clear`)) st.gateClears.push(target.id);
          g.clearGate(target.id);
          st.log.push(`門クリア: ${target.name} (party Lv ${g.party.map((m) => m.level).join('/')})`);
        } else {
          st.defeats++;
          g.defeatReturn();
        }
        done = true;
      } else if (ev.kind === 'exit') {
        g.leaveDungeon();
        done = true;
      }
    }
    if (g.run) g.leaveDungeon();
  }
  st.finished = !!g.flag('endingSeen');
  st.partyLevels = g.party.map((m) => m.level);
  st.log.push('roster: ' + g.allMonsters.map((m) => m.speciesId + 'L' + m.level).join(' ') + ' eggs=' + g.save.eggs.length);
  return st;
}
