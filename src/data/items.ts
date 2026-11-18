import type { ItemDef } from '../domain/types';

export const ITEMS: ItemDef[] = [
  { id: 'IT01', name: '小回復の実', price: 25, effect: 'hp+30', maxStack: 99 },
  { id: 'IT02', name: '大回復の実', price: 90, effect: 'hp+100', maxStack: 99 },
  { id: 'IT03', name: '魔力のしずく', price: 70, effect: 'mp+25', maxStack: 99 },
  { id: 'IT04', name: '万能葉', price: 120, effect: 'cure:poison,paralysis,sleep', maxStack: 99 },
  { id: 'IT05', name: '目覚めの花', price: 35, effect: 'cure:sleep', maxStack: 99 },
  { id: 'IT06', name: '帰還石', price: 80, effect: 'return-to-town', maxStack: 30 },
  { id: 'IT07', name: '野の肉', price: 60, effect: 'recruit+0.10', maxStack: 30, recruitBonus: 0.1 },
  { id: 'IT08', name: '良質の肉', price: 240, effect: 'recruit+0.25', maxStack: 30, recruitBonus: 0.25 },
  { id: 'IT09', name: '極上の肉', price: 800, effect: 'recruit+0.50', maxStack: 10, recruitBonus: 0.5 },
  { id: 'IT10', name: '攻めの種', price: 300, effect: 'atk+1', maxStack: 30, permStat: { stat: 'atk', amount: 1 } },
  { id: 'IT11', name: '守りの種', price: 300, effect: 'def+1', maxStack: 30, permStat: { stat: 'def', amount: 1 } },
  { id: 'IT12', name: '速さの種', price: 300, effect: 'agi+1', maxStack: 30, permStat: { stat: 'agi', amount: 1 } },
  { id: 'IT13', name: '知恵の種', price: 300, effect: 'int+1', maxStack: 30, permStat: { stat: 'int', amount: 1 } },
  { id: 'IT14', name: '命の種', price: 300, effect: 'hp+3', maxStack: 30, permStat: { stat: 'hp', amount: 3 } },
  { id: 'IT15', name: '魔力の種', price: 300, effect: 'mp+2', maxStack: 30, permStat: { stat: 'mp', amount: 2 } },
  { id: 'IT16', name: '星印の欠片', price: null, effect: 'key', maxStack: 8 },
];
