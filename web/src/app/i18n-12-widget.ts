/** 1.2: textos do widget (faixa e telinha), do assistente com um monitor e do ajuste da GPU sem NVIDIA. */
export const widgetPt = {
  layoutStripBtn: 'Faixa',
  layoutMiniBtn: 'Mini',
  layoutDesc12: {
    strip: 'Faixa larga · 1920 × 480, Xeneon Edge',
    mini: 'Telinha de 5" ou 7" · 800 × 480',
  } as Record<string, string>,
  /** Célula do uso da GPU na telinha (as outras células da GPU são núcleo, hot spot…). */
  miniGpuLoad: 'GPU uso',
  /** Tiles da RAM na faixa. */
  ramUsedTile: 'Usada',
  ramFreeTile: 'Livre',
  fillMonitorBtn: 'Ocupar o monitor',
  fillMonitorHint: 'Para telinhas e faixas dedicadas (Xeneon Edge, tela de 5" ou 7"): o widget ocupa o monitor inteiro.',

  // Assistente, passo 1 com um monitor só
  wizOneMonHint: (w: number, h: number) =>
    `Achamos um monitor só (${w} × ${h}). O widget foi feito para um segundo monitor, mas dá para usar assim:`,
  wizHowAria: 'Como ver o widget',
  wizPhoneTitle: 'Ver no celular ou na TV',
  wizPhoneHint: 'Abre o widget num celular ou TV da mesma rede Wi-Fi. Fica fora da tela do jogo. Leva a Celular e TV para parear.',
  wizCornerTitle: 'Deixar no canto da tela',
  wizCornerHint: (keys: string) =>
    keys
      ? `O widget compacto fica sempre por cima, num canto. ${keys} mostra e esconde, até dentro do jogo.`
      : 'O widget compacto fica sempre por cima, num canto.',
  wizCorner: 'Canto',
  wizCornerAria: 'Canto da tela',
  wizCorners: { tl: 'Superior esquerdo', tr: 'Superior direito', bl: 'Inferior esquerdo', br: 'Inferior direito' } as Record<string, string>,
  wizMoreMonitors: 'Ligou outro monitor? Ele aparece aqui.',

  // Ajuste da GPU sem NVIDIA
  gpuNvTitle: 'O ajuste precisa de uma GPU NVIDIA',
  gpuNvBody: (gpu: string) => `Esta é uma ${gpu}. O resto do Pitwall funciona igual: sensores, FPS, relatórios e alertas.`,
  gpuNvBodyNoName: 'O resto do Pitwall funciona igual: sensores, FPS, relatórios e alertas.',
  gpuNvSwitchHint: 'Limita consumo e clock pela API oficial da NVIDIA. Desfaz sozinho.',
};

export const widgetEn: typeof widgetPt = {
  layoutStripBtn: 'Strip',
  layoutMiniBtn: 'Small screen',
  layoutDesc12: {
    strip: 'Wide band · 1920 × 480, Xeneon Edge',
    mini: '5" or 7" screen · 800 × 480',
  },
  miniGpuLoad: 'GPU load',
  ramUsedTile: 'Used',
  ramFreeTile: 'Free',
  fillMonitorBtn: 'Fill the monitor',
  fillMonitorHint: 'For dedicated small screens and strips (Xeneon Edge, 5" or 7" displays): the widget fills the whole monitor.',

  wizOneMonHint: (w, h) =>
    `We found a single monitor (${w} × ${h}). The widget is made for a second screen, but you can use it like this:`,
  wizHowAria: 'How to view the widget',
  wizPhoneTitle: 'Watch on your phone or TV',
  wizPhoneHint: 'Opens the widget on a phone or TV on the same Wi-Fi. Stays off your game screen. Takes you to Phone & TV to pair.',
  wizCornerTitle: 'Keep it in a corner',
  wizCornerHint: (keys) =>
    keys
      ? `The compact widget stays on top in a corner. ${keys} shows and hides it, even in game.`
      : 'The compact widget stays on top in a corner.',
  wizCorner: 'Corner',
  wizCornerAria: 'Screen corner',
  wizCorners: { tl: 'Top left', tr: 'Top right', bl: 'Bottom left', br: 'Bottom right' },
  wizMoreMonitors: 'Plugged in another monitor? It shows up here.',

  gpuNvTitle: 'Tuning needs an NVIDIA GPU',
  gpuNvBody: (gpu) => `This is an ${gpu}. The rest of Pitwall works the same: sensors, FPS, reports and alerts.`,
  gpuNvBodyNoName: 'The rest of Pitwall works the same: sensors, FPS, reports and alerts.',
  gpuNvSwitchHint: "Limits power and clock through NVIDIA's official API. Undoes itself.",
};
