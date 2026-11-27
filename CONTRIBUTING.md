# Contribuindo · Contributing

## Português

- **Bugs**: abra uma issue com o modelo "Bug" e anexe o dump de sensores (bandeja → *Listar sensores detectados…*).
- **Ideias**: modelo "Pedido de recurso". Para mudanças grandes, abra a issue antes do PR.
- **Segurança**: nunca em issue pública — veja [SECURITY.md](SECURITY.md).
- **Build**: veja a seção *Building* do [README](README.md) (.NET 10, Node 24, Inno Setup 6).
- **Regras do projeto**:
  - Leve: o app tem que ficar abaixo de ~1% de CPU. Nada de polling apertado.
  - Todo texto visível passa por `L.T("pt", "en")` (backend) ou `i18n.ts` (frontend).
  - Comentários em português.
  - Nada que toque no processo do jogo (sem injeção, sem overlay).
  - Binários de terceiros: versão fixa e verificada (hash ou assinatura) em `installer/fetch-deps.ps1`.
  - O app roda como administrador: trate toda entrada (config, WebSocket, rede, arquivos) como não confiável.
- PRs pequenos e focados; descreva como testou (hardware, jogo, tema).
- Ao contribuir, você concorda em licenciar sua contribuição sob a [licença MIT](LICENSE).
  Mudanças no leitor de bateria (GPL-3.0) vão no nosso fork:
  [igoredm/Wireless-Device-Battery-Monitor](https://github.com/igoredm/Wireless-Device-Battery-Monitor/tree/pitwall).

## English

- **Bugs**: open an issue with the "Bug" template and attach the sensor dump (tray → *List detected sensors…*).
- **Ideas**: "Feature request" template. For big changes, open an issue before the PR.
- **Security**: never in a public issue — see [SECURITY.md](SECURITY.md).
- **Build**: see *Building* in the [README](README.md) (.NET 10, Node 24, Inno Setup 6).
- **Project rules**:
  - Lightweight: the app must stay under ~1% CPU. No tight polling.
  - Every user-visible string goes through `L.T("pt", "en")` (backend) or `i18n.ts` (frontend).
  - Code comments are in Portuguese.
  - Nothing touches the game process (no injection, no overlay).
  - Third-party binaries: pinned and verified (hash or signature) in `installer/fetch-deps.ps1`.
  - The app runs as administrator: treat every input (config, WebSocket, network, files) as untrusted.
- Keep PRs small and focused; describe how you tested (hardware, game, theme).
- By contributing you agree to license your contribution under the [MIT license](LICENSE).
  Changes to the battery reader (GPL-3.0) go to our fork:
  [igoredm/Wireless-Device-Battery-Monitor](https://github.com/igoredm/Wireless-Device-Battery-Monitor/tree/pitwall).
