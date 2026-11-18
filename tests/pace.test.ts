import { describe, expect, it } from 'vitest';
import { Game } from '../src/application/game';
import { GATES } from '../src/data/world';
import { getGate } from '../src/domain/encounter';
import { Rng } from '../src/domain/rng';
import { computeRewards } from '../src/domain/encounter';
import { expToNext, getSpecies } from '../src/domain/monster';
import { Battle, combatantFromMonster } from '../src/domain/battle';
import { createMonster } from '../src/domain/monster';
import { generateWildEncounter } from '../src/domain/encounter';

/** 同格の敵を倒したときに 1 レベル上がるまでの戦闘回数の目安 */
describe('leveling pace', () => {
  it('needs only a handful of battles per level at typical gate levels', () => {
    const rng = new Rng(11);
    for (const gate of GATES) {
      const g = getGate(gate.id);
      const lv = Math.round((g.recommendedLevel[0] + g.recommendedLevel[1]) / 2);
      let totalExp = 0;
      const N = 200;
      for (let i = 0; i < N; i++) {
        const allies = [0, 1, 2].map((k) => combatantFromMonster(createMonster(rng, { uuid: 'a' + k, speciesId: 'M011', level: lv, gender: 'M' }), 'a' + k));
        const b = new Battle({ allies, enemies: generateWildEncounter(rng, g, Math.max(1, Math.ceil(g.floors / 2))), rng, inventory: {}, canFlee: true, allowItems: false });
        totalExp += computeRewards(b).expPerAlly;
      }
      const perBattle = totalExp / N;
      const battlesPerLevel = expToNext(lv, getSpecies('M011').rank) / perBattle;
      console.log(gate.id, 'Lv', lv, 'exp/battle', perBattle.toFixed(1), 'battles/level', battlesPerLevel.toFixed(1));
      expect(battlesPerLevel).toBeLessThan(14);
      expect(battlesPerLevel).toBeGreaterThan(1.5);
    }
    void Game;
  });
});
