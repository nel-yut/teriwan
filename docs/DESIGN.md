# テリワンぽいゲーム 設計書(ドラフト v0.1)

## 1. コンセプト

「モンスターを仲間にして、配合で育て、大会で勝つ」というテリワンの核になる循環を、ブラウザで 1 回 10〜20 分遊べる形に絞って作る。

```
旅の扉(ダンジョン) ──スカウト──▶ 仲間を増やす
        ▲                              │
        │                              ▼
   大会(アリーナ) ◀──強化── 配合(2体→1体、特技を引き継ぐ)
```

### スコープ方針
- **やる**: 仲間集め / 3 vs 3 のコマンドバトル / 配合 / 大会ランク / セーブ
- **やらない(初期)**: 通信対戦、広大なフィールド、ストーリー、多数のイベント
- **権利面**: ドラクエ由来の固有名・グラフィック・音源は使わない。モンスター名、見た目、世界観はすべてオリジナル。システムの仕組み(スカウト、配合、ランク制)だけを参考にする。

## 2. 技術選定

| 項目 | 採用 | 理由 |
|---|---|---|
| 言語 | TypeScript | データ構造が多く、型で配合や戦闘のバグを減らせる |
| ビルド | Vite | 設定が少なく、静的ファイルで出力できる |
| UI | 素の DOM + CSS(フレームワークなし) | メニュー中心のゲームで、Canvas より楽 |
| 描画 | 戦闘画面のみ CSS / SVG でモンスター表示 | 後でドット絵に差し替え可能にする |
| テスト | Vitest | 戦闘・配合はテスト向きな純粋ロジックにする |
| セーブ | localStorage(JSON、バージョン番号つき) | サーバー不要 |
| 配信 | GitHub Pages 等の静的ホスティング | |

**重要な設計原則**: ゲームロジック(`core/`)は DOM に依存しない純粋な関数・クラスにする。UI は状態を描画してイベントを送るだけにする。乱数は注入可能(シード付き)にして、テストと再現を可能にする。

## 3. 画面とゲームの流れ

```
Title ─▶ Home(拠点)
          ├─ 旅の扉 ─▶ Dungeon ─▶ Battle ─▶ Scout ─▶ (繰り返し / 帰還)
          ├─ 配合所 ─▶ Breeding
          ├─ 牧場(モンスター一覧・パーティ編成・預かり)
          ├─ アリーナ ─▶ Tournament ─▶ Battle ×3〜4
          └─ セーブ
```

- シーン管理は単純なステートマシン(`SceneManager`)。各シーンが `enter / handleInput / render / exit` を持つ。
- Home は静的なメニュー画面。移動なしの拠点にすると作りやすい。

## 4. データモデル

### 4.1 マスターデータ(静的、`data/`)
```ts
type Family = 'slime' | 'beast' | 'bird' | 'plant' | 'undead' | 'dragon' | 'demon' | 'material';

interface SpeciesDef {
  id: string;
  name: string;
  family: Family;
  rank: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;       // 配合結果の格に使う
  baseStats: Stats;                           // Lv1 基準
  growth: Stats;                              // 1Lv あたり成長率(係数)
  learnset: { level: number; skill: SkillId }[];
  resist: Partial<Record<Element, number>>;   // 属性倍率
  scoutRate: number;                          // 0..1 仲間になりやすさ
  look: { color: string; shape: string };     // 仮の見た目
}

interface Stats { hp: number; mp: number; atk: number; def: number; agi: number; int: number; }

interface SkillDef {
  id: SkillId; name: string;
  kind: 'attack' | 'heal' | 'buff' | 'debuff' | 'status';
  element: 'none' | 'fire' | 'ice' | 'wind' | 'light' | 'dark';
  power: number; mpCost: number;
  target: 'one-enemy' | 'all-enemy' | 'one-ally' | 'all-ally' | 'self';
}
```

