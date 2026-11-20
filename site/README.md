# Site do Pitwall

Página de divulgação estática (PT-BR, com EN pelo seletor ou pelo idioma do navegador). Sem framework, sem CDN,
sem cookies, sem rastreadores: tudo o que a página carrega está nesta pasta.

## O que tem aqui

| Caminho | O quê |
|---|---|
| `index.html` | a página (o texto em português está no HTML) |
| `assets/css/site.css` | estilos e movimento |
| `assets/js/i18n.js` | textos em inglês e os textos trocados pelo script |
| `assets/js/site.js` | idioma, modo teste, abas do app, entradas ao rolar |
| `assets/fonts/` | Manrope e JetBrains Mono (as mesmas do app), `.woff2` |
| `assets/img/` | pôsteres, capturas e a imagem de compartilhamento (`og.png`, 1200×630) |
| `demo/` | **gerado**: o app Angular (`web/`) compilado, rodando em modo demonstração dentro dos iframes |
| `build.ps1` | regenera `demo/` e `assets/fonts/` |
| `tools/images.py` | regenera `assets/img/`, favicons e `og.png` a partir de `docs/screenshots` e `assets/logo` |

## Atualizar

Depois de mudar o widget ou as configurações em `web/`:

```powershell
cd web; npm ci; cd ..          # só na primeira vez
powershell -ExecutionPolicy Bypass -File site/build.ps1
```

O script compila o Angular com `--base-href ./` numa pasta temporária (não mexe em `web/dist`, que vai para o app)
e copia o resultado para `site/demo`. Quando as capturas em `docs/screenshots` mudarem:
`python site/tools/images.py` (precisa do Pillow).

Para ver localmente: `python -m http.server 8766 --directory site` e abrir `http://localhost:8766`.
Abrir o `index.html` direto do disco (`file://`) não funciona para os iframes.

## Modo teste

Os iframes carregam `demo/index.html?demo=1&…#/widget` (ou `#/settings/monitor`, `#/settings/health`,
`#/settings/sessions`, `#/mobile`). Parâmetros usados pelo site, além dos que já existiam no `web/src/app/demo.ts`
(`theme`, `mode`, `lang`, `scene=idle`, `perfcap`, `appearance`, `update`):

- `heat=warm|hot` — GPU no amarelo / no vermelho
- `fps=anticheat` — FPS bloqueado pelo anti-cheat (o widget mostra o motivo)
- `stutter=1` — picos de frametime a cada 5 s, com o gráfico ligado
- `battery=low` — mouse e headset com bateria baixa

O layout do widget é escolhido pelo tamanho da janela, então o "Tamanho da tela" muda o tamanho real do iframe
(1280×400, 600×600, 320×240, 1920×480, 800×480) e o site só reduz com `transform: scale`. Cada iframe só é criado
quando chega perto da tela e é removido quando sai (e quando a aba fica oculta), para não gastar CPU à toa.

## Publicar

Copie a pasta `site/` inteira para qualquer servidor de arquivos estáticos (Nginx, Apache, GitHub Pages, Netlify,
Cloudflare Pages, um bucket…). Não há código de servidor nem reescrita de rotas; a página funciona em qualquer
subpasta. A pasta `tools/` e este README podem ficar de fora.

O servidor só precisa mandar os tipos MIME certos, o que quase todos já fazem: `.woff2` → `font/woff2`,
`.webp` → `image/webp`, `.webmanifest` → `application/manifest+json`, `.mjs`/`.js` → `text/javascript`.

Domínio: https://pitwall.igoredm.com/ (já no `canonical`, `og:url`, `og:image` e `twitter:image` do `index.html`).
