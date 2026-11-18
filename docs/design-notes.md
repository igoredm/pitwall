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
