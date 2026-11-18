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
