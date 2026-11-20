import { describe, expect, test } from 'vitest';
import { MODS, comboOf, heldMods, hotkeyParts, keyOf, sameHotkey } from './hotkey';

describe('keyOf', () => {
  test.each([
    ['KeyM', 'M'],
    ['Digit0', '0'],
    ['F1', 'F1'],
    ['F12', 'F12'],
    ['F24', 'F24'],
  ])('%s → %s', (code, want) => expect(keyOf(code)).toBe(want));

  test.each(['F25', 'F0', 'Space', 'Enter', 'Numpad1', 'ArrowUp', 'Keym', 'ShiftLeft'])('%s não vale', (code) => {
    expect(keyOf(code)).toBeNull();
  });
});

test('heldMods: ordem do backend (Ctrl+Alt+Shift+Win)', () => {
  expect(heldMods({ ctrlKey: true, altKey: true, shiftKey: true, metaKey: true })).toEqual(['Ctrl', 'Alt', 'Shift', 'Win']);
  expect(heldMods({ ctrlKey: false, altKey: true, shiftKey: false, metaKey: false })).toEqual(['Alt']);
  expect(heldMods({ ctrlKey: false, altKey: false, shiftKey: false, metaKey: false })).toEqual([]);
});

test('MODS cobre os nomes de event.key dos modificadores', () => {
  expect(MODS['Control']).toBe('Ctrl');
  expect(MODS['Meta']).toBe('Win');
  expect(MODS['OS']).toBe('Win');
  expect(MODS['a']).toBeUndefined();
});

describe('comboOf', () => {
  test('letra/número com modificador', () => {
    expect(comboOf(['Ctrl', 'Alt'], 'KeyM')).toBe('Ctrl+Alt+M');
    expect(comboOf(['Shift'], 'Digit5')).toBe('Shift+5');
  });
  test('letra ou número sozinho não vale; F1–F24 sozinha vale', () => {
    expect(comboOf([], 'KeyM')).toBeNull();
    expect(comboOf([], 'Digit1')).toBeNull();
    expect(comboOf([], 'F9')).toBe('F9');
    expect(comboOf(['Win'], 'F24')).toBe('Win+F24');
  });
  test('tecla que o backend não aceita', () => {
    expect(comboOf(['Ctrl'], 'Space')).toBeNull();
  });
});

test('hotkeyParts e sameHotkey', () => {
  expect(hotkeyParts('Ctrl+Alt+M')).toEqual(['Ctrl', 'Alt', 'M']);
  expect(hotkeyParts('')).toEqual([]);
  expect(sameHotkey('Ctrl+Alt+M', 'ctrl+alt+m')).toBe(true);
  expect(sameHotkey('Ctrl+Alt+M', 'Ctrl+Alt+P')).toBe(false);
  expect(sameHotkey('', '')).toBe(false);
  expect(sameHotkey('Ctrl+Alt+M', '')).toBe(false);
});
