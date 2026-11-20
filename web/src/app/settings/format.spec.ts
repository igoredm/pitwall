import { describe, expect, test } from 'vitest';
import { DICTS } from '../i18n';
import { capitalize, fmtBytes, fmtDuration, fmtMb, fmtMs, markdownToBlocks } from './format';

const pt = DICTS['pt-BR'];
const en = DICTS.en;

describe('fmtDuration', () => {
  test.each([
    [0, false, '0 s'],
    [48, false, '48 s'],
    [-5, false, '0 s'],
    [60, false, '1 min'],
    [372, false, '6 min'],
    [372, true, '6 min 12 s'],
    [360, true, '6 min'],
    [2700, false, '45 min'],
    [3900, false, '1 h 05'],
    [5498, false, '1 h 31'],
  ])('%i s (segundos: %s) → %s', (sec, withSeconds, want) => {
    expect(fmtDuration(sec, withSeconds)).toBe(want);
  });
});

describe('fmtBytes', () => {
  test('vírgula decimal em PT, ponto em EN', () => {
    expect(fmtBytes(1.4 * 1024 ** 3, pt)).toBe('1,4 GB');
    expect(fmtBytes(1.4 * 1024 ** 3, en)).toBe('1.4 GB');
  });
  test('sem casa quando é inteiro, ≥ 100 ou KB', () => {
    expect(fmtBytes(2 * 1024 ** 2, en)).toBe('2 MB');
    expect(fmtBytes(212.4 * 1024 ** 2, en)).toBe('212 MB');
    expect(fmtBytes(830.6 * 1024, en)).toBe('831 KB');
    expect(fmtBytes(512, en)).toBe('512 B');
  });
});

test('fmtMs e fmtMb', () => {
  expect(fmtMs(500)).toBe('500 ms');
  expect(fmtMs(1000)).toBe('1 s');
  expect(fmtMs(500, pt, true)).toBe('0,5 s');
  expect(fmtMs(1500, en)).toBe('1.5 s');
  expect(fmtMb(500)).toBe('500 MB');
  expect(fmtMb(2048)).toBe('2 GB');
});

test('capitalize', () => {
  expect(capitalize('domingo, 19:40')).toBe('Domingo, 19:40');
  expect(capitalize('')).toBe('');
});

describe('markdownToBlocks', () => {
  test('títulos, listas e parágrafos', () => {
    const blocks = markdownToBlocks('## 1.2.0\n\n- Relatório do PC\n* Monitor\n1. Atalhos\n\nlinha um\nlinha dois');
    expect(blocks.map((b) => b.kind)).toEqual(['h', 'li', 'li', 'li', 'p']);
    expect(blocks[0].spans).toEqual([{ t: '1.2.0' }]);
    expect(blocks[4].spans).toEqual([{ t: 'linha um linha dois' }]);
  });

  test('negrito, itálico e código', () => {
    const [b] = markdownToBlocks('texto **forte** e *leve* com `code`');
    expect(b.spans).toEqual([
      { t: 'texto ' },
      { t: 'forte', b: true },
      { t: ' e ' },
      { t: 'leve', i: true },
      { t: ' com ' },
      { t: 'code', code: true },
    ]);
  });

  test('nada vira HTML: tags e scripts somem, links e imagens ficam só com o texto', () => {
    const blocks = markdownToBlocks('<script>alert(1)</script><b>oi</b> [site](https://x.y) ![logo](a.png)');
    expect(blocks).toEqual([{ kind: 'p', spans: [{ t: 'oi site logo' }] }]);
  });

  test('limites: 4000 caracteres e 60 blocos', () => {
    const md = Array.from({ length: 200 }, (_, i) => `- item ${i}`).join('\n');
    expect(markdownToBlocks(md).length).toBeLessThanOrEqual(60);
  });
});