### 4.2 個体データ(動的、セーブ対象)
```ts
interface Monster {
  uid: string;
  speciesId: string;
  nickname?: string;
  level: number; exp: number;
  statBonus: Stats;          // 配合で積み上がる加算値(+値)
  skills: SkillId[];         // 習得済み(最大 8)
  generation: number;        // 配合回数
  parents?: [string, string];
}

interface SaveData {
  version: number;
  gold: number;
  party: string[];           // uid, 最大 3
  ranch: Monster[];          // 所持上限 30
  arenaRank: 'F'|'E'|'D'|'C'|'B'|'A'|'S';
  discoveredSpecies: string[];  // 図鑑
  rngSeed?: number;
}
```

## 5. バトル設計

### 5.1 ルール
- 3 vs 3 のターン制。戦闘は敵 1〜3 体。
- 毎ターン、味方 3 体それぞれにコマンドを選ぶ(攻撃 / 特技 / 防御 / 逃げる)。
- 行動順は `agi` に乱数 ±20% を掛けた値の降順。
- 戦闘不能が全員になった側の負け。

### 5.2 ダメージ計算(初期案)
```
物理 = max(1, (atk * 0.5 - def * 0.25) * 乱数(0.9〜1.1)) * 会心(1/16 で ×1.8)
特技 = skill.power * (1 + int / 100) * 属性倍率 * 乱数(0.9〜1.1)
回復 = skill.power * (1 + int / 100)
```
- 数値は `data/balance.ts` に集約して調整しやすくする。
- 状態異常は初期は 3 種(眠り、毒、ぼうぎょ低下)のみ。

### 5.3 敵 AI
- 初期は「ランダムに特技 or 攻撃」+ 「HP が低い味方がいれば回復優先」程度。
- 味方側の `auto`(全員おまかせ)オプションも同じ AI を流用する。

### 5.4 経験値とレベル
- 勝利時に出場メンバーへ分配。最大 Lv 50。
- ステータス = `(base + growth * (Lv - 1)) + statBonus`。

## 6. スカウト(仲間集め)

- 勝利時に、倒した敵ごとにスカウト判定を行う。
- 確率: `clamp(species.scoutRate * (1 + パーティ内の同系統数 * 0.1) * 運補正, 0.02, 0.9)`
- スカウト成功で牧場に追加(Lv は敵と同じ)。牧場が満杯の場合は誰かを解放して入れ替える。

## 7. 配合

### 7.1 入力と結果
- 親 A、親 B(別個体、同種は不可の案もあり)→ 子 1 体。親 2 体は消費。
- 結果の種族は **配合テーブル** で決める:
  1. 特定の組み合わせルール(`A × B → C`)があればそれを使う
  2. なければ「系統 × 系統 → 系統」ルールで、親ランク平均 + 補正 に近い種族を選ぶ

```ts
interface BreedRule {
  a: string | `family:${Family}`;
  b: string | `family:${Family}`;
  result: string;
  priority: number;       // 特定の組み合わせほど高い
}
```

### 7.2 引き継ぎ
- 子の Lv は 1 に戻す。
- `statBonus` は両親の `(statBonus + 現在 Lv に応じた値の一部)` の 1/4 程度を引き継ぐ。
- 特技は両親の習得特技から最大 2 つを選択して引き継ぐ(プレイヤーが選べる)。
- 子の `generation = max(親) + 1`。`generation` が上がるほど `statBonus` の上限を上げる。

### 7.3 UI
- 親 2 体選択 → 結果プレビュー(種族名 + ステータス予測) → 引き継ぐ特技を選択 → 確認 → 演出。
- 結果は秘密にせず、プレビューで見えるようにする(試行錯誤のコストを下げる)。

## 8. ダンジョン(旅の扉)

- ステージは **フロア制の疑似ダンジョン**:各フロアはランダム選択の 4〜6 マスのパネルを選んで進む(戦闘 / 宝箱 / 回復の泉 / 階段 / ボス)。
- 実際の 2D 移動は初期は作らない(後フェーズで検討)。
- 旅の扉ごとに出現モンスターの種類・レベル帯・フロア数を定義:
```ts
interface GateDef {
  id: string; name: string;
  floors: number;
  enemyPool: { speciesId: string; weight: number; levelRange: [number, number] }[];
  boss: string;
  rewards: { gold: number; items?: ItemId[] };
}
```

