# winget (rascunho)

Manifestos do pacote `igoredm.Pitwall` para o [winget-pkgs](https://github.com/microsoft/winget-pkgs), no formato de
pasta que o repositório usa (`manifests/i/igoredm/Pitwall/<versão>/`). **Ainda não foram enviados**: só fazem sentido
depois que a release existir e estiver publicada (não rascunho).

| Arquivo | Conteúdo |
|---|---|
| `igoredm.Pitwall.yaml` | versão (`ManifestType: version`) |
| `igoredm.Pitwall.installer.yaml` | instalador Inno, x64, escopo máquina, URL e **hash (placeholder)** |
| `igoredm.Pitwall.locale.en-US.yaml` | nome, descrição, licença, links |

## Enviar uma versão

1. Publique a release `vX.Y.Z` no GitHub (o CI cria o rascunho; ver [docs/updater.md](../../docs/updater.md)).
2. Copie a pasta `0.7.0` para `X.Y.Z` (se for outra versão) e troque `PackageVersion`, `InstallerUrl` e `ReleaseNotesUrl`.
3. `InstallerSha256`: pegue a linha do `Pitwall-Setup-X.Y.Z.exe` no `SHA256SUMS.txt` da release (ou
   `winget hash Pitwall-Setup-X.Y.Z.exe`) e cole em maiúsculas no lugar de `<SHA256_DO_INSTALADOR>`.
4. Valide e teste localmente (num Windows com winget):
   ```powershell
   winget validate --manifest packaging\winget\manifests\i\igoredm\Pitwall\X.Y.Z
   winget settings --enable LocalManifestFiles   # uma vez, como administrador
   winget install --manifest packaging\winget\manifests\i\igoredm\Pitwall\X.Y.Z
   ```
5. Envie ao `microsoft/winget-pkgs`, de um destes jeitos:
   - **wingetcreate** (mais simples): `wingetcreate submit --token <PAT> packaging\winget\manifests\i\igoredm\Pitwall\X.Y.Z`
     — o PAT precisa de `public_repo`; ele cria o fork e o PR.
   - **Manual**: faça fork do `microsoft/winget-pkgs`, copie a pasta para `manifests/i/igoredm/Pitwall/X.Y.Z/` e abra um PR
     (um pacote/versão por PR). Os bots validam o manifesto, instalam numa VM e rodam o SmartScreen/antivírus.
6. Versões seguintes: `wingetcreate update igoredm.Pitwall --version X.Y.Z --urls <url do instalador> --submit`
   aproveita os manifestos já aceitos.

## Observações

- Pré-lançamentos (`-beta.N`) não vão para o winget: ele não tem canal beta.
- O instalador é Inno com `PrivilegesRequired=admin` → `ElevationRequirement: elevatesSelf`; o winget passa
  `/VERYSILENT /SUPPRESSMSGBOXES /NORESTART` sozinho para `InstallerType: inno`. Sem `/RESTARTAPPLICATIONS`, o app não é
  reaberto depois de uma atualização pelo winget.
- O `ProductCode` (`{6F3C1E2A-9B7D-4C1B-A7C4-5E0B2D9A41F7}_is1`) vem do `AppId` do `installer/Pitwall.iss`; não mude o
  `AppId`, ou o winget (e o Windows) passam a ver um programa diferente.
- O instalador hoje não é assinado; a validação do winget-pkgs aceita, mas o SmartScreen pode marcar. Ver
  [docs/signpath.md](../../docs/signpath.md).
- O app tem atualizador próprio; os dois convivem (o winget só vê a versão instalada pelo registro do Inno).
