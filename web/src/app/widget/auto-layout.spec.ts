// Teste da regra do layout automático. Sem dependências: node --test src/app/widget/auto-layout.spec.ts (Node ≥ 23)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { autoLayout } from './auto-layout.ts';

const cases: [number, number, string][] = [
  // faixa (strip)
  [2560, 720, 'strip'],
  [1920, 480, 'strip'],
  [1920, 515, 'strip'],
  [1600, 500, 'strip'],
  [1280, 320, 'strip'],
  [1440, 400, 'strip'],
  // telinha (mini)
  [800, 480, 'mini'],
  [1024, 600, 'mini'],
  [480, 320, 'mini'],
  [640, 480, 'mini'],
  // o que já existia não muda
  [1280, 400, 'full'],
  [1366, 768, 'full'],
  [1920, 1080, 'full'],
  [400, 1100, 'full'],
  [1000, 300, 'full'],
  [1100, 300, 'strip'],
  [300, 300, 'mid'],
  [320, 620, 'mid'],
  [480, 220, 'mid'],
  [260, 180, 'compact'],
  [330, 250, 'compact'],
  // bordas
  [1024, 601, 'full'],
  [1025, 600, 'full'],
  [0, 0, 'full'],
];

for (const [w, h, want] of cases) {
  test(`${w}×${h} → ${want}`, () => assert.equal(autoLayout(w, h), want));
}
