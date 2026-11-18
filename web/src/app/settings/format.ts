import type { Dict } from '../i18n';

/** 45 min · 1 h 05 · 6 min 12 s (com segundos) · 48 s */
export function fmtDuration(sec: number, withSeconds = false): string {
  sec = Math.max(0, Math.round(sec));
  if (sec < 60) return `${sec} s`;
  const m = Math.floor(sec / 60);
  if (m < 60) return withSeconds && sec % 60 ? `${m} min ${sec % 60} s` : `${Math.round(sec / 60)} min`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`;
}

/** "hoje, 21:02" · "ontem, 22:41" · "domingo, 19:40" */
export function dayTime(iso: string | number, s: Dict, withSeconds = false): string {
  const d = new Date(iso);
  const now = new Date();
  const yesterday = new Date(Date.now() - 86_400_000);
  const time = clock(d, s, withSeconds);
  if (d.toDateString() === now.toDateString()) return `${s.today}, ${time}`;
  if (d.toDateString() === yesterday.toDateString()) return `${s.yesterday}, ${time}`;
  const sameWeek = now.getTime() - d.getTime() < 6 * 86_400_000;
  const day = sameWeek
    ? d.toLocaleDateString(s.locale, { weekday: 'long' })
    : d.toLocaleDateString(s.locale, { day: '2-digit', month: '2-digit' });
  return `${day}, ${time}`;
}

export function clock(d: Date | number, s: Dict, withSeconds = false): string {
  return new Date(d).toLocaleTimeString(s.locale, {
    hour: '2-digit',
    minute: '2-digit',
    second: withSeconds ? '2-digit' : undefined,
    hourCycle: s.locale === 'pt-BR' ? 'h23' : undefined,
  });
}

export function capitalize(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Trecho de texto com estilo (negrito, itálico, código). Nunca HTML. */
export interface MdSpan {
  t: string;
  b?: boolean;
  i?: boolean;
  code?: boolean;
}
export interface MdBlock {
  kind: 'h' | 'li' | 'p';
  spans: MdSpan[];
}

/**
 * Notas da versão (markdown vindo da internet) → blocos de texto puro. Nada vira HTML: tags são removidas,
 * links viram só o texto (abrir link a partir do processo elevado abriria o navegador como administrador).
 */
export function markdownToBlocks(md: string): MdBlock[] {
  const out: MdBlock[] = [];
  const clean = md
    .replace(/\r/g, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]*>/g, '')
    .slice(0, 4000);
  let para: string[] = [];
  const flush = () => {
    if (para.length) out.push({ kind: 'p', spans: inline(para.join(' ')) });
    para = [];
  };
  for (const raw of clean.split('\n')) {
    const line = raw.trim();
    if (!line) {
      flush();
      continue;
    }
    const h = line.match(/^#{1,6}\s+(.*)$/);
    const li = line.match(/^(?:[-*+]|\d+[.)])\s+(.*)$/);
    if (h) {
      flush();
      out.push({ kind: 'h', spans: inline(h[1]) });
    } else if (li) {
      flush();
      out.push({ kind: 'li', spans: inline(li[1]) });
    } else para.push(line);
  }
  flush();
  return out.slice(0, 60);
}

function inline(text: string): MdSpan[] {
  // Links e imagens: fica só o texto
  text = text.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
  const spans: MdSpan[] = [];
  const re = /(\*\*|__)(.+?)\1|(\*|_)(.+?)\3|`([^`]+)`/g;
  let last = 0;
  for (let m: RegExpExecArray | null; (m = re.exec(text)); ) {
    if (m.index > last) spans.push({ t: text.slice(last, m.index) });
    if (m[2] != null) spans.push({ t: m[2], b: true });
    else if (m[4] != null) spans.push({ t: m[4], i: true });
    else spans.push({ t: m[5], code: true });
    last = re.lastIndex;
  }
  if (last < text.length) spans.push({ t: text.slice(last) });
  return spans;
}
