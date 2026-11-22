// 1.3: eventos novos do Relatório do PC (nome, o que quer dizer, categoria) e a sequência do incidente
import { describe, expect, test } from 'vitest';
import { DICTS } from '../i18n';
import type { PcEvent, PcIncidentSummary } from '../models';
import { eventPills, incidentSequence } from './pages/health/pc-view';
import { evCategory, evMeaning, evName } from './reports';

const pt = DICTS['pt-BR'];
const en = DICTS.en;
const ev = (kind: PcEvent['kind'], time: string, extra: Partial<PcEvent> = {}): PcEvent => ({ kind, time, source: 'x', eventId: 0, ...extra });

describe('eventos 1.3', () => {
  test('categoria: estado x problema (sem category = pela regra)', () => {
    expect(evCategory(ev('sleep', '2026-11-19T03:12:00'))).toBe('state');
    expect(evCategory(ev('boot', '2026-11-19T03:12:00'))).toBe('state');
    expect(evCategory(ev('appCrash', '2026-11-19T03:12:00'))).toBe('problem');
    expect(evCategory(ev('kernelPower41', '2026-11-19T03:12:00'))).toBe('problem');
    expect(evCategory(ev('whea', '2026-11-19T03:12:00', { category: 'state' }))).toBe('state');
  });

  test('nomes e frases de fato', () => {
    expect(evName(ev('appCrash', ''), pt)).toBe('Jogo fechou com erro');
    expect(evName(ev('kernelPower41', ''), pt)).toBe('Kernel-Power 41');
    expect(evMeaning(ev('appCrash', '', { exe: 'FC25.exe', code: 'nvwgf2umx.dll' }), pt)).toBe('FC25.exe fechou com erro no módulo nvwgf2umx.dll. O Windows registrou como Application Error.');
    expect(evMeaning(ev('appHang', '', { exe: 'Valorant.exe' }), en)).toBe('Valorant.exe stopped responding and was closed.');
    expect(evMeaning(ev('shutdown', '', { eventId: 1074, message: 'explorer.exe · desligar' }), pt)).toBe('Um programa ou a pessoa pediu para desligar ou reiniciar: explorer.exe · desligar.');
    expect(evMeaning(ev('shutdown', '', { eventId: 13 }), pt)).toBe('O Windows terminou de desligar.');
    expect(evMeaning(ev('sleep', ''), en)).toBe('The PC went to sleep or hibernation.');
  });
});

describe('incidente: sequência e pílulas', () => {
  const inc: PcIncidentSummary = {
    id: 'i',
    kind: 'abruptShutdown',
    time: '2026-11-19T03:12:04',
    bootTime: '2026-11-19T03:40:04',
    seen: true,
    events: [
      ev('kernelPower41', '2026-11-19T03:40:08'),
      ev('sleep', '2026-11-19T03:12:07'),
      ev('boot', '2026-11-19T03:40:04'),
    ],
  };

  test('em ordem, sem "PC voltou" quando o log tem o boot', () => {
    expect(incidentSequence(inc, pt).map((x) => `${x.label} ${x.time}`)).toEqual([
      'última gravação 03:12:04',
      'Suspensão 03:12:07',
      'Windows iniciou 03:40:04',
      'Kernel-Power 41 03:40:08',
    ]);
    const noBoot = { ...inc, events: inc.events.filter((e) => e.kind !== 'boot') };
    expect(incidentSequence(noBoot, pt).map((x) => x.label)).toEqual(['última gravação', 'Suspensão', 'PC voltou', 'Kernel-Power 41']);
  });

  test('pílula de suspensão perto da queda', () => {
    expect(eventPills(inc, pt).map((p) => p.text)).toEqual(['Kernel-Power 41', 'Suspensão']);
  });
});
