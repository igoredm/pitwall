/** 1.2: regras puras dos atalhos globais (formato do backend: Ctrl+Alt+Shift+Win+Tecla). Testadas em hotkey.spec.ts. */

/** event.key dos modificadores → nome no atalho. */
export const MODS: Record<string, string> = { Control: 'Ctrl', Alt: 'Alt', Shift: 'Shift', Meta: 'Win', OS: 'Win' };

/** Tecla aceita pelo backend (A–Z, 0–9, F1–F24) a partir do KeyboardEvent.code; null = não vale. */
export function keyOf(code: string): string | null {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) return code;
  return null;
}

/** Modificadores pressionados, na ordem do backend. */
export function heldMods(e: Pick<KeyboardEvent, 'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey'>): string[] {
  return [e.ctrlKey && 'Ctrl', e.altKey && 'Alt', e.shiftKey && 'Shift', e.metaKey && 'Win'].filter(Boolean) as string[];
}

/** Atalho a partir dos modificadores e do KeyboardEvent.code. Letras e números precisam de um modificador; F1–F24 podem ir sozinhas. null = não vale. */
export function comboOf(mods: readonly string[], code: string): string | null {
  const key = keyOf(code);
  if (!key || (!mods.length && !key.startsWith('F'))) return null;
  return [...mods, key].join('+');
}

/** Teclas para mostrar ("Ctrl+Alt+M" → ["Ctrl", "Alt", "M"]); vazio = desligado. */
export function hotkeyParts(value: string): string[] {
  return value ? value.split('+') : [];
}

/** Os dois atalhos são iguais (o backend não diferencia maiúsculas)? Vazio nunca conflita. */
export function sameHotkey(a: string, b: string): boolean {
  return !!a && !!b && a.toLowerCase() === b.toLowerCase();
}
