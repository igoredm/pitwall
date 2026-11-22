import type { PcEvent } from './models';

/**
 * 1.3 ("entender o desempenho", docs/v13-contract.md): "O que segurou o FPS", tendência por jogo e por driver,
 * benchmark por atalho, energia e custo, e os eventos novos do Relatório do PC. Tudo dentro de `v13` (spread no fim de
 * ptBR/en, como os dicionários da 1.2). Fatos, não diagnóstico: "coincidiu", "% do tempo", nunca "a causa é".
 */
type Ev = Pick<PcEvent, 'kind' | 'eventId' | 'exe' | 'code' | 'message'>;

const v13 = {
  // ---------------------------------------------------------------- O que segurou o FPS
  insTitle: 'O que segurou o FPS',
  insCrash: 'O jogo fechou com erro (Application Error).',
  insHang: 'O jogo parou de responder.',
  insCrit: (name: string, dur: string) => `${name} acima do limite crítico definido por ${dur}.`,
  insPower: (p: number) => `Clock limitado por energia em ${p}% do tempo.`,
  insThermal: (p: number) => `Clock limitado por temperatura em ${p}% do tempo.`,
  insStutters: (n: number, pm: string) => `${n} engasgos (${pm} por minuto).`,
  insGpuBound: (p: number) => `GPU no limite: uso médio de ${p}%.`,
  insGpuSpare: (p: number) => `GPU com folga: uso médio de ${p}%. O limite veio de outro lugar (CPU, jogo ou limite de FPS).`,
  insTone: { crit: 'crítico', warn: 'atenção', info: 'informação' } as Record<string, string>,

  // ---------------------------------------------------------------- jogo que fechou com erro
  exitCrash: (t: string) => `O jogo fechou com erro às ${t}.`,
  exitHang: (t: string) => `O jogo parou de responder às ${t}.`,
  seeEvents: 'Ver no Relatório do PC',
  pillCrash: 'fechou com erro',
  pillHang: 'parou de responder',

  // ---------------------------------------------------------------- energia e custo
  energyLine: (e: string) => `Energia ${e} (GPU + CPU)`,
  energyTip: 'Estimativa: só placa de vídeo e processador, sem o resto do PC.',
  energySec: 'Custo da energia',
  energyHint: 'Preço do kWh na sua conta de luz, para estimar o custo de cada partida. Vazio = mostra só a energia.',
  tariff: 'Preço do kWh',
  currency: 'Moeda',
  tariffPh: 'ex.: 0,89',
  energyExample: (wh: string, cost: string | null) => (cost ? `Uma hora a 400 W: ${wh}, ${cost}.` : `Uma hora a 400 W: ${wh}.`),

  // ---------------------------------------------------------------- tendência
  trendTitle: 'Tendência',
  trendHint: 'Um ponto por partida de 2 min ou mais. A linha vertical marca onde o driver de vídeo mudou.',
  trendGame: 'Jogo',
  trendGameOpt: (exe: string, n: number) => `${exe} · ${n} partidas`,
  trendFps: 'FPS por partida',
  trendAvg: 'FPS médio',
  trendLow: '1% low',
  trendDelta: 'Δ hot spot − núcleo',
  trendDeltaHint: 'média de cada partida',
  trendEach: 'cada partida',
  trendMedian: 'mediana de 5',
  trendShift: (driver: string, b: string, a: string, pct: string) => `Desde o driver ${driver}: FPS médio ${b} → ${a} (${pct})`,
  trendShiftNote: (nb: number, na: number) => `Mediana de ${nb} partidas antes e ${na} depois da troca. Outras mudanças (jogo, configurações) podem ter coincidido.`,
  trendNoShift: 'A frase de antes e depois aparece com pelo menos 3 partidas de cada lado da troca de driver.',
  trendEmpty: 'Jogue pelo menos 2 partidas de 2 min ou mais do mesmo jogo para ver a tendência.',
  trendNoDelta: 'Estas partidas não têm o hot spot (a placa não informa ou são de uma versão antiga do Pitwall).',
  trendFpsAria: (exe: string, n: number) => `FPS médio e 1% low de ${n} partidas de ${exe}`,
  trendDeltaAria: (exe: string) => `Diferença entre hot spot e núcleo por partida de ${exe}`,

  // ---------------------------------------------------------------- benchmark
  benchTitle: 'Benchmark',
  benchHint: (keys: string | null) =>
    `Mede um trecho do jogo com tempo fixo: FPS médio, 1% e 0,1% low e engasgos.${keys ? ` O atalho ${keys} começa e cancela.` : ''}`,
  benchDuration: 'Duração',
  benchStart: 'Iniciar',
  benchCancel: 'Cancelar',
  benchRunning: (exe: string) => `Medindo ${exe}`,
  benchLeft: (left: string) => `faltam ${left}`,
  benchNeedGame: 'Abra um jogo para medir.',
  benchErr: {
    noGame: 'Nenhum jogo aberto: o benchmark não começou.',
    noFps: 'O jogo está aberto, mas o FPS não está chegando: o benchmark não começou.',
    gameEnded: 'O jogo fechou antes de 10 s: o benchmark não foi salvo.',
  } as Record<string, string>,
  benchDone: (fps: string, low: string) => `Pronto: ${fps} FPS médio · 1% low ${low}.`,
  benchCancelled: 'Benchmark cancelado.',
  benchPartial: 'parcial',
  benchPartialTip: 'O jogo fechou no meio: salvo com o tempo que deu.',
  benchEmpty: 'Nenhum benchmark ainda. Com um jogo aberto, aperte Iniciar ou o atalho.',
  colGame: 'Jogo e nota',
  colWhen: 'Quando',
  colDur: 'Duração',
  colFps: 'FPS',
  col1: '1%',
  col01: '0,1%',
  colSt: 'Engasgos',
  notePh: 'Nota (ex.: DLSS Qualidade)',
  addNote: 'adicionar nota',
  noteAria: (exe: string, when: string) => `Nota do benchmark de ${exe} de ${when}`,
  del: 'Apagar',
  delSure: 'Apagar?',
  delAria: (exe: string, when: string) => `Apagar o benchmark de ${exe} de ${when}`,
  shareAria: (exe: string, when: string) => `Compartilhar o benchmark de ${exe} de ${when}`,
  cbAria: (exe: string, when: string) => `Comparar o benchmark de ${exe} de ${when}`,
  benchSel: (n: number) => (n === 1 ? '1 marcado · marque mais um para comparar' : n === 0 ? 'Marque dois para comparar' : `${n} marcados`),
  benchCmpHint: (same: boolean): string => (same ? 'Mesmo jogo.' : 'Jogos diferentes.'),
  keeps200: 'Guarda os 200 mais recentes.',
  benchDur: (d: string) => `Benchmark ${d}`,
  shareBenchTitle: 'Compartilhar benchmark',

  // ---------------------------------------------------------------- atalhos e widget
  hkBench: 'Benchmark',
  hkSame: 'Outro atalho já usa estas teclas. Escolha outra combinação.',
  benchChip: 'BENCH',
  benchChipAria: (left: string) => `Benchmark rodando, faltam ${left}`,

  // ---------------------------------------------------------------- Relatório do PC
  evName: {
    sleep: 'Suspensão',
    resume: 'Voltou da suspensão',
    boot: 'Windows iniciou',
    shutdown: 'Desligar ou reiniciar',
    appCrash: 'Jogo fechou com erro',
    appHang: 'Jogo parou de responder',
  } as Record<string, string>,
  evMeaning: (e: Ev): string | null => {
    const game = e.exe ?? 'O jogo';
    switch (e.kind) {
      case 'sleep':
        return 'O PC entrou em suspensão ou hibernação.';
      case 'resume':
        return 'O PC voltou da suspensão.';
      case 'boot':
        return 'O Windows começou a ligar.';
      case 'shutdown':
        return e.eventId === 13 ? 'O Windows terminou de desligar.' : `Um programa ou a pessoa pediu para desligar ou reiniciar${e.message ? `: ${e.message}` : ''}.`;
      case 'appCrash':
        return `${game} fechou com erro${e.code ? ` no módulo ${e.code}` : ''}. O Windows registrou como Application Error.`;
      case 'appHang':
        return `${game} parou de responder e foi fechado.`;
    }
    return null;
  },
  evPill: { appCrash: 'Jogo fechou', appHang: 'Jogo parou', sleep: 'Suspensão' } as Record<string, string>,
  filterAria: 'Quais eventos mostrar',
  filterProblems: 'Problemas',
  filterAll: 'Tudo',
  eventsHint: 'Do log do Windows: problemas dos últimos 30 dias e, em Tudo, suspensão, ligar e desligar dos últimos 7. O Pitwall mostra o que cada um quer dizer, sem tirar conclusões.',
  eventsEmpty: 'Nenhuma queda, tela azul, WHEA, driver de vídeo reiniciado ou jogo fechando com erro nos últimos 30 dias.',
  eventsEmptyAll: 'Nenhum evento do Windows nos últimos dias.',
  hiddenState: (n: number) => (n === 1 ? '+1 de suspensão, ligar ou desligar em Tudo' : `+${n} de suspensão, ligar ou desligar em Tudo`),
  seqTitle: 'Em ordem',
  seqLastSave: 'última gravação',
  seqBack: 'PC voltou',

  // ---------------------------------------------------------------- busca
  searchTrend: 'tendencia trend driver grafico chart fps medio historico evolucao queda atualizacao',
  searchBench: 'benchmark medir medicao teste fps atalho ctrl alt b trecho',
  searchEnergy: 'energia energy custo cost kwh tarifa tariff conta de luz preco moeda currency',
};

