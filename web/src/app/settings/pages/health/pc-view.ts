import type { Dict } from '../../../i18n';
import { Catalog, Level, MetricGroup, MetricSetting, PcIncident, PcIncidentSummary, PcSeriesId } from '../../../models';
import { level, shortCpu, shortGpu } from '../../../widget/metric-views';
import { clock } from '../../format';
import { dayOrNull, evKey, evSource, extent, fmtReading, fmtUp, seriesPaths, yOf } from '../../reports';

/** Os 6 gráficos de 2 min (ordem do design); série ausente some da lista. */
export const PC_CHARTS: { id: PcSeriesId; unit: string; unitOnMax: boolean }[] = [
  { id: 'gpu.hotspot', unit: '°C', unitOnMax: true },
  { id: 'gpu.temp', unit: '°C', unitOnMax: true },
  { id: 'gpu.power', unit: 'W', unitOnMax: true },
  { id: 'gpu.clock', unit: 'MHz', unitOnMax: false },
  { id: 'cpu.temp', unit: '°C', unitOnMax: true },
  { id: 'fps.current', unit: '', unitOnMax: false },
];

export interface IncidentHead {
  title: string;
  upFor: string | null;
  exe: string | null;
  matchFor: string | null;
  back: string | null;
  hw: string;
}

/** Cabeçalho do incidente: título, "Ligado havia … · jogando X (48 min de partida) · voltou às …" e o hardware. */
export function incidentHead(inc: PcIncidentSummary, s: Dict, cat: Catalog | null): IncidentHead {
  const t = clock(new Date(inc.time), s);
  const day = dayOrNull(inc.time, s);
  const hw = cat?.hardware;
  const parts = [
    hw?.gpu ? shortGpu(hw.gpu) : '',
    hw?.gpuDriver ? s.rp.driver(hw.gpuDriver) : '',
    hw?.cpu ? shortCpu(hw.cpu) : '',
    hw?.ramGb ? `${hw.ramGb} GB` : '',
    hw?.os ?? '',
  ].filter(Boolean);
  return {
    title: inc.kind === 'bugcheck' ? s.rp.titleBugcheck(t, day) : s.rp.titleAbrupt(t, day),
    upFor: inc.uptimeSec != null ? s.rp.upFor(fmtUp(inc.uptimeSec)) : null,
    exe: inc.exe ?? null,
    matchFor: inc.exe && inc.sessionStart ? s.rp.matchFor(fmtUp((new Date(inc.time).getTime() - new Date(inc.sessionStart).getTime()) / 1000)) : null,
    back: inc.bootTime ? s.rp.backAt(clock(new Date(inc.bootTime), s)) : null,
    hw: parts.join(' · '),
  };
}

/** Sub do cabeçalho em texto corrido (para copiar). */
export function headLine(h: IncidentHead, s: Dict): string {
  return [h.upFor, h.exe ? `${s.rp.playing} ${h.exe}${h.matchFor ? ' ' + h.matchFor : ''}` : s.rp.outOfGame, h.back].filter(Boolean).join(' · ');
}

export interface ChartRow {
  id: PcSeriesId;
  name: string;
  line: string;
  area: string;
  color: string;
  warnY: number | null;
  minMax: string;
  end: string;
  endLevel: Level;
  aria: string;
}

/** Gráficos de 2 min: escala = mín/máx da série com folga (não começa em 0), tracejado do amarelo quando cabe. */
export function chartRows(inc: PcIncident, s: Dict, settings: Map<string, MetricSetting>): ChartRow[] {
  return PC_CHARTS.flatMap(({ id, unit, unitOnMax }) => {
    const data = inc.series[id];
    const ext = data ? extent(data) : null;
    if (!data || !ext) return [];
    const [min, max] = ext;
    const pad = Math.max((max - min) * 0.25, id === 'gpu.clock' ? 20 : id === 'gpu.power' ? 5 : 1);
    const lo = min - pad;
    const hi = max + pad;
    const st = settings.get(id);
    const fps = id === 'fps.current';
    const lv = fps ? 'ok' : level(max, st?.warn, st?.crit);
    const lastV = [...data].reverse().find((v) => v != null) ?? null;
    const fmt = (v: number) => (unit && unit !== 'MHz' ? `${Math.round(v)} ${unit}` : String(Math.round(v)));
    const endTxt = lastV == null ? s.rp.noReading : unit ? `${Math.round(lastV)} ${unit}` : String(Math.round(lastV));
    const minMax = s.minMax(String(Math.round(min)), unitOnMax ? fmt(max) : String(Math.round(max)));
    return [
      {
        id,
        name: s.rp.pcSeries[id],
        ...seriesPaths(data, lo, hi, { h: 32, yTop: 2, yBottom: 30 }),
        color: fps ? 'var(--g)' : lv === 'crit' ? 'var(--r)' : lv === 'warn' ? 'var(--y)' : 'var(--ac)',
        warnY: !fps && st?.warn != null ? yOf(st.warn, lo, hi, 2, 30) : null,
        minMax,
        end: endTxt,
        endLevel: fps ? 'ok' : level(lastV, st?.warn, st?.crit),
        aria: `${s.rp.pcSeries[id]}: ${minMax}, ${s.rp.atEnd} ${endTxt}`,
      },
    ];
  });
}

