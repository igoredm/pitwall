# Pitwall — Monitor de hardware para Windows (spec)

> Nome provisório. Pitwall = o muro dos boxes da F1, onde a equipe acompanha a telemetria do carro.

## Contexto

Quero um monitor de hardware para Windows que substitua o MSI Afterburner/RTSS, que é pesado e causa bugs nos jogos. Em vez de overlay dentro do jogo, o app mostra um **widget num monitor secundário** (tenho 3 monitores). O jogo principal é o EA FC (FIFA), mas o app deve funcionar com qualquer jogo.

Um objetivo secundário é investigar desligamentos do PC durante jogos, com suspeita de temperatura da GPU (RTX 3080). Por isso o log em CSV é importante.

## Regras inegociáveis

1. **Zero injeção no processo do jogo.** Nada de hooks de DirectX, DLL injection ou overlay estilo RTSS. O EA FC usa anti-cheat em nível de kernel, e injetar código traz risco de ban.
2. **Leve.** Meta de <1% de CPU e <150 MB de RAM no uso normal.
3. **Funcionar com o jogo em qualquer modo de tela** (exclusive fullscreen, borderless ou janela), já que o widget fica em outro monitor.

## Stack sugerida (pode questionar se tiver algo melhor)

- **Backend:** .NET 8, rodando como processo em segundo plano com ícone na bandeja do sistema.
  - **Sensores:** usar a versão mais recente do **LibreHardwareMonitorLib**. O driver antigo WinRing0 é marcado como vulnerável pelo Windows Defender; confirme que a versão usada não depende dele.
  - **FPS:** **PresentMon**, via SDK ou console, que lê eventos ETW sem tocar no jogo. Calcular FPS médio, frametime, 1% low e 0.1% low.
  - **Comunicação:** WebSocket em `localhost`, com taxa configurável (padrão de 500 ms).
  - Precisa rodar como **administrador**, porque tanto os sensores quanto o PresentMon exigem isso. Tratar isso no manifest e no autostart (Task Scheduler com "run with highest privileges" em vez da pasta Startup).
- **Frontend:** Angular, que é a stack que eu já uso.
- **Janela:** host com **WebView2**, sem bordas, posicionado no monitor escolhido. Deve lembrar posição, monitor e tamanho, e ter a opção "sempre no topo" (off por padrão).
- **Fallback de sensores:** se algum sensor não existir no LibreHardwareMonitor (ex.: GPU Memory Junction), mostrar "não disponível" na configuração. Opcionalmente, ler da shared memory do HWiNFO64 se ele estiver aberto.

## 1. Tela de configuração

- Lista de todas as métricas disponíveis, agrupadas por **GPU / CPU / RAM / FPS / Outros**, cada uma com:
  - toggle para exibir ou esconder;
  - **label editável** (ex.: trocar "GPU" por "3080", "CPU" por "12600K");
  - ordem via drag and drop;
  - unidade (°C/°F onde fizer sentido);
  - **limites de alerta** (amarelo e vermelho) configuráveis.
- **Geral:**
  - tema do app e tema do widget (podem ser independentes);
  - monitor do widget;
  - taxa de atualização;
  - iniciar com o Windows;
  - abrir o widget automaticamente ao detectar um jogo.
- **Log:**
  - liga/desliga, pasta de destino e intervalo;
  - o log grava **todas as métricas habilitadas**, mesmo que não estejam visíveis no widget;
  - usar flush frequente, para que os últimos segundos não se percam num desligamento abrupto.
- **Jogos:**
  - detecção automática do processo em foco que esteja em tela cheia ou borderless;
  - lista manual de executáveis para incluir ou ignorar (ex.: ignorar navegador, Discord e o próprio app).
- Botão **"Restaurar padrão"**.

## 2. Modo widget

