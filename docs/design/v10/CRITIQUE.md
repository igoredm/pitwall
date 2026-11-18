# Crítica das configurações 0.7 → motivos da 1.0

Método: revisão de design de passada única (impeccable `critique`: heurísticas de Nielsen, carga cognitiva, especificidade), mais o `impeccable detect` nos templates (0 achados: ele não lê os temas em SCSS nem o Angular em execução), mais a UI ao vivo (`?demo=v07`, 1200×800, nos 5 temas). Também foram aplicados os princípios de restrição do design-taste-frontend e o framework de animação do emil-design-eng. A avaliação não foi isolada em dois agentes, por isso a nota vale como ponto de partida, não como medida.

## Nota (Nielsen, 0–4)

| # | Heurística | Nota | Problema principal |
|---|---|---|---|
| 1 | Visibilidade do estado | 2 | Salva sozinho, mas nada diz "Salvo". O estado "agora" (jogo, ajuste, celular) fica espalhado em 4 páginas. |
| 2 | Linguagem do usuário | 3 | A copy é boa. "Log" como página e "Geral" como gaveta de tudo não são palavras de quem joga. |
| 3 | Controle e liberdade | 2 | "Restaurar padrão" fica na nav, a um clique (confirmação dupla no mesmo botão). O assistente não tem caminho de volta depois de fechado. |
| 4 | Consistência | 2 | Cada tema remonta o app de um jeito, e em alguns ele vira outro produto: o Mínimo fica "quadradão", o Splash vira adesivo. Os cards variam por página. |
| 5 | Prevenção de erros | 2 | Retenção do CSV sem prévia do que vai ser apagado. Limites de alerta sem faixa válida. |
| 6 | Reconhecer em vez de lembrar | 2 | Os alertas dependem do limite vermelho, que fica em outra página, sem ligação. A bateria fica em "Geral". |
| 7 | Flexibilidade e eficiência | 1 | Sem busca, sem atalho, sem deep link (a não ser o do crash). |
| 8 | Estética e minimalismo | 2 | O "Geral" em duas colunas tipo masonry mistura 5 assuntos. Brilho de fundo genérico. Cards em tudo. |
| 9 | Recuperação de erros | 3 | Os estados do celular e da atualização são bons. A queda do socket aparece só no rodapé da nav. |
| 10 | Ajuda e documentação | 1 | Não há tour, não há "rever", e o assistente de 4 passos só configura, não ensina. |
| **Total** | | **20/40** | Aceitável, com problemas claros de estrutura |

## Veredito de especificidade

O widget é autoral. As configurações não: com 6 itens de nav, painéis arredondados, brilho radial no canto e uma grade de cards, dava para trocar o nome do produto e ninguém notaria. Os temas tentaram resolver isso pintando o template (cantos de colchete no Neon, `$` no Terminal, borda de 3 px com sombra dura no Splash claro). O resultado foi o que o dono chamou de "cara de IA". Pintar o template não dá identidade quando a estrutura é genérica.

## Problemas prioritários

1. **[P1] A IA não segue as tarefas.** "Geral" junta idioma, tema do app, tema do widget, taxa, início com o Windows, alertas, bateria, monitor, layout e atualizações. "Jogos" junta detecção, relatório de queda, resumo da sessão, perfis e regras. "Log" é uma página de 4 controles. → 10 páginas em 3 grupos (Widget, Jogo, Pitwall) mais a Visão geral, com uma tarefa por página (veja design-notes › v1.0 › IA).
2. **[P1] Cinco temas de app, nenhum bem resolvido.** O tema muda tipografia, raio, bordas e decoração das configurações. Isso exige 5 sistemas de componentes e entrega 5 meio-sistemas: Mínimo com raio 0 em tudo (inclusive switch e segmentado), Neon com cantos decorativos, Splash com sombra dura. → **Decisão: o app tem um visual só, claro e escuro, e o seletor de tema muda só o widget**, agora com prévias reais do widget em cada tema. Isso resolve o "quadradão" e a "cara de IA" na raiz e corta 4/5 do CSS de tema das configurações.
3. **[P1] Nenhum caminho para aprender.** O assistente de 4 passos configura, mas não explica layouts, prioridade de métricas, sessões, ajuste da GPU, celular, alertas nem a bandeja. Se ele for fechado, não volta. → Assistente de 3 passos + tour de 8 passos com coach marks sobre a UI real, que pode ser revisto pela bandeja, por App › Ajuda, pela Visão geral (até concluir) e pelo aviso que aparece logo depois de fechar.
4. **[P2] Hierarquia fraca dentro das páginas.** Rótulo, dica e controle disputam a mesma linha estreita (a dica "Idioma" quebra em uma palavra por linha em 1200 px). A grade de duas colunas embaralha a ordem de leitura. → Uma coluna de 840 px, um padrão de linha (rótulo + dica à esquerda, controle à direita), seções com título simples e um único container por seção.
5. **[P2] Decoração no lugar do conteúdo.** Gradientes radiais no fundo, brilhos e cards dentro de cards. → Fundo liso, uma camada neutra a mais na sidebar, nada de brilho. A peça visual da página é o próprio widget (miniaturas reais na Visão geral e no seletor de tema).

## Personas

- **Primeira vez (Jordan)**: abre o app pela primeira vez e cai em Métricas, uma tabela com 9 colunas. Não sabe o que é "Aparece em: compacto/médio". Sem tour, desiste da priorização.
- **Usuário avançado (Alex)**: quer mudar a retenção do CSV, procura em Geral, depois em Jogos, e só então acha "Log". Sem busca nem Ctrl K.
- **Jogador no meio da partida**: o PC caiu ontem. O relatório existe, mas está misturado com a configuração de executáveis. Ele procura "sessões" e não acha.

## Movimento (emil-design-eng)

| Antes | Depois | Por quê |
|---|---|---|
| Switch com `linear()` de mola que passa do alvo (1.08) | `transform 160ms cubic-bezier(.23,1,.32,1)`, sem passar do alvo | Usado dezenas de vezes por sessão: precisa ser firme, não elástico |
| Chevron do grupo gira em 250 ms `ease` | Sem chevron (os grupos viraram abas), troca instantânea | Troca de aba é navegação frequente, então não anima |
| `transition: background 200ms ease, color 200ms ease` na nav | Sem transição na nav e na troca de página | Ação repetida e de teclado: não anima |
| Assistente entra com `wiz-in` 240 ms | Diálogo: `opacity` + `scale(.98→1)` 200 ms ease-out; sai em 140 ms | Saída mais rápida que a entrada |
| Prefers-reduced-motion zera tudo | Mantém só opacity (≤120 ms) e tira transform | Reduzido não quer dizer zero: o fade ajuda a entender o que mudou |
| Nenhum feedback de toque | `:active { transform: scale(.97) }` em botões, 100 ms | O botão confirma o clique |

## Dois pontos que o detector não pega

- Os números das tabelas não usam `tabular-nums` em todo lugar, e a coluna de limites "pula".
- Foco do teclado: os segmentados não mostram anel de foco nos temas escuros. Na 1.0 o anel é `0 0 0 3px var(--accent-soft)` + borda accent, igual em tudo.
