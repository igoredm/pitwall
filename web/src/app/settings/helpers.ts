import type { Dict } from '../i18n';
import { AppConfig, Catalog, MonitorInfo, WidgetLayout } from '../models';

/** Monitor do widget: o da config, senão o primeiro secundário, senão o principal. */
export function selectedMonitor(cat: Catalog | null, cfg: AppConfig | null): MonitorInfo | null {
  const list = cat?.monitors ?? [];
  const dev = cfg?.widget.monitor;
  return list.find((m) => m.device === dev) ?? list.find((m) => !m.primary) ?? list[0] ?? null;
}

/** O que o "Automático" escolhe para a janela (mesma regra do widget). */
export function autoLayout(w: number, h: number): Exclude<WidgetLayout, 'auto'> {
  if (w < 340 && h < 260) return 'compact';
  if (w < 640 && h < 640) return 'mid';
  return 'full';
}

export function layoutName(s: Dict, l: WidgetLayout): string {
  return l === 'full' ? s.layoutFullBtn : l === 'mid' ? s.layoutMidBtn : l === 'compact' ? s.layoutCompactBtn : s.layoutAutoBtn;
}

export function presetName(s: Dict, p: string | undefined): string {
  return p === 'balanced' ? s.gpuBalanced : p === 'cool' ? s.gpuCool : p === 'custom' ? s.gpuCustom : p === 'off' ? s.profOff : s.profDefault;
}

/** Onde o monitor fica em relação ao principal (para "à direita do principal"). */
export function monitorWhere(m: MonitorInfo, list: MonitorInfo[]): string {
  if (m.primary) return 'primary';
  const p = list.find((x) => x.primary);
  if (!p) return 'right';
  const cx = m.x + m.width / 2 - (p.x + p.width / 2);
  const cy = m.y + m.height / 2 - (p.y + p.height / 2);
  if (Math.abs(cx) >= Math.abs(cy)) return cx >= 0 ? 'right' : 'left';
  return cy >= 0 ? 'below' : 'above';
}

/** Normaliza para busca: sem acento, minúsculas. */
export function fold(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Copia um texto (links: abrir daqui rodaria o navegador como administrador). */
export function copyText(text: string): Promise<boolean> {
  return navigator.clipboard?.writeText(text).then(
    () => true,
    () => false,
  ) ?? Promise.resolve(false);
}