export const v13Pt = { v13 };

export const v13En: typeof v13Pt = {
  v13: {
    insTitle: 'What held the FPS back',
    insCrash: 'The game closed with an error (Application Error).',
    insHang: 'The game stopped responding.',
    insCrit: (name, dur) => `${name} above the set critical limit for ${dur}.`,
    insPower: (p) => `Clock limited by power ${p}% of the time.`,
    insThermal: (p) => `Clock limited by temperature ${p}% of the time.`,
    insStutters: (n, pm) => `${n} stutters (${pm} per minute).`,
    insGpuBound: (p) => `GPU maxed out: average load ${p}%.`,
    insGpuSpare: (p) => `GPU had headroom: average load ${p}%. The limit came from somewhere else (CPU, the game or an FPS cap).`,
    insTone: { crit: 'critical', warn: 'warning', info: 'info' },

    exitCrash: (t) => `The game closed with an error at ${t}.`,
    exitHang: (t) => `The game stopped responding at ${t}.`,
    seeEvents: 'See in PC report',
    pillCrash: 'closed with error',
    pillHang: 'stopped responding',

    energyLine: (e) => `Energy ${e} (GPU + CPU)`,
    energyTip: 'Estimate: graphics card and processor only, not the rest of the PC.',
    energySec: 'Energy cost',
    energyHint: 'Price per kWh on your power bill, to estimate the cost of each match. Empty = shows the energy only.',
    tariff: 'Price per kWh',
    currency: 'Currency',
    tariffPh: 'e.g. 0.15',
    energyExample: (wh, cost) => (cost ? `One hour at 400 W: ${wh}, ${cost}.` : `One hour at 400 W: ${wh}.`),

    trendTitle: 'Trend',
    trendHint: 'One point per match of 2 min or more. The vertical line marks where the graphics driver changed.',
    trendGame: 'Game',
    trendGameOpt: (exe, n) => `${exe} · ${n} matches`,
    trendFps: 'FPS per match',
    trendAvg: 'Average FPS',
    trendLow: '1% low',
    trendDelta: 'Δ hot spot − core',
    trendDeltaHint: 'average of each match',
    trendEach: 'each match',
    trendMedian: 'median of 5',
    trendShift: (driver, b, a, pct) => `Since driver ${driver}: average FPS ${b} → ${a} (${pct})`,
    trendShiftNote: (nb, na) => `Median of ${nb} matches before and ${na} after the change. Other changes (game, settings) may have coincided.`,
    trendNoShift: 'The before and after line shows up with at least 3 matches on each side of a driver change.',
    trendEmpty: 'Play at least 2 matches of 2 min or more of the same game to see the trend.',
    trendNoDelta: "These matches have no hot spot (the card doesn't report it or they're from an older Pitwall).",
    trendFpsAria: (exe, n) => `Average FPS and 1% low of ${n} matches of ${exe}`,
    trendDeltaAria: (exe) => `Difference between hot spot and core per match of ${exe}`,

    benchTitle: 'Benchmark',
    benchHint: (keys) => `Measures a stretch of the game for a fixed time: average FPS, 1% and 0.1% low and stutters.${keys ? ` The ${keys} shortcut starts and cancels it.` : ''}`,
    benchDuration: 'Duration',
    benchStart: 'Start',
    benchCancel: 'Cancel',
    benchRunning: (exe) => `Measuring ${exe}`,
    benchLeft: (left) => `${left} left`,
    benchNeedGame: 'Open a game to measure.',
    benchErr: {
      noGame: "No game open: the benchmark didn't start.",
      noFps: "The game is open but no FPS is coming in: the benchmark didn't start.",
      gameEnded: "The game closed before 10 s: the benchmark wasn't saved.",
    },
    benchDone: (fps, low) => `Done: ${fps} average FPS · 1% low ${low}.`,
    benchCancelled: 'Benchmark cancelled.',
    benchPartial: 'partial',
    benchPartialTip: 'The game closed midway: saved with the time it got.',
    benchEmpty: 'No benchmarks yet. With a game open, press Start or the shortcut.',
    colGame: 'Game and note',
    colWhen: 'When',
    colDur: 'Duration',
    colFps: 'FPS',
    col1: '1%',
    col01: '0.1%',
    colSt: 'Stutters',
    notePh: 'Note (e.g. DLSS Quality)',
    addNote: 'add a note',
    noteAria: (exe, when) => `Note for the ${exe} benchmark from ${when}`,
    del: 'Delete',
    delSure: 'Delete?',
    delAria: (exe, when) => `Delete the ${exe} benchmark from ${when}`,
    shareAria: (exe, when) => `Share the ${exe} benchmark from ${when}`,
    cbAria: (exe, when) => `Compare the ${exe} benchmark from ${when}`,
    benchSel: (n) => (n === 1 ? '1 selected · pick one more to compare' : n === 0 ? 'Pick two to compare' : `${n} selected`),
    benchCmpHint: (same) => (same ? 'Same game.' : 'Different games.'),
    keeps200: 'Keeps the 200 most recent.',
    benchDur: (d) => `Benchmark ${d}`,
    shareBenchTitle: 'Share benchmark',

    hkBench: 'Benchmark',
    hkSame: 'Another shortcut already uses these keys. Pick another combination.',
    benchChip: 'BENCH',
    benchChipAria: (left) => `Benchmark running, ${left} left`,

    evName: {
      sleep: 'Sleep',
      resume: 'Woke from sleep',
      boot: 'Windows started',
      shutdown: 'Shut down or restart',
      appCrash: 'Game closed with an error',
      appHang: 'Game stopped responding',
    },
    evMeaning: (e) => {
      const game = e.exe ?? 'The game';
      switch (e.kind) {
        case 'sleep':
          return 'The PC went to sleep or hibernation.';
        case 'resume':
          return 'The PC woke from sleep.';
        case 'boot':
          return 'Windows started booting.';
        case 'shutdown':
          return e.eventId === 13 ? 'Windows finished shutting down.' : `A program or the user asked to shut down or restart${e.message ? `: ${e.message}` : ''}.`;
        case 'appCrash':
          return `${game} closed with an error${e.code ? ` in module ${e.code}` : ''}. Windows logged it as Application Error.`;
        case 'appHang':
          return `${game} stopped responding and was closed.`;
      }
      return null;
    },
    evPill: { appCrash: 'Game closed', appHang: 'Game hung', sleep: 'Sleep' },
    filterAria: 'Which events to show',
    filterProblems: 'Problems',
    filterAll: 'All',
    eventsHint: 'From the Windows log: problems from the last 30 days and, under All, sleep, start and shutdown from the last 7. Pitwall shows what each one means, without drawing conclusions.',
    eventsEmpty: 'No crash, blue screen, WHEA, graphics driver reset or game closing with an error in the last 30 days.',
    eventsEmptyAll: 'No Windows events in the last few days.',
    hiddenState: (n) => (n === 1 ? '+1 sleep, start or shutdown under All' : `+${n} sleep, start or shutdown under All`),
    seqTitle: 'In order',
    seqLastSave: 'last save',
    seqBack: 'PC came back',

    searchTrend: 'trend tendencia driver chart grafico average fps history evolution drop update',
    searchBench: 'benchmark measure test fps shortcut hotkey ctrl alt b stretch',
    searchEnergy: 'energy energia cost custo kwh tariff tarifa power bill price currency moeda',
  },
};
