import { describe, expect, it } from 'vitest';
import { PcEvent, PcInstall } from '../../../models';
import { crashTimes, crashesAround, isMainInstall } from './installs-util';

const ev = (time: string, kind: PcEvent['kind'], fatal?: boolean): PcEvent => ({ time, kind, source: '', eventId: 0, fatal });

describe('crashTimes', () => {
  it('junta os eventos da mesma queda e ignora suspensão e WHEA leve', () => {
    const t = crashTimes([
      ev('2026-11-25T15:33:00', 'kernelPower41'),
      ev('2026-11-25T15:33:30', 'unexpectedShutdown'),
      ev('2026-11-25T15:44:00', 'kernelPower41'),
      ev('2026-11-25T16:00:00', 'whea', false),
      ev('2026-11-25T17:00:00', 'whea', true),
      ev('2026-11-25T18:00:00', 'sleep'),
    ]);
    expect(t.length).toBe(3);
  });

  it('BugCheck gravado minutos depois do boot é a mesma queda', () => {
    expect(crashTimes([ev('2026-10-16T18:11:00', 'kernelPower41'), ev('2026-10-16T18:19:00', 'bugcheck')]).length).toBe(1);
  });
});

describe('crashesAround', () => {
  const crashes = crashTimes([
    ev('2026-11-14T18:30:00', 'kernelPower41'),
    ev('2026-11-25T15:33:00', 'kernelPower41'),
    ev('2026-11-25T15:37:00', 'kernelPower41'),
    ev('2026-11-25T15:44:00', 'kernelPower41'),
  ]);

  it('conta 7 dias antes e depois', () => {
    const item: PcInstall = { time: '2026-11-20T17:11:00', kind: 'driver', name: 'applebtbc.inf' };
    expect(crashesAround(item, crashes)).toEqual({ before: 1, after: 3 });
  });

  it('fora da janela não conta', () => {
    const item: PcInstall = { time: '2026-10-01T00:00:00', kind: 'program', name: 'X', dateOnly: true };
    expect(crashesAround(item, crashes)).toEqual({ before: 0, after: 0 });
  });
});

describe('isMainInstall', () => {
  it('esconde Store e drivers da Microsoft', () => {
    expect(isMainInstall({ time: '', kind: 'store', name: 'Microsoft.Paint' })).toBe(false);
    expect(isMainInstall({ time: '', kind: 'driver', name: 'bth.inf', publisher: 'Microsoft' })).toBe(false);
    expect(isMainInstall({ time: '', kind: 'driver', name: 'applebtbc.inf', publisher: 'Apple Inc.' })).toBe(true);
    expect(isMainInstall({ time: '', kind: 'driver', name: 'BCM43XX' })).toBe(true);
    expect(isMainInstall({ time: '', kind: 'program', name: 'TeamSpeak', publisher: 'Microsoft Corporation' })).toBe(true);
  });
});