- **FPS do jogo em destaque:** centralizado e bem maior que o resto. Logo abaixo, em tamanho menor: 1% low e frametime.
- As outras métricas ficam **ao redor** do FPS, agrupadas visualmente por componente (bloco GPU, bloco CPU, bloco RAM).
- **Sem jogo detectado:** o bloco central mostra um estado ocioso elegante (ex.: "—" ou relógio) e as métricas continuam atualizando.
- Cores de alerta aplicadas conforme os limites configurados, com transição suave, sem piscar agressivamente.
- **Mini-gráfico (sparkline)** dos últimos ~60 s nas métricas de temperatura, opcional por métrica.
- Layout responsivo: precisa funcionar em monitor horizontal e vertical e em tamanhos variados.

## 3. Métricas padrão (ativas de fábrica)

| Grupo | Métrica | Alerta padrão (amarelo / vermelho) |
|---|---|---|
| FPS | FPS atual, 1% low, frametime (ms) | — |
| GPU | Uso (%) | — |
| GPU | Temperatura do núcleo | 80 / 87 °C |
| GPU | Hot Spot | 95 / 105 °C |
| GPU | Memory Junction (VRAM) | 95 / 104 °C |
| GPU | Diferença Hot Spot − núcleo (métrica derivada) | 20 / 25 °C |
| CPU | Uso total (%) | — |
| CPU | Temperatura do pacote (Package) | 85 / 95 °C |
| RAM | Uso (GB usados / total e %) | 85 / 95 % |

A diferença entre Hot Spot e núcleo serve para detectar pasta térmica ruim.

## 4. Métricas opcionais (desativadas de fábrica)

- **FPS:** 0.1% low, FPS médio da sessão, gráfico de frametime.
- **GPU:** clock do núcleo e da memória (MHz); consumo (W) e % do power limit; uso e ocupação da VRAM (GB); velocidade das fans (% e RPM); voltagem do núcleo; motivo de limitação do clock, se disponível (térmico, energia etc.).
- **CPU:** uso e temperatura **por núcleo**, habilitáveis individualmente (ex.: só o core 1); clock por núcleo e médio; consumo do pacote (W).
- **Outros:** RAM virtual/commit, uso e temperatura de discos, rede (up/down), temperaturas da placa-mãe e fans do gabinete.

## 5. Temas (para o app e para o widget)

1. **Mínimo:** tipografia limpa, monocromático, muito espaço em branco e zero ornamento.
2. **Neon:** futurista, com fundo escuro, brilhos neon, linhas finas e um leve efeito de HUD.
3. **Terminal:** estilo tech/dev, com fonte monoespaçada, grid, cara de painel de telemetria e cores de status em estilo terminal.
4. **Lumen:** estilo "Apple". FPS gigante centralizado, em fonte arredondada de peso leve; o resto orbitando em cards com cantos bem arredondados, efeito de vidro fosco (blur) e sombras suaves; animações com mola. **Não usar nenhum nome, logo ou marca da Apple.**

Todos os temas devem ter variante clara e escura, onde fizer sentido. A cor de destaque deve ser personalizável.

## Fluxo de trabalho

1. **Primeiro design, depois código.** Criar no **Claude Design** as telas de configuração e o widget nos 4 temas, com mockups de widget horizontal e vertical. Espere aprovação antes de codar.
2. **MVP:** backend lendo os sensores padrão e o FPS; WebSocket; widget no tema Lumen; log em CSV.
3. **Depois:** tela de configuração completa; métricas opcionais; os outros temas; autostart e bandeja do sistema.
4. **Testar com sensores reais.** Não inventar nomes de sensores: listar os que o LibreHardwareMonitor realmente expõe no hardware antes de mapear.

## Requisitos adicionais (do chat)

- Opção de iniciar com o Windows.
- Poder **fixar o widget na tela onde quiser** (travar posição), sem ficar por cima de apps em fullscreen.

## Hardware de referência

- GPU: RTX 3080
- CPU: i5-12600K
- 3 monitores
- Windows 11 Pro (build 26200)