/** Rótulos do eixo comum: −2:00 … −0:30 e a hora da última gravação. */
export function axisLabels(inc: PcIncident, s: Dict): string[] {
  const n = Math.max(...PC_CHARTS.map((c) => inc.series[c.id]?.length ?? 0));
  const total = Math.max(1, n * (inc.intervalMs || 1000)) / 1000;
  const mmss = (sec: number) => `−${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;
  return [mmss(total), mmss((total * 3) / 4), mmss(total / 2), mmss(total / 4), clock(new Date(inc.time), s, true)];
}

export interface ReadingCell {
  id: string;
  name: string;
  value: string;
  level: Level | 'none';
}

/** "Últimas medições" em 3 colunas: GPU · CPU e RAM · FPS e outros. */
export function readingColumns(inc: PcIncident, s: Dict, settings: Map<string, MetricSetting>): { title: string; cells: ReadingCell[] }[] {
  const cols: { title: string; groups: MetricGroup[] }[] = [
    { title: s.rp.colGpu, groups: ['gpu'] },
    { title: s.rp.colCpuRam, groups: ['cpu', 'ram'] },
    { title: s.rp.colFpsOther, groups: ['fps', 'other'] },
  ];
  return cols.map((c) => ({
    title: c.title,
    cells: inc.last
      .filter((r) => c.groups.includes(r.group))
      .map((r) => {
        const st = settings.get(r.id);
        return {
          id: r.id,
          name: r.name,
          value: r.value == null ? s.rp.noReading : fmtReading(r.value, r.unit, s, r.id),
          level: r.value == null ? 'none' : level(r.value, st?.warn, st?.crit),
        };
      }),
  }));
}

/** Pílulas do histórico: BugCheck e WHEA fatal em vermelho; WHEA corrigido vira contagem; 6008 fica de fora. */
export function eventPills(inc: PcIncidentSummary, s: Dict): { text: string; red: boolean }[] {
  const keys = inc.events.map(evKey);
  const out: { text: string; red: boolean }[] = [];
  if (keys.includes('bugcheck')) out.push({ text: s.rp.evPill['bugcheck'], red: true });
  if (keys.includes('wheaFatal')) out.push({ text: s.rp.evPill['wheaFatal'], red: true });
  if (keys.includes('kernelPower41')) out.push({ text: s.rp.evPill['kernelPower41'], red: false });
  const whea = keys.filter((k) => k === 'whea').length;
  if (whea) out.push({ text: s.rp.wheaCount(whea), red: false });
  if (keys.includes('gpuReset')) out.push({ text: s.rp.evPill['gpuReset'], red: false });
  return out;
}

/** Intervalo de gravação do buffer: 5 s em jogo, 10 s fora (docs/v12-contract.md › Buffer do PC). */
export function saveNote(inc: PcIncidentSummary, s: Dict): string {
  const every = inc.exe ? 5 : 10;
  const t = new Date(inc.time).getTime();
  return s.rp.saveNote(clock(t, s, true), every, clock(t + every * 1000, s, true), !!inc.exe);
}

/** Texto para copiar: simples (Discord, WhatsApp) ou Markdown (Reddit, GitHub, fóruns). */
export function incidentText(inc: PcIncident, s: Dict, cat: Catalog | null, settings: Map<string, MetricSetting>, md: boolean): string {
  const h = incidentHead(inc, s, cat);
  const date = new Date(inc.time).toLocaleDateString(s.locale, { day: '2-digit', month: '2-digit', year: 'numeric' });
  const version = cat?.version ?? cat?.about?.app ?? '';
  const b = (x: string) => (md ? `**${x}**` : x);
  const out: string[] = [];
  out.push(`${b(h.title)} (${date})`);
  out.push(headLine(h, s));
  if (h.hw) out.push(h.hw);
  const rows = chartRows(inc, s, settings);
  if (rows.length) {
    out.push('', b(s.rp.txtLast2));
    for (const r of rows) out.push(`${md ? '- ' : ''}${r.name}: ${r.minMax} · ${s.rp.atEnd} ${r.end}`);
  }
  const cols = readingColumns(inc, s, settings).filter((c) => c.cells.length);
  if (cols.length) {
    out.push('', b(s.rp.txtReadings(clock(new Date(inc.time), s, true))));
    if (md) {
      out.push(`| ${s.rp.txtGroup} | ${s.rp.txtSensor} | ${s.rp.txtValue} |`, '|---|---|---:|');
      for (const c of cols) for (const x of c.cells) out.push(`| ${c.title} | ${x.name} | ${x.value} |`);
    } else for (const c of cols) out.push(`${c.title}: ${c.cells.map((x) => `${x.name} ${x.value}`).join(' · ')}`);
  }
  if (inc.events.length) {
    out.push('', b(s.rp.txtEvents));
    for (const e of [...inc.events].sort((x, y) => x.time.localeCompare(y.time))) {
      const k = evKey(e);
      const name = s.rp.evName[k] ?? e.source;
      const src = evSource(e);
      out.push(md ? `- ${clock(new Date(e.time), s, true)} · **${name}** · \`${src}\` — ${s.rp.evMeaning[k] ?? ''}` : `${clock(new Date(e.time), s, true)} ${name} (${src}): ${s.rp.evMeaning[k] ?? ''}`);
    }
  }
  out.push('', md ? `*Pitwall ${version} · ${s.rp.txtHead}*` : `Pitwall ${version} · ${s.rp.txtHead}`);
  return out.join('\n');
}
