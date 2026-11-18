import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { defineConfig, type Plugin } from 'vitest/config';

/** ビルド後に dist 内の全ファイルを Service Worker のプリキャッシュ一覧へ埋め込む */
function precachePlugin(): Plugin {
  let outDir = 'dist';
  return {
    name: 'precache-sw',
    apply: 'build',
    configResolved(c) {
      outDir = c.build.outDir;
    },
    closeBundle() {
      const files: string[] = [];
      const walk = (d: string) => {
        for (const f of readdirSync(d)) {
          const p = join(d, f);
          if (statSync(p).isDirectory()) walk(p);
          else if (f !== 'sw.js') files.push('./' + relative(outDir, p).split('\\').join('/'));
        }
      };
      walk(outDir);
      const swPath = join(outDir, 'sw.js');
      let sw = readFileSync(swPath, 'utf8');
      sw = sw.replace('/*__PRECACHE__*/ []', JSON.stringify(['./', ...files])).replace('__BUILD__', Date.now().toString(36));
      writeFileSync(swPath, sw);
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [precachePlugin()],
  test: { include: ['tests/**/*.test.ts'] },
});
