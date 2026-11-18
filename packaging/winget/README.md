# winget

Manifestos do pacote `igoredm.Pitwall` para o [winget-pkgs](https://github.com/microsoft/winget-pkgs), no mesmo layout de
pasta do repositório (`manifests/i/igoredm/Pitwall/<versão>/`). Schema **1.28.0** (a versão documentada em
`doc/manifest/schema/` do winget-pkgs e a que o komac/wingetcreate geram hoje).

**Status:** `1.0.1` pronto e validado (`winget validate`), **ainda não enviado**. Enviar é decisão do dono do repositório.

| Arquivo (`manifests/i/igoredm/Pitwall/1.0.1/`) | Conteúdo |
|---|---|
| `igoredm.Pitwall.yaml` | versão (`ManifestType: version`), locale padrão `en-US` |
| `igoredm.Pitwall.installer.yaml` | Inno, x64, escopo máquina, `elevationRequired`, URL + SHA-256 da release, `ProductCode` |
| `igoredm.Pitwall.locale.en-US.yaml` | locale padrão: nome, descrição, tags, licença, links, `Moniker: pitwall` |
| `igoredm.Pitwall.locale.pt-BR.yaml` | tradução pt-BR (o `Moniker` só existe no locale padrão) |

## Enviar a 1.0.1

Pré-requisitos: a release `v1.0.1` publicada (não rascunho, não pré-lançamento) e o hash conferido. Na 1.0.1 o
`InstallerSha256` já foi conferido contra o `SHA256SUMS.txt`, o `digest` do asset na API do GitHub e `winget hash` do
arquivo baixado (`AC026FF0…4A16CB`).

1. Valide (não precisa de admin):
   ```powershell
   winget validate --manifest packaging\winget\manifests\i\igoredm\Pitwall\1.0.1
   ```
2. (Opcional) Teste a instalação **só no Windows Sandbox ou numa VM**, nunca na máquina onde o Pitwall já está
   instalado e rodando. O winget-pkgs tem um script para isso:
   ```powershell
   # no clone/fork do winget-pkgs, com o recurso "Windows Sandbox" habilitado
   .\Tools\SandboxTest.ps1 -Manifest <caminho>\packaging\winget\manifests\i\igoredm\Pitwall\1.0.1
   ```
   (Fora do Sandbox, `winget install --manifest` exige `winget settings --enable LocalManifestFiles` como admin.)
3. Envie, de **um** destes jeitos:
   - **wingetcreate** (mais simples; cria o fork e o PR sozinho):
     ```powershell
     winget install Microsoft.WingetCreate
     wingetcreate submit --token <PAT> --prtitle "New package: igoredm.Pitwall version 1.0.1" `
       packaging\winget\manifests\i\igoredm\Pitwall\1.0.1
     ```
     O PAT é um token clássico do GitHub com escopo `public_repo`.
   - **Manual** (fork + PR):
     ```powershell
     gh repo fork microsoft/winget-pkgs --clone; cd winget-pkgs
     git switch -c igoredm.Pitwall-1.0.1
     New-Item -ItemType Directory -Force manifests\i\igoredm\Pitwall\1.0.1
     Copy-Item <Pitwall>\packaging\winget\manifests\i\igoredm\Pitwall\1.0.1\* manifests\i\igoredm\Pitwall\1.0.1\
     git add manifests\i\igoredm\Pitwall\1.0.1
     git commit -m "New package: igoredm.Pitwall version 1.0.1"
     git push -u origin igoredm.Pitwall-1.0.1
     gh pr create -R microsoft/winget-pkgs --title "New package: igoredm.Pitwall version 1.0.1" --fill
     ```
     Um pacote/versão por PR; preencha o checklist do template do PR.
4. No primeiro PR, assine o CLA da Microsoft quando o bot pedir (`Needs-CLA` bloqueia o merge). Depois os bots validam o
   manifesto, baixam o instalador, passam antivírus/SmartScreen e instalam numa VM como usuário padrão. Responda a
   qualquer `Needs-Author-Feedback` em até 5 dias, senão o PR é fechado.

## Riscos na revisão e como mitigar

- **Instalador não assinado.** Não é exigido pelo winget-pkgs, mas um `.exe` novo e sem assinatura tem reputação baixa no
  SmartScreen/Defender. Se aparecer `Binary-Validation-Error` ou `Validation-Defender-Error` (falso positivo), envie o
  arquivo para análise em <https://www.microsoft.com/wdsi/filesubmission> citando o PR e peça `@wingetbot run` depois.
  Esse rótulo não pode ser dispensado por moderador. Mitigação de verdade: assinar (ver [docs/signpath.md](../../docs/signpath.md)).
- **Driver de kernel (PawnIO).** O validador confere que "nenhum serviço suspeito" foi adicionado; o PawnIO cria um
  serviço/driver. Ele é um driver assinado e já existe no próprio winget (`namazso.PawnIO`), o que ajuda,
  mas pode gerar `Validation-Executable-Error`/`Policy-*` e cair para revisão manual de um administrador. Deixe isso
  explícito no texto do PR (para que serve, que é assinado, que só instala se faltar) e no `Description` (já está).
  Não declaramos `Dependencies` para PawnIO/WebView2 porque o instalador já cuida dos dois; declarar faria o winget
  instalá-los de novo por fora.
- **Exige admin.** O Inno usa `PrivilegesRequired=admin` (sempre precisa de elevação, grava em Program Files/HKLM),
  então o manifesto usa `ElevationRequirement: elevationRequired`, como o guia de falhas do winget-pkgs pede para
  instaladores que sempre precisam de admin (`elevatesSelf` é só para instaladores que decidem sozinhos se elevam, e a
  VM de validação roda como usuário padrão: com `elevatesSelf` o UAC travaria a instalação silenciosa).
- **Executável roda como admin / inicia com o Windows.** A tarefa `autostart` vem marcada por padrão e vale também na
  instalação silenciosa. Não viola política, mas pode ser questionado; o app não abre sozinho depois da instalação
  silenciosa (`skipifsilent`), o que é bom para a validação.
- **Atualizador próprio.** Permitido; o winget só enxerga a versão pelo registro do Inno (`ProductCode`
  `{6F3C1E2A-9B7D-4C1B-A7C4-5E0B2D9A41F7}_is1`). Não mude o `AppId` do `installer/Pitwall.iss`, ou o winget (e o
  Windows) passam a ver outro programa.

## Observações

- Pré-lançamentos (`-beta.N`) não vão para o winget: ele não tem canal beta.
- Para `InstallerType: inno` o winget passa `/SP- /VERYSILENT /SUPPRESSMSGBOXES /NORESTART` sozinho (não precisa de
  `InstallerSwitches`). Sem `/RESTARTAPPLICATIONS` o app não é reaberto depois de uma atualização pelo winget.
- O app é publicado self-contained (.NET incluído), então não há dependência de runtime .NET.

## Versões seguintes

Depois que a 1.0.1 for aceita, as próximas versões só precisam de URL e hash novos; o `wingetcreate` reaproveita os
manifestos já publicados:

```powershell
wingetcreate update igoredm.Pitwall --version X.Y.Z `
  --urls https://github.com/igoredm/pitwall/releases/download/vX.Y.Z/Pitwall-Setup-X.Y.Z.exe `
  --release-notes-url https://github.com/igoredm/pitwall/releases/tag/vX.Y.Z `
  --submit --token <PAT>
```

Sem `--submit` ele só gera os arquivos (em `.\manifests\...`), para conferir antes. Atualize também a cópia em
`packaging/winget/manifests/` se quiser manter o histórico aqui.

### Automatizar no CI (NÃO habilitado)

O CI (`.github/workflows/build.yml`) cria a release como rascunho; ela é publicada à mão. Um workflow separado que roda
quando a release é publicada pode abrir o PR no winget-pkgs sozinho. Exige um secret `WINGET_TOKEN` (PAT clássico com
`public_repo`) e um fork de `microsoft/winget-pkgs` na conta `igoredm`. Para habilitar, salve o trecho abaixo
(sem os `#`) como `.github/workflows/winget.yml`. **Só faça isso depois que a primeira versão tiver sido aceita**, porque
as duas opções atualizam um pacote que já existe.

```yaml
# name: winget
#
# on:
#   release:
#     types: [released]          # só releases publicadas e estáveis (ignora rascunho e pré-lançamento)
#
# jobs:
#   # Opção A: action winget-releaser (usa o komac por baixo)
#   winget-releaser:
#     runs-on: windows-latest
#     steps:
#       - uses: vedantmgoyal9/winget-releaser@v2   # em produção, fixe pelo SHA do commit
#         with:
#           identifier: igoredm.Pitwall
#           installers-regex: '^Pitwall-Setup-.*\.exe$'
#           token: ${{ secrets.WINGET_TOKEN }}
#
#   # Opção B: wingetcreate (ferramenta oficial da Microsoft). Use A ou B, não as duas.
#   # wingetcreate:
#   #   runs-on: windows-latest
#   #   steps:
#   #     - name: Atualizar e enviar ao winget-pkgs
#   #       shell: pwsh
#   #       env:
#   #         WINGET_TOKEN: ${{ secrets.WINGET_TOKEN }}
#   #       run: |
#   #         $v = '${{ github.event.release.tag_name }}'.TrimStart('v')
#   #         Invoke-WebRequest https://aka.ms/wingetcreate/latest -OutFile wingetcreate.exe
#   #         .\wingetcreate.exe update igoredm.Pitwall --version $v `
#   #           --urls "https://github.com/igoredm/pitwall/releases/download/v$v/Pitwall-Setup-$v.exe" `
#   #           --release-notes-url "https://github.com/igoredm/pitwall/releases/tag/v$v" `
#   #           --submit --token $env:WINGET_TOKEN
```
