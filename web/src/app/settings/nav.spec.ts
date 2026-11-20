import { describe, expect, test } from 'vitest';
import { LEGACY, NAV, PAGES, remap, resolvePage } from './nav';

describe('resolvePage', () => {
  test('páginas reais passam direto', () => {
    for (const p of PAGES) expect(resolvePage(p)).toBe(p);
  });

  test.each([
    ['metricas', 'metrics'],
    ['geral', 'widget'],
    ['jogos', 'games'],
    ['log', 'sessions'],
    ['celular', 'devices'],
    ['appearance', 'widget'],
    ['phone', 'devices'],
    ['crash', 'health'],
  ])('apelido %s → %s', (id, want) => {
    expect(resolvePage(id)).toBe(want);
  });

  test('desconhecido = null', () => {
    expect(resolvePage('nada')).toBeNull();
    expect(resolvePage('')).toBeNull();
  });
});

test('crash (link antigo do relatório de queda) abre health/latest', () => {
  expect(LEGACY['crash']).toEqual(['health', 'latest']);
  expect(LEGACY['log']).toEqual(['sessions', 'csv']);
});

test('remap: sessions/crash virou health/latest; o resto não muda', () => {
  expect(remap('sessions', 'crash')).toEqual({ page: 'health', anchor: 'latest' });
  expect(remap('sessions', 'csv')).toEqual({ page: 'sessions', anchor: 'csv' });
  expect(remap('health', 'crash')).toEqual({ page: 'health', anchor: 'crash' });
  expect(remap('overview', null)).toEqual({ page: 'overview', anchor: null });
});

test('navegação: visão geral primeiro, sem página repetida, apelidos apontam para páginas reais', () => {
  expect(NAV[0].pages).toEqual(['overview']);
  expect(new Set(PAGES).size).toBe(PAGES.length);
  for (const [page] of Object.values(LEGACY)) expect(PAGES).toContain(page);
});
