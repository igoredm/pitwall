/**
 * 1.4: "Não é um jogo" nos Relatórios de jogo e "Instalado recentemente" no Relatório do PC. Tudo dentro de `v14`
 * (spread no fim de ptBR/en, como `v13`). Fatos, não diagnóstico: "coincidiu", nunca "a causa é".
 */
const v14 = {
  // ---------------------------------------------------------------- Não é um jogo
  notGame: 'Não é um jogo',
  notGameTip: 'Apaga os relatórios deste programa e para de detectá-lo como jogo.',
  notGameTitle: (exe: string) => `${exe} não é um jogo?`,
  notGameBody: (exe: string) =>
    `Todos os relatórios de ${exe} vão ser apagados e o Pitwall para de detectá-lo como jogo (ele entra na lista Ignorar, em Jogos, e dá para tirar de lá depois). Os relatórios apagados não voltam.`,
  notGameConfirm: 'Apagar e ignorar',

  // ---------------------------------------------------------------- Instalado recentemente
  installsTitle: 'Instalado recentemente',
  installsHint:
    'Programas, drivers e atualizações do Windows dos últimos 30 dias. Quando as quedas começam logo depois de uma instalação, ela é a primeira coisa a olhar.',
  installsAria: 'O que mostrar',
  installsMain: 'Principais',
  installsAll: 'Tudo',
  installsEmpty: 'Nada instalado nos últimos 30 dias.',
  installsHidden: (n: number) => (n === 1 ? '+1 driver da Microsoft ou app da Store em Tudo' : `+${n} drivers da Microsoft e apps da Store em Tudo`),
  installsMore: (n: number) => `Mostrar mais ${n}`,
  installsCount: (n: number) => (n === 1 ? '1 item' : `${n} itens`),
  instKind: { program: 'Programa', driver: 'Driver', update: 'Windows Update', store: 'Microsoft Store' } as Record<string, string>,
  instClass: {
    net: 'rede',
    bluetooth: 'Bluetooth',
    display: 'vídeo',
    media: 'áudio',
    hid: 'teclado, mouse ou controle',
    usb: 'USB',
    storage: 'armazenamento',
    printer: 'impressora',
    system: 'sistema',
    other: '',
  } as Record<string, string>,
  instCrashes: (before: number, after: number) => `quedas: ${before} antes → ${after} depois`,
  instCrashesTip:
    'Quedas do PC (desligamento abrupto, tela azul, WHEA grave ou reinício do driver de vídeo) nos 7 dias antes e nos 7 dias depois da instalação. Coincidência no tempo, não prova.',

  searchInstalls: 'instalado instalacao recente driver programa atualizacao windows update queda causa wifi bluetooth',
};

export const v14Pt = { v14 };

export const v14En: typeof v14Pt = {
  v14: {
    notGame: 'Not a game',
    notGameTip: 'Deletes the reports of this program and stops detecting it as a game.',
    notGameTitle: (exe) => `${exe} is not a game?`,
    notGameBody: (exe) =>
      `All reports of ${exe} will be deleted and Pitwall stops detecting it as a game (it goes to the Ignore list under Games, and you can remove it from there later). Deleted reports cannot be recovered.`,
    notGameConfirm: 'Delete and ignore',

    installsTitle: 'Recently installed',
    installsHint:
      'Programs, drivers and Windows updates from the last 30 days. When crashes start right after an install, that install is the first thing to check.',
    installsAria: 'What to show',
    installsMain: 'Main',
    installsAll: 'All',
    installsEmpty: 'Nothing installed in the last 30 days.',
    installsHidden: (n) => (n === 1 ? '+1 Microsoft driver or Store app under All' : `+${n} Microsoft drivers and Store apps under All`),
    installsMore: (n) => `Show ${n} more`,
    installsCount: (n) => (n === 1 ? '1 item' : `${n} items`),
    instKind: { program: 'Program', driver: 'Driver', update: 'Windows Update', store: 'Microsoft Store' },
    instClass: {
      net: 'network',
      bluetooth: 'Bluetooth',
      display: 'display',
      media: 'audio',
      hid: 'keyboard, mouse or controller',
      usb: 'USB',
      storage: 'storage',
      printer: 'printer',
      system: 'system',
      other: '',
    },
    instCrashes: (before, after) => `crashes: ${before} before → ${after} after`,
    instCrashesTip:
      'PC crashes (abrupt shutdown, blue screen, severe WHEA or graphics driver reset) in the 7 days before and the 7 days after the install. A coincidence in time, not proof.',

    searchInstalls: 'installed install recent driver program update windows update crash cause wifi bluetooth',
  },
};