## 9. 大会(アリーナ)

- ランク F〜S。ランクごとにエントリー条件(パーティ全員の最大 Lv や種族ランクの制限など)。
- 3〜4 試合のトーナメント。全勝で優勝 → ランクアップと賞金。
- 敵パーティは `ArenaDef` で固定リスト(種族 + Lv + 特技)を定義して、再現性を持たせる。

## 10. ディレクトリ構成(案)

```
teriwan/
├─ index.html
├─ package.json / vite.config.ts / tsconfig.json
├─ docs/DESIGN.md
├─ src/
│  ├─ main.ts
│  ├─ core/            # DOM 非依存の純粋ロジック
│  │  ├─ battle.ts     # 戦闘進行・ダメージ計算
│  │  ├─ ai.ts
│  │  ├─ breeding.ts
│  │  ├─ scout.ts
│  │  ├─ dungeon.ts
│  │  ├─ arena.ts
│  │  ├─ rng.ts        # シード付き乱数
│  │  └─ save.ts
│  ├─ data/            # species.ts / skills.ts / breedRules.ts / gates.ts / balance.ts
│  ├─ scenes/          # title, home, ranch, breeding, dungeon, battle, arena
│  ├─ ui/              # 共通部品(ウィンドウ、メッセージ送り、メニュー)
│  └─ styles/
└─ tests/              # battle / breeding / scout / save の単体テスト
```

## 11. 開発フェーズ

| フェーズ | 内容 | 完了条件 |
|---|---|---|
| M0 | Vite + TS セットアップ、シーン管理、RNG、セーブ | 空のタイトル→ホームが動く |
| M1 | 戦闘(3v3、攻撃・特技・防御)、敵 AI、モンスター 8〜10 種 | 1 戦闘が最後まで遊べる |
| M2 | 旅の扉 1〜2 か所、スカウト、牧場、パーティ編成 | 仲間を増やせる |
| M3 | 配合(テーブル、特技引き継ぎ、プレビュー) | 配合で強い個体を作れる |
| M4 | アリーナ(F〜C ランク)、図鑑 | 大会で勝ってランクが上がる |
| M5 | バランス調整、演出(SE/BGM は WebAudio で簡易生成)、モバイル対応 | 通しで 1〜2 時間遊べる |

最初の合意が取れたら **M0 + M1 だけ** を先に実装して、触り心地を確認するのを推奨します。

## 12. 見た目・演出の方針
- 初期: 系統ごとの色 + 簡単な SVG 図形(スライム型、獣型、鳥型 など)で仮表示。
- 後で: ドット絵スプライトシート(32×32 〜 64×64)に差し替えられるよう、`look` を抽象化しておく。
- SE/BGM: 初期は無し。M5 で WebAudio による簡易生成を検討。
- レスポンシブ:縦持ちスマホで遊べる UI(タップ操作中心、キーボード対応も)。

## 13. 主なリスク
- **バランス調整**: 配合ループは数値の崩れが起きやすい。`balance.ts` に集約し、配合を 100 世代回すシミュレーションテストでインフレを検知する。
- **コンテンツ量**: モンスター数が増えると配合表の管理が大変になる。系統ルールを使い、特定の組み合わせは必要最低限にする。
- **スコープ膨張**: 2D ダンジョン移動、ストーリー、アイテムは M5 以降に回す。

## 14. 決めたいこと(要確認)
1. **技術**: TypeScript + Vite で進めてよいか(依存なしの素の JS でも可)。
2. **見た目**: 仮の図形で進めてよいか。ドット絵素材を用意する予定はあるか。
3. **ダンジョン**: パネル選択式(軽量)か、2D マップ移動(重い)か。
4. **スカウト**: 戦闘後に自動判定(提案)か、戦闘中に「スカウト」コマンドで行うか。
5. **世界観・名前**: オリジナルのモンスター名やテーマ(和風、ファンタジーなど)に好みはあるか。
