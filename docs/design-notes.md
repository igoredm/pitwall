# Pitwall — notas do design (Claude Design)

Canvas: https://claude.ai/artifact/UvFyxVKeGUoZ2n17wzmWkH

Widget: 1280×400 horizontal, 400×1100 vertical. Settings: 1200×800.

## Alertas (todos os temas)
Valor muda para amarelo/vermelho com transição de cor de 600 ms, nunca pisca. Sparklines/barras usam cor de alerta, senão accent. Lumen tinge o tile; Mínimo/Neon/Terminal adicionam tag de texto.

## Lumen
- Fonte Nunito. FPS peso 200, 172px (h) / 150px (v), letter-spacing −0.045em. Valores 300, 28–30px. Labels 13px/600. Tipo de grupo 12px/700 uppercase, tracking 0.14em.
- Dark: bg #0A0D13, text #F4F6FA, text2 rgba(228,233,242,.66), text3 .44; card rgba(255,255,255,.07) borda 1px rgba(255,255,255,.12); shadow `0 18px 44px rgba(0,0,0,.38)` + inset 1px top rgba(255,255,255,.08); tile rgba(255,255,255,.05); accent #4C8DFF, yellow #FFC53D, red #FF6166, dot jogo #3DDC84; track rgba(255,255,255,.10).
- Light: bg #E8ECF3, text #0F1320, text2 #4F586B, text3 #7C8599; card rgba(255,255,255,.52) borda rgba(255,255,255,.85); shadow `0 14px 36px rgba(24,39,75,.12), 0 1px 2px rgba(24,39,75,.06)`; accent #2F6FEB, yellow #A86400, red #D12A36.
- Radii: card 30, tile 20, pills/barras 999, barra 8px alt. Settings: card 22, input 10, botão 11, nav 12.
- `backdrop-filter: blur(28px) saturate(175%)`. Fundo: 3 círculos (accent, violeta #8B5CF6/#C4A8FF, teal) blur(90px) opacity .2–.55.
- Tint alerta: amarelo rgba(255,197,61,.14), vermelho rgba(255,97,102,.16). Sparkline 1.6px + área 16%. Animações com mola.

## Mínimo
- Manrope. FPS 200, 176/150px. Valores 28/300. Labels 11px uppercase tracking .16em.
- Dark: bg #0F0F10, text #EDEDEE, text2 #9A9A9F, text3 #6A6A70, hairline #26262A, accent #EDEDEE, yellow #E8B931, red #FF5C5C.
- Light: bg #FAFAF9, text #111112, text2 #5E5E63, hairline #E4E4E2, accent #111112, yellow #9A6700, red #C62828.
- Sem cards, radius 0, sem sombra, divisores 1px. Barras 2px, sparkline 1.2px. Tag "atenção"/"crítico".

## Neon (só escuro)
- Orbitron (números, FPS 600 ~114px), Rajdhani (labels 13/600 uppercase .22em).
- bg #04050B, text #E4FBFF, text2 #7FB3C4, text3 #4C7888, accent #00E5FF, yellow #FFD84D, red #FF3B6B.
- Grid 1px rgba(0,229,255,.045) a cada 32px + linha brilhante no topo.
- Cards rgba(8,20,32,.55), borda accent 16%, inset glow 0 0 32px accent 16%, radius 0, cantos 2px/12px accent.
- FPS dentro de anel HUD (1px accent 45%, anel interno tracejado, 4 ticks). Glow text-shadow 0 0 18px / 0 0 48px accent 45%.
- Tiles com borda esquerda 2px + fade. Alerta: glow 0 0 14px + tag ALERTA/CRÍTICO. Barras 4px com glow.

## Terminal (só escuro)
- JetBrains Mono. FPS 112/500 em accent.
- bg #0B0D0E, panel #0E1211, header #121816, linhas #253029, text #CFE3D6, text2 #7D958A, text3 #4F6258, accent/OK #4AF626, info #56D6E0, yellow #F4D35E, red #FF5F56.
- Grid 1px rgba(120,170,140,.06) a cada 24px. Painéis radius 0, header "■ GPU :: 3080" com "uso 97%" à direita.
- labels snake_case, tags `[ OK ]` `[WARN]` `[CRIT]`, barras ASCII █░, sparklines em degrau, separadores tracejados.
- Status bar: "pitwall@localhost:~$ watch …", status WS, nº alertas, hora.

## Layout
- Horizontal (largura > altura): linha, padding 24–26, gap 22. GPU à esquerda flex 1.35 (header, barra de uso, grid 2×2 núcleo/hot spot/junction/Δ). FPS centro ~330–370px fixo. Coluna direita flex 1: CPU (estica; barra + tile package com sparkline) e RAM abaixo.
- Vertical: coluna, padding 20, gap 18. GPU topo ~350–372px; FPS ocupa o resto; CPU e RAM embaixo. Fontes ~15% menores.
- Números tabulares. Só temperaturas têm sparkline. Δ sem sparkline (placeholder p/ alinhar). Ocioso: mesmo layout, centro vira relógio + data + "Nenhum jogo detectado".

## Splash (claro e escuro)
- Baloo 2 800 (números/FPS/títulos): FPS 190 (h) / 170 (v), line-height .82; valores 32; uso no header 34; label componente 26. Nunito 800–900 labels 13px; pill de tipo 12/900 uppercase .12em.
- Dark: bg #140A26, text #FFF7FB, text2 rgba(255,240,250,.72), text3 .52. Light: bg #FFF4E6, text #150A28, text2 #4A3A63, text3 #6E5F86.
- Paleta: magenta #FF2E88, laranja #FF7A1A, amarelo #FFD23F, ciano #00D4FF, lima #9BE22E, violeta #7B5CFF, teal #00C9A7. Accent padrão #FF2E88.
- Blocos (gradiente 135°): GPU #E0206F→#F2580F (texto branco); CPU #0077C8→#5B3FF0 (branco); RAM #A8EB3A→#2BD3A6 (texto #0E2418).
- Blobs SVG irregulares (10 pontos) com gradiente + 9 gotas cada; central atrás do FPS (dark violeta→magenta, light amarelo→laranja); opacidade .55 dark / .95 light.
- Cards radius 32, tiles 22, pills/barras 999. Dark: glow `0 18px 44px <cor bloco ~40%>` + inset top rgba(255,255,255,.25). Light: "sticker" borda 3px #150A28 + sombra dura `6px 6px 0 #150A28`.
- Tiles rgba(20,6,40,.22) (GPU/CPU), rgba(14,36,24,.10) (RAM). Barras 10px, track rgba(20,6,40,.30), fill branco (tinta no RAM). Sparkline 2.2px cor do texto + área 16%.
- FPS dark: texto gradiente #FFE45C→#FF8A1A→accent; light: #150A28 sólido. Pills "1% low"/"frametime" (dark: branca c/ tinta; light: tinta c/ branco). Chip "● FC25.exe" com ponto lima.
- Alerta amarelo: tile sólido #FFD400, contorno interno 3px #1A1200, texto escuro, badge tinta "▲ ALERTA". Vermelho: tile #12051F, contorno interno 3px #FF2D3D + anel 3px rgba(255,45,61,.30), valor #FF6B76, badge vermelho "! CRÍTICO". Transição 500 ms.
- Settings Splash dark: cards #1F1238 borda 2px rgba(255,255,255,.08) radius 26; seleção/nav ativo gradiente magenta→laranja; títulos Baloo 2 34px; blobs .55 atrás.
- Layout igual ao Lumen (GPU vertical 380px). Ocioso: relógio gradiente ~142px.

## v0.7

Frames no mesmo canvas (linhas a partir de y=10740) e cópias em `docs/design/v07/`. Lumen escuro é a referência; os tokens abaixo são os do Lumen escuro, salvo indicação. Settings continua 1200×800 (Jogos · Sessões rola: 1200×1180). Nav das configurações: Métricas, Geral, GPU, Jogos, Log, **Celular** (nova; EN "Phone").

### Visibilidade por layout

| Peça | Completo | Médio (~300 px) | Compacto (260×180) | Celular |
|---|---|---|---|---|
| Pico da sessão | sim, em todo tile | só chips de temp/power/clock, `▴101` | **não** | sim, nos 4 tiles da GPU |
| Chip de limite de clock | sim, ao lado do nome da GPU | sim, pílula 18 px | **não** | sim |
| "Picos desde … · Zerar" | no hover do widget, fundo da coluna FPS | não (só pela bandeja) | não | não (só leitura) |

O compacto fica como está: sem enfeite. Zerar picos fica sempre disponível no menu da bandeja.

### 1. Pico da sessão
- Completo: na linha do label do tile, à direita: `máx 101` (EN `max 101`), 12px/600, text3 (rgba(228,233,242,.44)), números tabulares. Assume a cor do nível (amarelo #FFC53D / vermelho #FF6166) só se o próprio pico passou daquele limite. A cor muda com transição de 600 ms, nunca pisca.
- Médio: dentro do chip, depois do valor: `▴101`, 11px/600, text3, com a mesma regra de cor.
- Tem pico: temperaturas, power, clock, fan (tiles). Não tem: valores de cabeçalho (uso %), RAM, FPS. Mínimo/máximo de FPS ficam no resumo pós-jogo.
- Valor do pico = o máximo desde que a sessão começou (ou desde o último zerar). A sessão começa quando o jogo é detectado. No ocioso não há pico (o tile esconde o `máx`).
- Zerar: (a) automático a cada nova sessão de jogo; (b) menu da bandeja "Zerar picos da sessão" (EN "Reset session peaks"); (c) com o widget destravado, o hover mostra a pílula `Picos desde 21:02 · [↺ Zerar]` (EN `Peaks since 9:02 PM · Reset`), altura 30, raio 999, fundo rgba(255,255,255,.08), botão interno com accent a 16% e texto em accent. Depois de zerar: `✓ Picos zerados` (EN `Peaks reset`) por 2 s, e cada pico passa a ser igual ao valor atual.
- Por tema: Mínimo usa o mesmo texto, 11px uppercase com tracking .16em; Neon usa `MÁX` em Rajdhani 12/700 .18em com o número em Orbitron; Terminal usa `max=101` em text3; Splash usa `máx 101` em Nunito 12/900 na cor do texto do bloco (opacidade .72).

### 2. Limite de clock ("por que o clock caiu")
- Motivos e copy da pílula: térmico `Limite: térmico` / `Limit: thermal`; power `Limite: power` / `Limit: power`; voltagem `Limite: voltagem` / `Limit: voltage`; ocioso `Ocioso` / `Idle`; sincronia `Limite: sincronia` / `Limit: sync`. Médio e celular usam só a palavra (`power`). No Terminal: `lim=thermal|power|voltage|idle|sync`.
- Cores no Lumen escuro: térmico amarelo (fundo rgba(255,197,61,.16), texto #FFC53D); power e voltagem accent (fundo a 16%); ocioso e sincronia neutros (fundo rgba(255,255,255,.07), texto text2). O vermelho não é usado: um limite não é um alarme.
- Pílula: altura 22 px (18 no médio), padding 0 9 px, 12px/700, ícone de seta para baixo de 12 px. Sem limite = sem pílula; nunca mostrar "sem limite" no widget.
- Anti-tremido: só mostra um motivo depois de 2 s contínuos e o segura por pelo menos 3 s. Com vários motivos ao mesmo tempo, vale a prioridade térmico > power > voltagem > sincronia > ocioso.
- Settings → GPU → card "Agora": nova linha **Por que o clock caiu** (EN "Why the clock dropped"), com a dica "O que a GPU diz que está segurando o clock agora, e quanto tempo de cada motivo nesta sessão." Mostra a pílula atual, "há 2 min · 318 de 320 W", uma barra empilhada de 10 px com o % da sessão por motivo (power accent, térmico amarelo, voltagem #8FB5FF, sincronia text3, sem limite rgba(255,255,255,.12)) e uma legenda.
- Estados: carregando `Carregando motivos…`; sem suporte `Motivo indisponível`, com a dica "O driver não informou o motivo (precisa de NVIDIA com NVAPI)." (EN "Reason unavailable"); a barra fica vazia até haver 10 s de jogo.

### 3. Resumo pós-jogo (Jogos → card "Última sessão")
- Título "Última sessão" (EN "Last session"), com `exe · hoje, 21:02 → 21:47` e um botão com o nome do CSV em mono (abre o arquivo).
- Grade 4×2 de stats (raio 14, fundo rgba(255,255,255,.05), valor 24/300): duração, FPS médio, 1% low, 0.1% low; pico GPU, pico hot spot, pico Δ, tempo no amarelo / vermelho. O tempo no amarelo/vermelho vem em texto colorido mais uma barra de 6 px proporcional à duração. Cada stat de pico recebe o tint do nível que alcançou.
- EN: duration, avg FPS, 1% low, 0.1% low, peak GPU, peak hot spot, peak Δ, time in yellow / red.
- Sessões anteriores: tabela compacta (duração, FPS médio, pico hot). A sessão que terminou em queda recebe o badge vermelho `PC desligou` (EN `PC shut down`).
- Estados: vazio "Nenhuma sessão ainda. Abra um jogo e o resumo aparece aqui quando ele fechar." (EN "No sessions yet. Open a game and the summary shows up here when it closes."); em andamento "Em andamento · 12 min", com os picos até agora, e FPS médio/lows só no fim; sem PresentMon, os campos de FPS mostram "—" com "FPS indisponível"; CSV apagado, o link vira texto com "Arquivo não encontrado" (EN "File not found").

### 4. "O PC caiu"
- Gatilho: o boot seguinte encontra uma sessão sem fim limpo. Só dados, nenhum texto de diagnóstico.
- Balão da bandeja no login: título "O PC desligou durante FC25.exe", corpo "Ontem, 22:41. Os últimos 60 s foram salvos. Clique para ver." (EN "Your PC shut down during FC25.exe" / "Yesterday, 10:41 PM. The last 60 s were saved. Click to view."). O clique abre Jogos ancorado no relatório.
- Banner em Jogos (no topo, raio 18, fundo rgba(255,97,102,.12), borda rgba(255,97,102,.35)): "O PC desligou durante FC25.exe" / "Ontem, 22:41 · os 60 s antes da queda estão abaixo." + [Ver relatório] [Dispensar]. A nav mostra um ponto vermelho de 8 px em "Jogos" até o banner ser dispensado.
- Card do relatório: "Últimos 60 s antes da queda" (EN "Last 60 s before the shutdown"). Uma linha por série (GPU temp, hot spot, power, clock, FPS): grid 120 px | sparkline (altura 36, traço 1.6, área 16%) | 150 px com "mín · máx / último" (EN "min · max / last"). Linha tracejada na última leitura e eixo "−60 s · −30 s · última leitura". Nome do arquivo `crash_AAAA-MM-DD_HH-MM-SS.csv` em mono + [Abrir pasta] (EN "Open folder"). O hot spot sai em vermelho porque ficou acima do vermelho; o resto segue a regra normal de alerta.

### 5. Primeira execução (assistente)
- Janela de 880×600 no Lumen escuro, com 4 passos e indicador de pontos (o ativo tem 22×6, os outros 6×6) mais "1 de 4" (EN "1 of 4").
- (1) "Onde o widget vai ficar?" (EN "Where should the widget go?"): cards de monitor proporcionais à resolução, o selecionado com borda accent de 2 px e fundo a 14%, [Identificar monitores], e Idioma (Automático / Português / English).
- (2) "Como ele vai parecer?": 5 cards de tema com mini prévia, Variante (Claro / Escuro; Neon e Terminal ficam sem "Claro") e Layout (Automático / Completo / Médio / Compacto).
- (3) "Verificando o PC": linhas de check para PawnIO, PresentMon, Administrador e GPU NVIDIA. Estados: verificando (spinner, "Verificando…"), ok (verde), aviso (fundo amarelo a 10%, com ação como [Reiniciar como admin]) e falha (ação [Instalar]). Copy: "O widget funciona sem tudo verde; só mostra menos coisa." (EN "The widget works without everything green; it just shows less.")
- (4) "Tudo pronto" (EN "All set"): switch Iniciar com o Windows (ligado) e um resumo de 4 itens. O botão final é "Começar" (EN "Get started").
- Rodapé: [Voltar] (some no passo 1), "Pular configuração" (EN "Skip setup") e [Próximo] / [Começar].

### 6. Alerta vermelho
- Toast do Windows, só texto, sem botões: título "Hot spot da GPU em 101 °C", corpo "Acima do vermelho (95 °C) há 10 s · FC25.exe" (EN "GPU hot spot at 101 °C" / "Above red (95 °C) for 10 s · FC25.exe").
- Settings → Geral → card "Alertas" (EN "Alerts"). A dica do card é "O widget sempre muda de cor. Aqui você escolhe se o Windows também avisa." Controles:
  - "Aviso do Windows no vermelho" (EN "Windows notification on red"): switch, **desligado por padrão**;
  - "Som" (EN "Sound"): switch, desligado;
  - "Intervalo mínimo" (EN "Minimum interval"): 1 / 5 / 15 / 30 min, padrão 5, contado por métrica;
  - "Esperar antes de avisar" (EN "Wait before notifying"): na hora / 10 s / 30 s, padrão 10 s;
  - botão [Testar aviso] (EN "Send test").
- Com o aviso desligado, os demais controles ficam esmaecidos (opacidade .45).

### 7. Ver pelo celular
- Página: 390×844 e 360×800, com o tema e a variante do widget. Do topo para baixo: nome do PC + "ao vivo" com ponto verde; jogo + duração; FPS 120/200 (Lumen) com pílulas 1% low / frametime; card da GPU (uso, chip de limite, 4 tiles com pico); CPU | RAM em 2 colunas; pílulas de bateria (bateria baixa em vermelho); e o rodapé "Só leitura · rede local · atualiza a cada 1 s".
- Estados da página: reconectando (banner no topo "Sem conexão com o PC. Tentando de novo…", conteúdo em opacidade .6 e FPS com "último valor 21:46:58"); ocioso (relógio no lugar do FPS, como no widget); código expirado ou revogado ("Este celular não tem mais acesso. Pareie de novo nas configurações do PC.").
- Settings → Celular: "Ver pelo celular" (EN "View on phone"), com a dica "Só leitura: nada muda no PC pelo celular."
  - Switch "Ativar acesso pelo celular", desligado por padrão. Desligar revoga o acesso de todos na hora.
  - Aviso amarelo: "**Só para a rede local.** O celular precisa estar no mesmo Wi-Fi do PC. Não abra esta porta no roteador nem use em Wi-Fi público." (EN "**Local network only.** Your phone must be on the same Wi-Fi as the PC. Don't forward this port on your router or use it on public Wi-Fi.")
  - Parear: QR de 176 px num quadro branco, o endereço `IP:porta` em mono e um código de 6 dígitos (26px mono) com a dica "Vale por 2:00 · Gerar outro".
  - "Dispositivos pareados" (EN "Paired devices"): uma linha por aparelho com ponto verde se estiver vendo agora, "Visto há 3 dias · pareado em 02/11", botão [Revogar] e "Revogar todos" em vermelho (EN "Revoke", "Revoke all").
  - Vazio: "Nenhum celular pareado ainda." Erro: "Não deu para abrir a porta 5317…". Com o switch desligado, o QR e a lista ficam ocultos.

### 8. Atualização
- Bandeja: ponto accent de 8 px no ícone e primeiro item do menu "Atualização disponível · 0.7.1" (EN "Update available · 0.7.1").
- Settings: um card no rodapé da nav, "Atualização 0.7.1 · Clique para ver". Em Geral → card "Atualizações": a faixa "Pitwall 0.7.1 disponível · Você usa a 0.7.0 · 14 MB" com [Notas da versão] [Depois] [Atualizar agora]; Canal: Estável / Beta (EN "Stable / Beta"), com a dica "Beta recebe novidades antes e pode ter erros."; e o switch "Procurar sozinho", com "Uma vez por dia. Nunca instala sem você pedir."
- O painel avulso (420 px, raio 22) usa a mesma copy e mostra a nota "O Pitwall reinicia sozinho. O widget some por ~5 s."
- Estados: baixando ("Baixando… 62%" com barra de 6 px); erro ("Falha ao baixar" + "Tentar de novo"); atualizado ("Você está na versão mais recente · verificado há 2 h" + [Procurar agora]); procurando ("Procurando…"); sem rede ("Não deu para verificar. Sem internet?").
- "Depois" esconde o aviso por 24 h ou até sair uma versão nova.

### 9. "Marcar como jogo?"
- Gatilho: um processo fora das regras, em janela (não em tela cheia), desenhando quadros por 60 s contínuos. Pergunta uma vez por executável.
- Toast com 2 botões: "Marcar eldenring.exe como jogo?" / "Está desenhando quadros numa janela há 1 min (60 FPS)." [Marcar como jogo] [Ignorar este app] (EN "Mark eldenring.exe as a game?" / "It has been drawing frames in a window for 1 min (60 FPS)." [Mark as game] [Ignore this app]).
- O mesmo aparece na caixa "Em foco agora" de Jogos (fundo accent a 10%, ponto amarelo e "não é um jogo conhecido"). "Marcar" cria a regra Incluir; "Ignorar" cria a regra Ignorar.

### 10. Perfis por jogo (Jogos → "Perfis por jogo")
- Tabela com as colunas Executável (mono) | Ajuste da GPU (250 px) | Layout do widget (170 px) | remover (44 px). As linhas têm 54 px e o botão é [Novo perfil].
- Opções da GPU: Padrão (mostra o preset global) / Equilibrado · W · MHz / Frio · W · MHz / Personalizado… / Desligado neste jogo. Opções do layout: Padrão / Completo / Médio / Compacto.
- "Padrão" aparece em text2 e peso 500; um override aparece em text/600. O perfil ativo agora recebe a dica "ativo agora". EN: "Per-game profiles", "GPU tuning", "Widget layout", "Default", "Off in this game", "New profile", "active now".

## v1.0

Os frames estão no mesmo canvas, nas linhas a partir de y=17500 (três títulos: Configurações, Assistente e tour, Parear por código). As cópias ficam em `docs/design/v10/` (33 arquivos `.dc.html`). Neles, o logo vem de `/_blob/…`, um upload no canvas; no app, use `assets/logo/pitwall-256.png`. A crítica que motivou as mudanças está em `docs/design/v10/CRITIQUE.md`.

### Decisão: um visual só para o app
- As configurações, o assistente, o tour e a página de parear do celular e da TV têm **um visual só**, com claro e escuro. Os 5 temas (Lumen, Mínimo, Neon, Terminal, Splash) passam a valer **só para o widget** (e para a página do celular depois de pareado, que espelha o widget).
- Por quê: 5 temas de app eram 5 meio-sistemas ("cara de IA", Mínimo "quadradão"). Um visual bem acabado dá para manter, e o widget continua sendo a parte expressiva.
- Fica em App e atualizações › "Aparência das configurações": Sistema (padrão) / Claro / Escuro. `config.appTheme` deixa de ser usado no app (manter no config para não quebrar; ignorar).
- O seletor "Tema do widget" mostra **miniaturas reais do widget** em cada tema (150×94, horizontal, com os tokens do widget), seleção com anel accent de 2 px, e "só escuro" sob Neon e Terminal.
- Sem gradiente decorativo, brilho, blob, `backdrop-filter` ou blur em lugar nenhum do app. As únicas cores fortes na tela são o logo e as miniaturas do widget.
- Marca: `assets/logo/pitwall-256.png` (tile escuro, arco azul→violeta, ponteiro branco, quadriculado). Tamanhos: 30 px na sidebar (raio 7), 26 px no assistente, 40 px em Sobre (raio 9), 48 px no convite do tour (raio 11), 32 px no celular, 72 px na TV (raio 16). O SVG antigo do `settings.html` sai.

### Tokens do app (substituem o uso dos tokens de tema nas configurações)
Fonte: **Manrope** (já empacotada) 400/500/600/700/800 para tudo, com `font-variant-numeric: tabular-nums` na raiz. JetBrains Mono só para dados: executável, caminho, nome de arquivo e endereço IP. As outras fontes continuam só no widget.

| token | escuro | claro | uso |
|---|---|---|---|
| `--bg` | #0E1014 | #F3F4F6 | área de conteúdo |
| `--side` | #0A0C0F | #EAECEF | sidebar (segunda camada neutra) |
| `--sf` | #15181D | #FFFFFF | containers de seção |
| `--sf2` | #0F1216 | #F0F2F5 | fundo do segmentado, input, tile de stat |
| `--raise` | #1D2128 | #FFFFFF | item ativo da nav |
| `--segon` | #2A2F38 | #FFFFFF | opção ativa do segmentado |
| `--hair` | #23272E | #E3E6EA | divisores, borda de container |
| `--bd` | #30353F | #D2D7DE | borda de controle, trilho do switch desligado |
| `--tx` / `--tx2` / `--tx3` | #ECEEF2 / #A3AAB6 / #848C99 | #12151B / #4D5562 / #5F6876 | texto (tx3 ≥ 4.5:1 nos dois) |
| `--ac` / `--act` / `--acs` | #4C8DFF / #82AEFF / rgba(76,141,255,.14) | #2F6FEB / #2257C4 / rgba(47,111,235,.10) | ação e seleção / texto de link / fundo de seleção |
| `--y` / `--ys` | #F2B33D / rgba(242,179,61,.12) | #8A5800 / rgba(242,179,61,.18) | atenção |
| `--r` / `--rs` | #FF6B70 / rgba(255,97,102,.12) | #C42833 / rgba(209,42,54,.08) | erro, crítico, queda |
| `--g` / `--gs` | #3DDC84 / rgba(61,220,132,.12) | #1C8048 / rgba(30,142,79,.10) | ao vivo, ok |
| `--dim` | rgba(4,6,9,.70) | rgba(18,21,27,.52) | fundo do tour e de diálogos |
| `--pop` + `--popsh` | #1A1E24 + `0 12px 32px rgba(0,0,0,.5), 0 0 0 1px #30353F` | #FFF + `0 12px 32px rgba(18,21,27,.16), 0 0 0 1px #D2D7DE` | popover, balão do tour, diálogo |
| sombra de container | nenhuma | `0 1px 2px rgba(18,21,27,.07)` | |

A cor de destaque escolhida pelo usuário (`config.accent`) vale **só para o widget**. O app usa sempre `--ac`, porque a cor da marca não pode virar amarelo.

Raios: container 10, controle e botão 8, opção do segmentado 6, popover e balão 12, diálogo 14, pílula 999. Não existe raio 0 nem 30 no app.

### Espaço e tipo
- Base de 4 px. Escala: 4, 6, 8, 12, 16, 20, 24, 28, 40.
- Janela: mínimo 960×640, padrão 1200×800. Sidebar de 232 px (200 px abaixo de 1040 de largura). Conteúdo com padding 28/40/40 e **uma coluna de no máximo 840 px**. Métricas e tabelas largas usam a largura toda.
- Página: h1 22/800, tracking −.02em; descrição 13.5/400 tx2, até 64ch; "Salvo" com check à direita (12.5 tx3). Sem rótulo acima do título.
- Seção: 28 px acima, h2 14/700, dica opcional 12.5 tx2, 8 px até o container. **Um container por seção.** Nada de card dentro de card nem de duas colunas de cards.
- Linha: padding 12/16, altura mínima de ~56 px, divisor `--hair`. Rótulo 14/600, dica 12.5/1.45 tx2 e controle à direita, alinhado ao centro (ao topo quando a dica tem 2 linhas ou mais).
- Grupos da nav: 11.5/700 tx3, sem caixa alta. Item da nav: altura 34, 13.5/600, ícone de traço 17 px. Ativo: `--raise`, ícone accent.
- Controles: switch 36×20; segmentado com altura 26 dentro de um trilho de 2 px; botão 32 (sm 28); input 32. Pílulas 11.5/700. Foco do teclado: borda `--ac` + `0 0 0 3px var(--acs)` em tudo.
- Ícones: um conjunto de traço só, autoral (viewBox 24, traço 1.7, pontas redondas). Nunca emoji nem glifo unicode como ícone.

### IA (nav)
| Grupo | Página | Conteúdo |
|---|---|---|
| — | **Visão geral** | miniatura do widget + estado e ações; "Agora" (jogo, GPU, alertas, celular/TV, CSV, bateria; cada linha leva à página dela); banner de queda; "Primeiros passos" (tour) até concluir |
| Widget | **Aparência e posição** | Tema do widget (prévias), variante, cor de destaque; Layout (4 opções, com o atual explicado); Monitor; Janela (mostrar, travar, sempre por cima, mostrar ao abrir jogo, mandar para o canto) |
| | **Métricas** | abas GPU · CPU · RAM · FPS · Outros · **Bateria**; legenda de prioridade; tabela (alça, exibir, nome, sensor, unidade, amarelo, vermelho, gráfico, aparece em); nome do grupo no widget |
| | **Alertas** | aviso do Windows (switch, som, esperar, intervalo, testar); prévia do aviso; "Métricas que avisam" (tudo com limite vermelho → Editar leva à linha em Métricas) |
| Jogo | **Jogos** | Detecção + sugestão "marcar como jogo" em linha; Regras (incluir/ignorar, filtro); Perfis por jogo |
| | **Sessões** | banner e relatório de queda; Última sessão (4×2); Histórico (filtro por jogo, "Mostrar mais"); **Gravação em CSV** (gravar, pasta, intervalo, guardar por, limite de tamanho, uso) |
| | **Ajuste da GPU** | ajuste, quando, perfil, limites; Agora (6 valores) + por que o clock caiu |
| Pitwall | **Celular e TV** | ativar; aviso de rede local; parear (endereço + código de 6 dígitos + QR); aparelhos pareados |
| | **Recursos** | 11 switches em 3 grupos, cada um com uma linha de explicação e link para o ajuste |
| | **App e atualizações** | idioma, aparência das configurações, iniciar com o Windows, taxa; atualizações; Ajuda (Rever tutorial, atalhos, relatar problema); Sobre; Restaurar padrão |

EN: Overview · Widget: Appearance & position, Metrics, Alerts · Game: Games, Sessions, GPU tuning · Pitwall: Phone & TV, Features, App & updates.

Onde fica cada coisa: **alertas** em Alertas (os limites ficam em Métricas, com link nos dois sentidos); **bateria** em Métricas › aba Bateria (o switch geral fica em Recursos); **idioma** em App e atualizações; **log/CSV** em Sessões › Gravação em CSV. A página "Log" e a página "Geral" deixam de existir. Deep links: `#/settings/<pagina>[/<ancora>]`, com ids estáveis (`overview, widget, metrics, alerts, games, sessions, gpu, devices, features, app`). O balão de queda abre `sessions/crash`.

**Busca (Ctrl K, ou clique no campo da sidebar):** um índice estático montado do i18n (rótulo, dica, sinônimos), com no máximo 8 resultados agrupados por página, trecho com o termo em `--act` 700, setas e Enter. Ao abrir um resultado: vai para a página, rola até a linha e a destaca com uma sobreposição `--acs` que some (opacity) em 240 ms depois de 1,2 s. Sem animação ao abrir ou fechar o popover (ação de teclado).

### Recursos (switch → config → link)
| Recurso | Linha (PT) | config | link |
|---|---|---|---|
| Detecção de jogo | Reconhece quando um jogo abre e começa a sessão, os picos e o CSV. | `games.autoDetect` | Jogos |
| Sugestão "marcar como jogo" | Pergunta quando um app em janela desenha quadros por 1 min. | **novo** `features.gameSuggestion` | Jogos |
| Picos da sessão | Mostra no widget o máximo de cada sensor desde o início do jogo. | **novo** `features.sessionPeaks` | Métricas |
| Motivo do clock | Mostra no widget o que segura o clock: térmico, power, voltagem. | **novo** `features.clockReason` | Ajuste da GPU |
| Relatório de queda | Guarda os últimos 60 s e mostra o relatório se o PC desligar no meio do jogo. | **novo** `features.crashReport` | Sessões |
| Log CSV | Grava todos os sensores durante o jogo, um arquivo por sessão. | `log.enabled` | Sessões › Gravação |
| Ajuste da GPU | Limita consumo e clock só enquanto o jogo roda. Desfaz sozinho. | `gpuTuning.enabled` | Ajuste da GPU |
| Bateria sem fio | Mostra a bateria de mouse, fone e controle perto do FPS. | `battery.enabled` | Métricas › Bateria |
| Alertas do Windows | Avisa pelo Windows quando uma métrica fica no vermelho. | `alerts.enabled` | Alertas |
| Celular e TV | Mostra o widget num celular ou TV da mesma rede Wi-Fi. | `remote.enabled` | Celular e TV |
| Atualização automática | Procura versão nova uma vez por dia. Nunca instala sem você pedir. | `update.autoCheck` | Atualizações |

Estados da linha: dependência ("Sugestão" fica esmaecida, com "Precisa da Detecção de jogo", quando a detecção está desligada); falta de suporte (pílula amarela "leitor não encontrado" / "precisa de NVIDIA", switch desabilitado e link para o motivo). Desligar um recurso esconde a seção correspondente na página de detalhe e mostra no lugar uma linha "Desligado em Recursos · Ligar".

### Sessões · Gravação em CSV (retenção)
- "Guardar por": segmentado **1 dia / 5 dias / 15 dias / 30 dias / 90 dias / Para sempre** → `log.keepDays` = 1/5/15/30/90/0. Padrão 30. EN "Keep for": 1 day / 5 days / 15 days / 30 days / 90 days / Forever.
- "Limitar o tamanho total": switch + seletor 500 MB / 1 GB / 2 GB / 5 GB / 10 GB → `log.maxTotalMb` (desligado = 0).
- Linha de uso: "1,4 GB de 2 GB · 212 arquivos · o mais antigo é de 19/10", com barra de 8 px.
- Ao **diminuir** o prazo ou o teto, aparece uma nota amarela na hora: "Com 5 dias, a próxima limpeza (hoje, ao fechar o jogo) apaga 168 arquivos · 1,1 GB." + [Voltar para 30 dias]. Nada é apagado na hora; a limpeza continua no ciclo normal. A barra mostra em hachura o que vai sair.
- O histórico de sessões segue a mesma retenção ("Guardado por 30 dias, como a gravação em CSV.").

### Parear por código (celular e TV)
- PC: endereço `IP:porta` em mono 20 px com [Copiar]; código de **6 dígitos** em caixas de 42×54 (grupos de 3+3), "vale por 1:52" com barra e [Gerar outro]; QR de 132 px num quadro branco ao lado ("Ou aponte a câmera do celular"). Aparelhos com ícone de celular ou TV e a pílula "vendo agora".
- Celular (`http://<ip>:48124/`, sem token salvo): "Digite o código" / "Ele aparece no PC em Configurações › Celular e TV."; 6 caixas de 46×58, `inputmode="numeric"`, `autocomplete="one-time-code"`, colar distribui os dígitos, o 6º dígito envia sozinho. [Conectar] fica desabilitado até 6 dígitos. O conteúdo fica no terço de cima porque o teclado numérico ocupa o resto.
- Estados: Conferindo com o PC… / **Código não confere.** Confira no PC e tente de novo. Mais N tentativas antes de bloquear por 5 min. / **Esse código expirou.** Gere outro no PC. / **Muitas tentativas.** Tente de novo em 4:59. / **Pareado**: "No PC, este aparelho aparece como iPhone · Safari. Abrindo o widget…" e um esqueleto estático. EN: "Enter the code" / "It's shown on the PC in Settings › Phone & TV." / "Code doesn't match. Check the PC and try again." / "This code expired. Make a new one on the PC." / "Too many tries. Try again in 4:59." / "Paired".
- TV 1920×1080: margem segura de 96/128 px; título 84/800; texto ≥ 26 px; caixas de 112×144 com dígito de 84 px; teclado na tela 3×4 (1–9, Apagar, 0, Conectar) com teclas de 116 px de altura. Foco: **contorno branco de 6 px com offset de 4 + fundo mais claro**, sempre visível e nunca só pela cor. Setas movem o foco no teclado (começa no "1"), os números do controle digitam direto, OK escolhe, Voltar apaga e, com tudo vazio, sai. Rodapé com a legenda dos botões do controle. Depois do erro, o foco vai para "Apagar".
- A página de parear usa o visual do app (o tema do widget só chega depois do auth). Ela segue `prefers-color-scheme`, com o escuro como padrão.

### Assistente + tour (primeira execução)
- **Assistente** (diálogo de 880×600 sobre as configurações, 3 passos): (1) Onde o widget vai ficar? (monitores + Idioma); (2) Escolha o tema do widget (5 prévias, variante, layout); (3) Verificando o PC (GPU NVIDIA, PresentMon, PawnIO, Administrador + Iniciar com o Windows) → [Concluir]. "Pular configuração" em todos. EN: "Where should the widget go?", "Pick the widget theme", "Checking your PC", "Finish", "Skip setup".
- **Convite** ao concluir: "Tudo pronto. Quer um tour de 2 minutos?" / "All set. Want a 2-minute tour?" [Agora não / Not now] [Começar tour / Start tour]. Abaixo: "Dá para rever quando quiser em App e atualizações › Rever tutorial, ou no menu da bandeja."
- **Tour** = coach marks sobre a UI real, em 8 passos. O alvo fica em destaque (anel accent de 2 px + o resto escurecido com `--dim`), e o balão de 348 px tem título, texto, progresso "3 de 8", [Voltar] [Próximo] e × no canto. Cada passo navega para a página do alvo e rola até ele. Teclado: → / Enter avança, ← volta, Esc fecha.

| # | Página › alvo | PT | EN |
|---|---|---|---|
| 1 | Visão geral › miniatura do widget | **Este é o widget.** Ele fica no monitor 2 e mostra GPU, FPS, CPU e RAM ao vivo. Clique com o botão direito nele para travar, esconder ou abrir estas configurações. | **This is the widget.** It lives on monitor 2 and shows GPU, FPS, CPU and RAM live. Right-click it to lock, hide or open these settings. |
| 2 | Aparência e posição › Layout | **Três tamanhos, um widget.** Completo, Médio ou Compacto. No Automático, o Pitwall escolhe pelo tamanho da janela. Cada jogo pode ter o seu em Jogos › Perfis. | **Three sizes, one widget.** Full, Mid or Compact. On Auto, Pitwall picks by window size. Each game can have its own in Games › Profiles. |
| 3 | Métricas › tabela | **A ordem é a prioridade.** Arraste pela alça para reordenar. O Compacto mostra as 4 primeiras da GPU, o Médio 6, o Completo tudo que couber. Os limites amarelo e vermelho ficam aqui também. | **Order is priority.** Drag the handle to reorder. Compact shows the first 4 GPU metrics, Mid 6, Full everything that fits. Yellow and red limits live here too. |
| 4 | Jogos › Detecção | **Ele percebe quando você joga.** Ao detectar um jogo, começa uma sessão: picos, CSV e, no fim, um resumo em Sessões. Se um jogo não for reconhecido, adicione o .exe em Regras. | **It notices when you play.** When a game is detected, a session starts: peaks, a CSV and, at the end, a summary in Sessions. If a game isn't recognized, add its .exe under Rules. |
| 5 | Ajuste da GPU › switch | **Ajuste seguro da GPU.** Limita o consumo e o clock pela API oficial da NVIDIA. Nada é gravado na placa: tudo volta ao normal quando o jogo ou o Pitwall fecha. | **Safe GPU tuning.** Caps power and clock through NVIDIA's official API. Nothing is written to the card: it all reverts when the game or Pitwall closes. |
| 6 | Celular e TV › Parear | **Veja no celular ou na TV.** No aparelho, abra o endereço e digite o código de 6 dígitos. Só leitura, só na rede local. | **Watch on your phone or TV.** On the device, open the address and type the 6-digit code. Read-only, local network only. |
| 7 | Alertas › Avisar no vermelho | **Avisos no vermelho.** O widget sempre muda de cor. Ligue isto para o Windows também avisar quando uma métrica ficar no vermelho. | **Alerts in the red.** The widget always changes color. Turn this on to also get a Windows notification when a metric stays in the red. |
| 8 | (sem alvo; réplica do menu da bandeja) | **Tudo também pela bandeja.** Clique com o botão direito no ícone do Pitwall perto do relógio: mostrar ou esconder o widget, zerar picos, abrir as configurações e rever este tour. → [Concluir] | **Everything from the tray too.** Right-click the Pitwall icon by the clock: show or hide the widget, reset peaks, open settings and replay this tour. → [Finish] |

- **Rever tutorial** (EN "Replay tutorial"): (1) item fixo no menu da bandeja, logo abaixo de "Configurações…": abre as configurações e começa no passo 1; (2) App e atualizações › Ajuda › [Começar tour]; (3) Visão geral › "Primeiros passos" com o progresso e [Retomar tour] até concluir ou dispensar; (4) logo depois de fechar no meio, um aviso no rodapé por 6 s (pausa com o mouse em cima): "Tour fechado no passo 3 de 8. Volta em App › Rever tutorial e na bandeja." [Retomar] (EN "Tour closed at step 3 of 8. Find it again in App › Replay tutorial or the tray." [Resume]). Também aparece na busca ("tutorial", "tour", "ajuda").
- Estado: `config.tour = { step: 0–8, done: bool, dismissed: bool }`. Retomar volta ao último passo visto; Rever começa do 1.

### Movimento (emil-design-eng + orçamento de jogo)
- Curvas: `--ease-out: cubic-bezier(.23,1,.32,1)`; `--ease-in-out: cubic-bezier(.77,0,.175,1)`. Nunca `ease-in`. Duração máxima de 240 ms. Só `transform` e `opacity`; cor muda sem transição (ou ≤120 ms em hover, só com `@media (hover: hover)`).
- Botão: `:active { transform: scale(.97) }` em 100 ms. Switch: o knob anda por `transform: translateX(16px)` em 160 ms ease-out, sem passar do alvo. Fundo do switch: troca instantânea.
- Popover e menu: opacity + `scale(.98)` a partir do gatilho (`transform-origin` no gatilho), 160 ms; saída em 100 ms.
- Diálogo (assistente, convite, restaurar): opacity + `scale(.98)` centralizado, 200 ms; saída em 140 ms; o `--dim` faz fade de opacity em 200 ms.
- Tour: o anel do destaque **não voa** entre alvos (cada passo muda de página): fade-out de 100 ms → troca de página e rolagem instantâneas → fade-in de 160 ms do anel e do balão, com o balão em `translateY(4px)→0`.
- Aviso "Salvo": troca de texto sem animação. Destaque da busca: overlay `--acs`, fade de opacity em 240 ms depois de 1,2 s.
- **Nunca anima**: navegação da sidebar e troca de página, troca de aba, Ctrl K / Esc, digitação, valores ao vivo (números, barras e sparklines só trocam o valor), skeletons (estáticos, sem shimmer), nada em loop contínuo, nada enquanto a janela está oculta ou minimizada. O spinner do "Conectando…" do celular é a única rotação, e só enquanto espera a resposta (≤ 10 s). Arrastar na tabela de Métricas: o CDK move a linha por `transform`, e as outras abrem espaço em 160 ms ease-out.
- `prefers-reduced-motion`: tira todo `transform`, mantém opacity ≤120 ms.

### Decisões para o frontend
- Trocar o shell do `settings.html`: nova sidebar (logo PNG, busca, 3 grupos, rodapé com atualização + "Widget no monitor N · jogo"), rotas por página com âncoras, e tirar o `.glow`, o `rootClass` por tema e os overrides `.t-*` de `settings.scss`/`_kit.scss`. O app usa `.app-dark|.app-light` com os tokens acima. Os tokens de tema em `styles.scss` continuam só para o widget e para a página do celular depois de pareado.
- `_kit.scss`: `panel` vira `section + .grp` (um container por seção) e `field.row` vira `.row`. Switch, segmentado, botão e input seguem as medidas acima. Remover os `in-theme()` das configurações.
- Métricas: a lista recolhível vira abas (a aba selecionada fica na URL). A bateria vai para a aba "Bateria" (a lista de aparelhos com switch por aparelho + "Atualizar agora").
- "Restaurar padrão" sai da sidebar e vai para App › Restaurar padrão, com um diálogo de confirmação que lista o que é perdido.
- O seletor "Tema do widget" usa o widget de verdade em escala (`pw-widget` com `previewTheme`, `transform: scale()`, `pointer-events: none`) com dados **congelados** (sem assinar o snapshot ao vivo, para não gastar CPU com 5 widgets), ou uma miniatura estática.
- Tour: um `TourService` com a lista de passos (rota, seletor do alvo, chave i18n). O overlay é um `div` fixo com `box-shadow: 0 0 0 9999px var(--dim)` num recorte posicionado pelo `getBoundingClientRect()` do alvo, mais o anel. Sem blur. Recalcula no resize. O foco vai para o balão (`role="dialog"`, título em `aria-live`).
- Página do celular e da TV: rota `/` sem token → tela de código. Detectar TV (largura ≥ 1280 e `pointer: none|coarse`, ou o user agent com "TV") → layout TV com o teclado na tela. Nada de `:hover` como estado único.

### O que precisa do backend
1. **Código numérico de 6 dígitos** no `startPairing` (hoje são 8 alfanuméricos no fragmento do QR). Manter a validade de 2 min, uso único e o "5 erros invalidam". O QR continua levando o código no fragmento. Devolver `code` no `pairing` para o PC exibir.
2. **Parear digitando**: `{ type:"pair", code:"482913" }` vindo da página raiz sem fragmento. Responder `paired.error` com `invalidCode | expired | noPending | blocked`, mais `attemptsLeft` e `retryAfterSec`. Com 10⁶ combinações, manter o bloqueio por IP e acrescentar um teto global de erros por código.
3. Tipo de aparelho em `devices` (`kind: "phone"|"tv"|"desktop"`, pelo user agent) para o ícone e o nome ("TV da sala · Android TV").
4. **Novos flags**: `features.gameSuggestion`, `features.sessionPeaks`, `features.clockReason`, `features.crashReport` (padrão `true`). Desligado: não calcular nem enviar.
5. **Retenção**: `log.keepDays` já existe (0 = para sempre); validar 1/5/15/30/90/0. Nova mensagem `getLogStats` → `logStats { totalBytes, files, oldest, wouldDelete?: { files, bytes } }`, aceitando `keepDays`/`maxTotalMb` hipotéticos para a prévia.
6. **Histórico de sessões além de 20**: guardar até a retenção e paginar (`getSessions { before?, limit, exe? }`) com filtro por jogo.
7. **Tour**: persistir `config.tour { step, done, dismissed }`. Item "Rever tutorial" no menu da bandeja → host message `startTour` para a página de configurações.
8. Deep links: o host aceita `openSettings { page, anchor }` (do balão de queda → `sessions/crash`; do aviso de alerta → `sessions`).
9. `catalog` com as versões dos componentes para "Sobre" (PresentMon, PawnIO, .NET).
10. `config.appearance: "system"|"light"|"dark"` para as configurações (substitui o uso de `appTheme` no app).

## v1.2

Frames no canvas abaixo do título "1.2" (a partir de y=27700). Cópias em `docs/design/v12/` (18 arquivos `.dc.html`, com o logo por caminho relativo `../../../assets/logo/pitwall-256.png`; no canvas ele vem de `/_blob/…`). Escopo e tipos: `docs/v12-contract.md` e `web/src/app/models.ts` › 1.2. Tudo usa os tokens, o espaço e o tipo da v1.0; nenhuma cor nova além de `--g/--y/--r/--ac` e as versões `*s`.

Lentes usadas: impeccable (modo *Operate*: escaneabilidade e consistência acima de expressão; nada de "hero metric", card dentro de card ou rótulo-sobrancelha), emil-design-eng (só anima o que é raro e tem propósito) e design-taste-frontend (uma cor de destaque, linhas de tabela no lugar de cards).

| Frame | Tamanho | O que mostra |
|---|---|---|
| V12-Monitor-Escuro | 1200×1260 | Monitor em 2 colunas, jogo aberto, hot spot crítico, Δ no amarelo, 3 sensores sem leitura com motivo; marca da dobra em 800 |
| V12-Monitor-Claro | 1200×1260 | Mesmo layout em outro PC (RTX 5070 Ti: "A NVIDIA tirou o hot spot das RTX 50"), botão logo depois de marcar |
| V12-Monitor-960 | 960×640 | Janela mínima: sidebar 200 justa, uma coluna, faixa de estado 3+2, FPS sem leitura (não é administrador) |
| V12-RelatorioPC-Escuro / -Claro | 1200×2050 | Agora, Última queda (2 min), eventos perto da hora, Últimas medições, Eventos do Windows (30 dias), Histórico |
| V12-RelatorioPC-Estados | 2×1200×800 | Sem quedas; `features.crashReport` desligado |
| V12-RelatoriosJogo-Escuro | 1200×1860 | Última partida (terminou em queda), linha do tempo com marcadores e engasgos, médias e picos, Comparar vazio, Histórico com caixas de seleção |
| V12-RelatoriosJogo-Comparar | 1200×1180 | A × B com diferenças e duas linhas sobrepostas (FPS, hot spot) |
| V12-Card-Compartilhar | 1200×630 | PNG exportado |
| V12-Card-Texto | 1200×700 | Diálogo Compartilhar: prévia do PNG + texto simples + Markdown |
| V12-Widget-Faixa-Lumen-2560 / -Lumen-1920 / -Minimo-1920 | 2560×720, 1920×480 | Layout `strip` |
| V12-Widget-Mini-Lumen-800 / -Lumen-480 / -Minimo-800 | 800×480, 480×320 | Layout `mini` |
| V12-Assistente-UmMonitor | diálogo 880×600 | Passo 1 com um monitor só |
| V12-Pecas | 1840×860 | Atalhos (capturando / em uso / inválido), Integrações (token mostrado uma vez), Ajuste da GPU sem NVIDIA, pico com unidade |

### Navegação (sidebar)
Novo grupo **PC** entre Visão geral e Widget: Monitor (ícone de pulso `M3 12h3.5l2.5-6 4 12 2.5-6H21`) e Relatório do PC (folha com pulso). "Sessões" vira **Relatórios de jogo** (ícone de eixo com linha: `M4 4.5v15h16` + `M7.5 15l3.5-4.5 3 2.5 4.5-6`). O ponto vermelho de incidente não visto (`catalog.pcPending`) sai de Sessões e vai para Relatório do PC. Versão na marca: 1.2.0. EN: grupo "PC", páginas "Monitor", "PC report", "Game reports".
Com 12 itens, **abaixo de 720 px de altura** a sidebar fica justa (item 30 px, grupo com padding 10/8/3) e o bloco "Widget no monitor N" do rodapé some (o aviso de atualização fica).

### 1. Monitor (`monitor`)
- **Largura toda** (`.col.wide`). h1 "Monitor"; descrição "Todos os sensores ao vivo, com o gráfico recente e o mínimo e o máximo de cada um. Só calcula enquanto esta página está aberta." / "Every sensor live, with a recent graph and the min and max of each. Only computed while this page is open." À direita: [Copiar leituras] / [Copy readings] e [Marcar momento] / [Mark moment] (ícone bandeira + `kbd` do atalho atual, ex. "Ctrl Alt M"; sem atalho, sem kbd). Em 960: "Marcar" sem kbd.
- Depois de marcar, o botão mostra "Marcador 3 · 21:02:41" com check em `--g` por 2 s (`aria-live="polite"`) e volta. EN "Marker 3 · 21:02:41". Copiar leituras: o texto vira "Copiado" / "Copied" por 2 s. O conteúdo copiado é o `sensorDump.text`.
- **Faixa de estado**: um container, 5 células iguais separadas por `--hair`, padding 12/16; rótulo 11.5/700 tx3, valor 15/700, sub 12 tx2, uma linha com reticências. Em 960: grid de 3 (3+2).
  - Jogo / Game: exe em mono 14/600, sub "há 36 min". Sem jogo: "Nenhum" / "None".
  - FPS: "141", sub "1% low 112 · 7,1 ms". Sem FPS: "Sem leitura" / "No reading" em `--y`, motivo no sub.
  - Clock limitado por / Clock limited by: Temperatura / Consumo / Voltagem (estim.) / Sincronia / Ocioso / Livre (Temperature / Power / Voltage (est.) / Sync / Idle / Free); sub "62% do tempo na partida". Sem cor de alerta: limite não é alarme.
  - Ajuste da GPU / GPU tuning: ponto `--g` + perfil, sub "até 280 W e 1800 MHz"; desligado: "Desligado" + "Ligar em Ajuste da GPU"; AMD: "Precisa de NVIDIA".
  - Ligado há / Up for: "2 h 58 min", sub "desde 18:04".
- **Motivo do FPS** (`texts["fps.reason"]`): `noGame` "Nenhum jogo aberto" / "No game running"; `starting` "Começando a medir…" / "Starting to measure…"; `antiCheat` "O anti-cheat do jogo bloqueia a leitura" / "The game's anti-cheat blocks it"; `noPresentMon` "PresentMon não encontrado. Reinstale o Pitwall." / "PresentMon not found. Reinstall Pitwall."; `otherCapture` "Outro programa está usando a captura de quadros" / "Another app is using frame capture"; `noFrames` "Sem quadros novos (jogo minimizado ou em pausa)" / "No new frames (game minimized or paused)"; `notAdmin` "Precisa abrir como administrador" / "Needs to run as administrator".
- **Barra de ferramentas** (16 px abaixo): à esquerda, âncoras "GPU CPU RAM FPS Discos Rede Bateria" (links 12.5/600 tx2, rolagem instantânea); à direita, "Mín e máx desde 18:04, quando o Pitwall abriu" / "Min and max since 18:04, when Pitwall opened" (estreito: "Mín e máx desde 18:04") e o segmentado **1 min / 5 min / 15 min** (padrão 5; lembrado em `localStorage`, não no config).
- **Grupos** GPU · CPU · RAM · FPS · Discos · Rede · Bateria (EN … Disks · Network · Battery): h2 + dica na mesma linha (tx3: modelo, driver, "FC26.exe · PresentMon 2.3", nomes dos discos) e **um container** com uma linha por sensor. Grupo sem sensores e sem motivo (ex.: nenhuma bateria) não aparece.
- **Duas colunas quando o conteúdo tem ≥ 860 px** (janela ≥ ~1140): esquerda GPU + FPS; direita CPU + RAM + Discos + Rede + Bateria; gap 24. Abaixo disso, uma coluna na ordem do contrato.
- **Linha do sensor** (min-height 44, padding 0/14, divisor `--hair`). Grid `minmax(0,1fr) 96px 80px 52px` em 2 colunas; `minmax(0,1fr) minmax(0,1.4fr) 96px 104px` em 1 coluna.
  - Nome 13.5/600 com reticências.
  - Sparkline 24 px, traço 1.6 + área 13%, accent; `--y`/`--r` quando o valor atual passa do limite; linha tracejada `--y` (3/3, 75%) no limite amarelo quando cabe na escala; FPS em `--g`.
  - Valor 16.5/600 à direita + unidade 11.5 tx3. **Amarelo/vermelho = fundo `--ys`/`--rs` (raio 6) + cor do texto**, nunca só a cor; `aria-label` com "atenção"/"crítico".
  - Mín/máx empilhados 11.5 tx3 com o número em tx2/600; em 1 coluna, numa linha ("mín 38 · máx 79").
  - Engasgos: no lugar do gráfico, trilho com um tique `--y` por engasgo na janela; valor = engasgos na partida; coluna da direita "0,1/min".
  - Bateria: sem mín/máx; amarelo abaixo de 20%.
- **Sem leitura** (`available:false`): nome em tx2/500 e `missingText` (12.5 tx2) ocupando as 3 colunas da direita, com ação quando houver: `needsPawnIO` "Instalar", `needsAdmin` "Reabrir como administrador", `needsPresentMon` "Reinstalar", `off` "Ligar". Exemplos: "A NVIDIA tirou o hot spot das RTX 50." / "NVIDIA removed the hot spot sensor on RTX 50 cards."; "Precisa do PawnIO para ler." / "Needs PawnIO to read."; "Este disco não informa a temperatura." / "This drive doesn't report temperature."; "O jogo não envia a latência para o PresentMon." / "The game doesn't send latency to PresentMon."; "Desligado ou fora de alcance." / "Off or out of range.". Se **todos** os sensores de um grupo faltam pelo mesmo motivo (FPS com `notAdmin`), o container vira uma linha: "FPS, 1% low, frametime e engasgos: sem leitura · Precisa abrir como administrador [Reabrir como administrador]".

### 2. Relatório do PC (`health`)
- Coluna de 840. h1 "Relatório do PC" / "PC report"; descrição "Quando o PC desliga sem aviso, com ou sem jogo, o Pitwall guarda os 2 minutos antes e junta os eventos do Windows daquela hora. Só os dados." / "When the PC shuts off without warning, in a game or not, Pitwall keeps the 2 minutes before and gathers that hour's Windows events. Just the data."
- **Agora** (container de 1 linha): ponto `--g` + "**Agora: ligado há 14 min** desde 21:16 · guardando os últimos 2 min, 1 leitura por segundo" + link "Recursos". EN "**Now: up for 14 min** since 21:16 · keeping the last 2 min, 1 reading per second". Desligado (`ringActive:false`): ponto tx3, sem a parte do buffer, e a linha "Desligado em Recursos" / "Sem isto, o Pitwall não guarda os 2 minutos antes de uma queda. Os eventos do Windows continuam aqui." [Ligar] (EN "Off in Features" / "Without it, Pitwall doesn't keep the 2 minutes before a crash. Windows events still show here." [Turn on]).
- **Última queda** (`#latest`), um container:
  - Cabeçalho (padding 16): ícone power `--r` 20; título 17/800 "O PC desligou sem aviso às 21:14" (bugcheck: "O PC parou com tela azul às 23:02"); 13 tx2 "Ligado havia 3 h 12 min · jogando FC26.exe (48 min de partida) · voltou às 21:16" (sem jogo: "fora de jogo"); 12.5 tx3 hardware "RTX 3080 · driver 581.57 · Ryzen 7 5800X3D · 32 GB · Windows 11 24H2". [Dispensar] quieto à direita. EN "The PC shut off without warning at 21:14" / "Up for 3 h 12 min · playing FC26.exe (48 min in) · back at 21:16" / "The PC stopped with a blue screen at 23:02" / "Dismiss".
  - 6 gráficos de 2 min (linhas de 50 px, grid `112px 1fr 132px`): Hot spot, GPU núcleo, Consumo GPU, Clock GPU, CPU, FPS; à direita "mín 99 · máx 104 °C" / "no fim **104 °C**" (cor de alerta só no valor do fim). Eixo comum: "−2:00 −1:30 −1:00 −0:30 21:14:05". Escala = mín/máx da série com folga (não começa em 0); tracejado do limite amarelo quando cabe. Série ausente: a linha some da lista de gráficos (o valor aparece como "sem leitura" nas medições).
  - Nota 12 tx3: "A última gravação foi às 21:14:05; em jogo o Pitwall grava a cada 5 s, então o PC desligou entre 21:14:05 e 21:14:10." (fora de jogo, 10 s). EN "The last save was at 21:14:05; in a game Pitwall saves every 5 s, so the PC went off between 21:14:05 and 21:14:10."
  - "Eventos do Windows perto dessa hora (21:04 a 21:24)" com as linhas de evento do incidente.
- **Últimas medições**: ações no cabeçalho [Copiar como texto] [Copiar para fórum] [Salvar .txt] [Abrir CSV] (Copy as text / Copy for forum / Save .txt / Open CSV; Abrir CSV só com `csvFile`). Dica "Tudo o que o Pitwall leu às 21:14:05, a última gravação antes da queda." Tabela em **3 colunas** num container (GPU · CPU e RAM · FPS e outros), pares nome/valor 13 px, valor 600 à direita, cor de alerta só no valor, "sem leitura" em tx3. Copiar para fórum = Markdown (Reddit, GitHub, fóruns); Copiar como texto = linhas simples (Discord, WhatsApp).
- **Eventos do Windows** (`#events`, 30 dias, mais novos primeiro), contagem à direita do título ("6 eventos"). Linha: hora 13/600 tx2 | nome 13.5/700 + fonte mono 11.5 tx3 (provedor, id, código ou componente) | significado 12.5 tx2. **Sem diagnóstico** e sem cor na lista.

| kind | PT | significado | EN | meaning |
|---|---|---|---|---|
| kernelPower41 | Kernel-Power 41 | O PC voltou sem ter sido desligado pelo Windows. | Kernel-Power 41 | The PC came back without Windows shutting it down. |
| unexpectedShutdown | Desligamento inesperado | O Windows registrou que o desligamento anterior foi inesperado. | Unexpected shutdown | Windows logged that the previous shutdown was unexpected. |
| bugcheck | BugCheck | O Windows parou com tela azul e guardou este código. | BugCheck | Windows stopped with a blue screen and saved this code. |
| whea | WHEA corrigido | O hardware relatou um erro e o corrigiu sozinho. | WHEA corrected | Hardware reported an error and corrected it. |
| whea + fatal | WHEA fatal | O hardware relatou um erro que não conseguiu corrigir. | WHEA fatal | Hardware reported an error it couldn't correct. |
| gpuReset | Driver de vídeo reiniciado | O driver de vídeo parou de responder e o Windows o reiniciou. | Display driver restarted | The display driver stopped responding and Windows restarted it. |

- **Histórico** (`#history`): Quando | O que houve | Ligado havia | Jogo | Eventos do Windows (pílulas `p-n`; BugCheck e WHEA fatal `p-r`) | chevron. A linha aberta fica com `--acs`; clicar troca o bloco "Última queda" pelo incidente (`getPcIncident`). Rodapé "Guarda os 20 mais recentes." / "Keeps the 20 most recent." "Desligou sem aviso" / "Shut off without warning"; "Tela azul 0x124" / "Blue screen 0x124".
- **Vazio**: check `--g` 22 + "Nenhuma queda registrada" (15/700) + "Se o PC desligar sem aviso, os 2 minutos antes e os eventos do Windows daquela hora aparecem aqui. Nada para fazer até lá." (EN "No crashes recorded" / "If the PC shuts off without warning, the 2 minutes before and that hour's Windows events show up here. Nothing to do until then."). Eventos do Windows continuam; Histórico some se vazio.
- **Desligado** (`features.crashReport` off): "Agora" com a linha "Desligado em Recursos"; Última queda vira "Sem buffer, sem os 2 minutos antes" / "As quedas antigas continuam no histórico. Ligue o Relatório do PC para guardar as próximas." (EN "No buffer, no 2 minutes before" / "Older crashes stay in the history. Turn on PC report to keep the next ones.").
- O balão de queda e o banner da Visão geral abrem `health/latest`.

### 3. Relatórios de jogo (`sessions`)
- h1 "Relatórios de jogo" / "Game reports"; "Cada partida vira um relatório: FPS, engasgos, temperaturas e os momentos que você marcou." / "Every match becomes a report: FPS, stutters, temperatures and the moments you marked."
- **Última partida** (`#last`): dica "FC26.exe · hoje, 20:26 → 21:14 · 48 min"; [Compartilhar] / [Share] e [Abrir CSV]. Com `endedByCrash`: nota `n-r` de 1 linha acima do container "Terminou numa queda do PC, às 21:14." + "Ver relatório do PC ›" (incidente `incidentId`). EN "Ended in a PC crash at 21:14." / "See PC report".
  - Faixa de 6 números no topo do container (células iguais, divisores, **sem fundo de tile**; substitui a grade 4×2 da v1.0): FPS médio (sub "mín 30 · máx 165"), 1% low, 0,1% low, Engasgos (sub "0,1 por minuto"; ausente = "não contado" + link Recursos), Erro de animação (ms, "média"), Latência do PC (ausente = "sem leitura" / "o jogo não envia"). Valor 24/600, rótulo 11.5/700 tx3.
  - "A partida inteira" + segmentado **FPS / Hot spot / Núcleo / Consumo / CPU** (`getSessionSeries`, 120 pontos). Gráfico 140 px, eixo Y com 4 valores (11 tx3) e grade `--hair`; FPS em `--g`, o resto em accent. **Marcadores**: linha vertical tracejada tx3 com o número num círculo de 18 px no topo. **Engasgos**: trilho de 14 px embaixo, um tique `--y` cada. **Queda**: linha `--r` de 2 px no fim e o último rótulo do eixo "48 min · PC desligou". Eixo X em minutos.
  - Lista de marcadores (linhas de 38): número | hora | "aos 15 min" | nota ou "sem nota" (tx3) | origem ("Ctrl Alt M" / "botão Marcar momento"). Sem marcadores, some.
  - `sessionSeries.available:false`: no lugar do gráfico, "O CSV desta partida já foi apagado pela retenção, então não dá para desenhar a partida inteira. Os números acima continuam." / "This match's CSV was already removed by retention, so the full timeline can't be drawn. The numbers above still hold."
- **Médias e picos**: Sensor | Média | Pico | No amarelo | Acima do limite crítico definido (cabeçalho em 2 linhas; GPU núcleo, Hot spot, Δ hot spot, Consumo GPU, Clock GPU, Uso GPU, CPU temperatura, CPU uso); pico com a cor do limite; "—" quando não houve. Última linha "O que limitou o clock" + barra empilhada de 8 px (temperatura `--y`, consumo `--ac`, livre `--bd`) com legenda em texto.
- **Comparar** (`#compare`), vazio: uma linha com pílula "A" + seletor (última partida) + botão trocar + pílula "B" + seletor "Escolha outra partida" + [Comparar] desabilitado. Dica "Marque duas partidas no histórico ou escolha aqui." / "Tick two matches in the history or pick them here."
- **Comparação**: Sensor | A (data) | B (data) | "A em relação a B" / "A vs B". **Verde = A melhor, vermelho = A pior, tx3 "igual" quando a diferença é < 2% ou o sensor não tem lado melhor** (consumo, clock, uso, duração). Melhor = maior em FPS/1%/0,1%; menor em engasgos, engasgos/min, temperaturas, tempo no amarelo/vermelho. A regra fica escrita embaixo da tabela. Dois gráficos sobrepostos (FPS, Hot spot), 110 px: A accent sólido com área 10%, B tx2 tracejado 5/4 sem área; eixo X até a partida mais longa. [Limpar] no cabeçalho.
- **Histórico** (`#history`): caixa de seleção de 16 px à esquerda (`role="checkbox"`, rótulo "Comparar FC26.exe de hoje, 20:26"); linha marcada com `--acs`. Jogo (mono + pílula "PC desligou") | Quando | Duração | FPS médio | 1% low | Engasgos | Pico hot spot | chevron. Cabeçalho: "1 marcada · marque mais uma para comparar"; com 2, botão primário [Comparar 2 partidas] que rola até `#compare`. Marcar a terceira desmarca a mais antiga. EN "1 selected · select one more to compare" / "Compare 2 matches".
- **Gravação em CSV** (`#csv`): igual à v1.0.

### 4. Compartilhar
- **PNG 1200×630**, sempre escuro (hex fixos, independente do tema do app): fundo #0E1014, padding 48/56/44, Manrope. Topo: logo 44 (raio 10) + "Pitwall" 22/800; à direita "19 nov. 2026 · 48 min" 17/600 #A3AAB6. Esquerda: jogo 40/800 (nome do perfil, senão o exe sem ".exe"); hardware 18/600 #A3AAB6; **FPS médio 156 px peso 300** (eco do FPS fino do widget) + "FPS médio"; 1% low, 0,1% low e engasgos em 40/700. Direita (300 px): "Picos" + Hot spot, GPU núcleo, Consumo (30/700, #FF6B70 só acima do limite) com divisores #23272E; por último "Acima do limite crítico definido" (17/600 numa linha inteira) e embaixo a métrica que mais ficou lá, 15/600 #848C99 ("hot spot ≥ 100 °C"), com o tempo 30/700 #FF6B70 à direita. Base: linha do FPS da partida (104 px, #3DDC84, área 10%) e rodapé "FPS na partida" / "github.com/igoredm/pitwall" 14/600 #848C99. Sem gradiente nem brilho; lê bem na miniatura do Discord (~400 px).
- **Diálogo Compartilhar** (1040 px, `--pop`): prévia do PNG a 40% + [Copiar imagem] (primário) [Salvar PNG] + "1200×630, bom para Reddit, Discord e X."; à direita, dois blocos mono 12.5 sobre `--sf2`: **Texto** "funciona em qualquer lugar" [Copiar texto] e **Markdown** "Reddit, fóruns e GitHub" [Copiar Markdown]. EN "Share match", "Copy image", "Save PNG", "Text — works anywhere", "Copy text", "Markdown — Reddit, forums and GitHub", "Copy Markdown".
- Texto simples:

```
EA SPORTS FC 26 · 19/11/2026 · 48 min
RTX 3080 · Ryzen 7 5800X3D · 32 GB
FPS médio 141 · 1% low 112 · 0,1% low 88
Engasgos: 6 (0,1 por min)
Picos: hot spot 101 °C · núcleo 79 °C · consumo 322 W
Acima do limite crítico definido: 48 s (hot spot ≥ 100 °C)
Pitwall 1.2.0
```

- **"Acima do limite crítico definido"** (EN "Above your critical limit"; antes "No vermelho", que os usuários não entendiam) = maior tempo de uma métrica em ou acima do limite vermelho dela (`secondsAboveCrit`). Onde cabe (card, texto, Markdown) vem a métrica que mais ficou e o limite: o do usuário (`config.metrics`), senão o padrão do catálogo, sempre em °C; "+N" quando outras também passaram (`redCaption`). Na tabela de médias e no Comparar só o tempo.
- Markdown: jogo em negrito, linha de hardware, tabela `| FPS médio | 1% low | 0,1% low | Engasgos |` alinhada à direita, "Picos: hot spot **101 °C** · …" e "Acima do limite crítico definido: 48 s (hot spot ≥ 100 °C) · *Pitwall 1.2.0*". Linha sem dado some (nunca "0" ou "—" no texto compartilhado).

### 5. Widget: `strip` e `mini`
Mesmo sistema do completo/médio/compacto (tokens do tema, cards, tiles, `.lim`, picos). Nenhuma animação nova.
- **strip** (≥ 3:1): uma linha. Coluna do FPS (≈ 400 px em 1920×480: chip do jogo, FPS no peso do tema, pílulas 1% low / 0,1% / frametime, gráfico) | card **GPU** (flex 2.1: cabeçalho + "Limite: …" + uso, barra, **grade 3×2**: Núcleo, Hot spot, Memória, Consumo, Clock, Δ) | card **CPU** (flex 1, **tiles em 1 coluna**: Temperatura, Consumo, Clock) | card **RAM** (flex .7, "19,8 de 32 GB" + Usada/Livre). 1920×480 = escala 1; 2560×720 = escala 1,45 e ganha uma 5ª coluna estreita (relógio, data, bateria, rede). Em 1920×480 a bateria vai para baixo das pílulas do FPS.
- **mini**: 800×480 (e 1024×600): esquerda (300×s) chip do jogo, FPS 150×s, "FPS", 1% low e frametime empilhados, chip de limite; direita grade **2×3** (GPU uso, Núcleo, Hot spot, Consumo, CPU, RAM), valor 40×s peso fino, rótulo embaixo, "máx …" só na célula em alerta. 480×320: FPS 92 px com "FPS" e o jogo ao lado, "112 1% low" e "7,1 ms" à direita; grade **3×2** abaixo, sem picos. As células seguem a prioridade de Métricas.
- Mínimo: sem cards, divisores `--hair`, rótulos em caixa alta .16em, tag de texto "crítico"/"atenção" (Lumen usa o ponto de 7 px).
- **Pico com unidade**: sempre "máx 101 °C" / "max 101 °C". No completo e no strip, "máx …" fica **embaixo do nome** do tile (nunca disputa largura com ele); no médio o chip ganha a unidade; compacto e mini 480 não têm pico.
- Automático: proporção ≥ 3:1 → strip; largura ≤ 1024, altura ≤ 600 e proporção < 3:1 → mini; o resto segue a regra atual.

### 6. Peças
- **Assistente, passo 1 com um monitor**: "Onde o widget vai ficar?"; "Achamos um monitor só (2560 × 1440). O widget foi feito para um segundo monitor, mas dá para usar assim:" (EN "We found a single monitor (2560 × 1440). The widget is made for a second screen, but you can use it like this:"). Um container com 2 opções de rádio (linha inteira clicável; escolhida com `--acs`): **Ver no celular ou na TV** / "Abre o widget num celular ou TV da mesma rede Wi-Fi. Fica fora da tela do jogo. Leva a Celular e TV para parear." (EN "Watch on your phone or TV" / "Opens the widget on a phone or TV on the same Wi-Fi. Stays off your game screen. Takes you to Phone & TV to pair.") e **Deixar no canto da tela** (padrão) / "O widget compacto fica sempre por cima, num canto. Ctrl Alt P mostra e esconde, até dentro do jogo." (EN "Keep it in a corner" / "The compact widget stays on top in a corner. Ctrl Alt P shows and hides it, even in game.") com segmentado Superior esquerdo / Superior direito (padrão) / Inferior esquerdo / Inferior direito. Rodapé: "Ligou outro monitor? Ele aparece aqui." (atualiza ao vivo; com 2 monitores volta ao passo normal).
- **App › Atalhos**: switch "Atalhos globais" ("Funcionam em qualquer lugar, até dentro do jogo. O Windows avisa o Pitwall quando você aperta; nada lê o teclado." / "Work anywhere, even in game. Windows tells Pitwall when you press them; nothing reads your keyboard."); linhas "Mostrar ou esconder o widget" / "Show or hide the widget" e "Marcar momento" / "Mark moment": teclas em `kbd` (24 px, borda inferior 2 px) + [Alterar]. **Capturando**: campo com foco (`--ac` + anel `--acs`), modificadores já apertados + "Pressione as teclas…" / "Press the keys…", dica "Esc cancela. Backspace desliga o atalho." / "Esc cancels. Backspace turns the shortcut off.", [Cancelar]. **Em uso** (`hotkeys.x = "inUse"`): pílula `p-r` "em uso por outro app" / "used by another app" + dica em `--r` "Ctrl + Alt + M está em uso por outro app. Escolha outra combinação." **Inválido**: dica `--y` "Use Ctrl, Alt, Shift ou Win junto com uma letra, um número ou F1 a F24." Desligado: "Desligado" tx3.
- **Celular e TV › Integrações**: switch "Home Assistant" ("Deixa o Home Assistant ler os sensores pela rede local. Só leitura. Precisa de Celular e TV ligado."; desabilitado com essa dica sem `remote.enabled`); "Endereço" mono + [Copiar]; "Novo token" (nome + [Criar token]). **Token criado** (uma vez só): "Token criado: Home Assistant" / "Copie agora. Por segurança, ele não aparece de novo; se perder, crie outro." + campo mono só leitura + [Copiar] primário + link "Como configurar o sensor REST no Home Assistant" (`docs/home-assistant.md`). Sair da página tira o token da tela. Tokens existentes: ícone chave, "integração · criado hoje, 21:30 · usado há 4 s", [Revogar] `--r`. EN "Integrations", "Address", "New token", "Create token", "Token created", "Copy it now. For security it won't be shown again; if you lose it, create another.", "Revoke".
- **Ajuste da GPU sem NVIDIA**: nota `n-y` "O ajuste precisa de uma GPU NVIDIA" / "Esta é uma AMD Radeon RX 7800 XT. O resto do Pitwall funciona igual: sensores, FPS, relatórios e alertas." (EN "Tuning needs an NVIDIA GPU" / "This is an AMD Radeon RX 7800 XT. The rest of Pitwall works the same: sensors, FPS, reports and alerts."); seções abaixo esmaecidas (`opacity .45`, `aria-disabled`), switch desabilitado e pílula `p-y` "precisa de NVIDIA" / "needs NVIDIA".

### Decisões para o frontend
- **Componentes**: `pw-status-strip` (5 células ou 3+2), `pw-sensor-row` (nome, sparkline ou trilho, valor com nível, mín/máx, sem leitura com ação), `pw-sensor-group` (h2 + dica + container; vira uma linha quando todos faltam pelo mesmo motivo), `pw-mini-chart` (SVG `preserveAspectRatio="none"` + `vector-effect: non-scaling-stroke`, linha de limite opcional), `pw-timeline` (gráfico + marcadores + engasgos + eixo), `pw-event-row`, `pw-compare-table`, `pw-share-dialog`, `pw-hotkey-field`. Tabelas em grid com `.tbl-r`. Nada de card dentro de card: um container por seção, como na v1.0.
- **Monitor**: assina o snapshot só com a página visível e a janela não minimizada; anel por sensor no front a 1 Hz (15 min = 900 pontos), redesenho no máximo 1×/s; mín/máx desde a abertura do app vêm do backend (não zeram ao trocar de página).
- **Alerta no app** = cor + fundo `*s` (pílula do valor) + tracejado do limite no gráfico; nunca só cor. Limite de clock nunca é amarelo/vermelho.
- **Copiar**: o botão vira "Copiado" por 2 s, sem toast. Salvar .txt/PNG pelo diálogo de arquivo do Windows (host).
- **PNG**: componente fixo 1200×630 fora da tela, capturado pelo host (`CapturePreviewAsync`) ou desenhado num canvas; usa hex fixos, não tokens.
- **Comparar**: seleção na URL (`sessions/compare?a=<start>&b=<start>`), histórico e seletores sincronizados.
- **Movimento** (regras da v1.0): o diálogo Compartilhar entra com opacity + `scale(.98)` em 200 ms ease-out e sai em 140 ms. **Nunca anima**: valores, sparklines, gráficos, trilho de engasgos (só trocam o desenho); segmentados 1/5/15 min e da linha do tempo; marcar/desmarcar no histórico; rolagem pelas âncoras; "Copiado" e "Marcador 3" (troca de texto); campo de atalho capturando (é teclado); colapso do grupo sem leitura; no widget strip/mini, nada além da cor de alerta que o widget já faz.
- **Acessibilidade**: faixa de estado `role="status"` sem `aria-live` (muda sempre); "Marcador N" e "Copiado" com `aria-live="polite"`; linha de sensor com `aria-label` ("Hot spot, 101 graus, crítico, mínimo 45, máximo 101"); gráficos `aria-hidden`; caixas do histórico `role="checkbox"` com jogo e data no rótulo.
- **Números**: `tabular-nums`; vírgula decimal em PT ("4,45 GHz"), ponto em EN; "101 °C" com espaço nas tabelas.

### O que precisa do backend (além do contrato)
1. `catalog.hardware.os` em texto curto ("Windows 11 24H2") e o modelo de cada disco (dica de Discos).
2. Mín/máx por métrica desde a abertura do app (snapshot ou `getMinMax`).
3. Nome amigável do jogo e `ramGb` na `GameSession` (card e texto).
4. Opcional: origem do marcador (`via: "hotkey" | "button"`) em `SessionMarker`.
