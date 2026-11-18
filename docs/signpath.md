# Assinatura de código com a SignPath Foundation (rascunho)

Rascunho da inscrição no programa gratuito para projetos open source da SignPath Foundation
(<https://signpath.org>). **Nada foi enviado**: o dono do repositório preenche o formulário com o texto abaixo.

Antes de enviar:

- [ ] Publicar pelo menos uma release (o programa olha o histórico do projeto).
- [ ] Adicionar ao README a seção "Code signing policy" (modelo no fim deste arquivo) — é exigência do programa.
- [ ] Ativar 2FA em todas as contas com acesso de escrita ao repositório.
- [ ] Ativar "Private vulnerability reporting" (Settings → Code security), referenciado no SECURITY.md.

---

## Texto para o formulário (em inglês)

**Project name:** Pitwall

**Repository:** https://github.com/igoredm/pitwall

**License:** MIT (OSI-approved). `tools/battery-patches/` is GPL-3.0 because it modifies a GPL-3.0 program; it is built
as a separate executable. No proprietary components are part of the signed code.

**Project description:**

> Pitwall is a free, open-source hardware monitor for Windows that shows a widget on a secondary monitor while you play:
> FPS, 1% / 0.1% lows, frametime, CPU/GPU temperatures (including GPU hot spot and memory junction), clocks, power, RAM,
> wireless mouse/headset battery, plus a CSV log per game session and optional NVIDIA power-limit tuning.
> It is a lightweight alternative to MSI Afterburner/RTSS (~0.3% CPU) that never touches the game process: there is no
> overlay and no injection; FPS comes from Windows ETW events via Intel's PresentMon. It is built with .NET 10 WinForms
> + WebView2 (Angular UI) and distributed as an Inno Setup installer on GitHub Releases.

**Why signing matters for this project:**

> Pitwall requires administrator rights and ships an installer plus a built-in updater. Today the installer is unsigned,
> so users get SmartScreen warnings and the updater can only verify SHA-256 checksums published in the same release.
> With a signed `Pitwall.exe` and installer, the updater enforces that every update is signed by the same certificate
> (and that the signed binary is a Pitwall installer), which protects users even if release assets were tampered with.

**Why the application needs administrator rights:**

> - CPU and motherboard sensors are read through LibreHardwareMonitor using the signed PawnIO driver (MSR/SMBus access).
> - FPS capture starts a real-time ETW session (PresentMon), which requires elevation.
> - Optional GPU tuning sets the power limit / max clock through NVIDIA's official NVML API (off by default, always restored).
> - "Start with Windows" uses a Task Scheduler task with highest privileges so the app starts elevated without a UAC prompt.
>
> The app has no telemetry. Its only network traffic is the update check against the GitHub Releases API and, after the
> user agrees, the installer download from GitHub. The local WebSocket used by the UI is bound to localhost and requires
> a per-run random token and the app's own origin.

**Build process (reproducible in GitHub Actions):**

> All release artifacts are built by the public workflow `.github/workflows/build.yml` on `windows-latest`:
>
> 1. `actions/checkout`, `setup-node` (Node 24, `npm ci` from the committed lockfile), `setup-dotnet` (.NET 10),
>    MSYS2/MinGW (UCRT64) and Inno Setup from Chocolatey.
> 2. `installer/fetch-deps.ps1` downloads third-party binaries at pinned versions and verifies them (below).
> 3. `installer/build-battery.ps1` compiles WirelessBattery from a pinned, reviewed commit with our patch.
> 4. `installer/build.ps1` builds the Angular UI, runs `dotnet publish` (self-contained, win-x64, ReadyToRun, version
>    taken from the git tag) and compiles the Inno Setup script.
> 5. SHA-256 checksums are generated, and a `v*` tag creates a **draft** release; a maintainer reviews and publishes it.
>
> No artifacts are built on developer machines. npm dependencies come from the committed `package-lock.json`; NuGet packages are pinned to exact versions in the csproj.
> The signing step would run in the same workflow, between "Build installer" and the release job.

**Third-party binaries bundled in the installer and how they are verified:**

| Component | Source | Verification | License |
|---|---|---|---|
| PresentMon 2.6.0 (console) | github.com/GameTechDev/PresentMon release | pinned SHA-256 in `fetch-deps.ps1` | MIT |
| PawnIO 2.2.0 setup | github.com/namazso/PawnIO.Setup release | pinned SHA-256; official signed installer, run unmodified | GPL-2.0 / LGPL |
| WebView2 Evergreen bootstrapper | go.microsoft.com (Microsoft) | Authenticode signature must be valid and issued to Microsoft Corporation | Microsoft |
| WirelessBattery | built in CI from reviewed commit `958a60a` + our patches (AULA driver; network code and PATH lookup removed) | source pinned by commit hash; source zip + diff shipped (GPL) | GPL-3.0 |
| HeadsetControl 4.3.0 | github.com/Sapd/HeadsetControl release | pinned SHA-256 (upstream PGP signature checked when the pin was set) | GPL-3.0 |
| LibreHardwareMonitorLib 0.9.6, WebView2 SDK | NuGet | NuGet package signatures | MPL-2.0 / Microsoft |

> We only request signing for our own files (`Pitwall.exe`, `Pitwall.dll` and the installer). Third-party
> executables keep their original signatures, or are left unsigned if upstream does not sign them; they are not
> re-signed with the Foundation certificate.

**What should be signed:** `Pitwall.exe` (and `Pitwall.dll`) inside the publish folder, then
`Pitwall-Setup-<version>.exe`.

**Team / roles:** igoredm, sole maintainer: author, reviewer and release approver.

---

## Passo no GitHub Actions (comentado)

A SignPath assina um artefato já enviado ao GitHub Actions. O ideal são duas etapas — primeiro o `Pitwall.exe`/`Pitwall.dll`
do publish, depois o instalador gerado com eles — mas para começar basta assinar o instalador. Colar no `build.yml`
quando o projeto for aprovado:

```yaml
#      # --- Assinatura (SignPath Foundation) ---
#      # Requer:
#      #   secrets.SIGNPATH_API_TOKEN        token de um usuário "CI" da organização na SignPath (com permissão de submitter)
#      #   vars.SIGNPATH_ORGANIZATION_ID     id da organização na SignPath
#      # e, na SignPath: projeto "pitwall", política "release-signing", configuração de artefato "installer"
#      # (um zip com Pitwall-Setup-*.exe dentro, assinando o .exe com Authenticode).
#
#      - name: Upload installer (unsigned) for signing
#        id: unsigned
#        uses: actions/upload-artifact@v4
#        with:
#          name: unsigned-installer
#          path: artifacts/installer/Pitwall-Setup-*.exe
#
#      - name: Sign installer (SignPath)
#        if: startsWith(github.ref, 'refs/tags/v')
#        uses: signpath/github-action-submit-signing-request@v1
#        with:
#          api-token: ${{ secrets.SIGNPATH_API_TOKEN }}
#          organization-id: ${{ vars.SIGNPATH_ORGANIZATION_ID }}
#          project-slug: pitwall
#          signing-policy-slug: release-signing
#          artifact-configuration-slug: installer
#          github-artifact-id: ${{ steps.unsigned.outputs.artifact-id }}
#          wait-for-completion: true
#          wait-for-completion-timeout-in-seconds: 3600
#          output-artifact-directory: artifacts/installer
#
#      # Os checksums precisam ser gerados DEPOIS da assinatura (o hash muda): mover o passo "Checksums" para cá.
```

Depois que a primeira release assinada existir:

1. Conferir a assinatura: `Get-AuthenticodeSignature .\Pitwall-Setup-X.Y.Z.exe` (Status `Valid`, signer "SignPath Foundation").
2. Em `src/Pitwall/Update/UpdateService.cs`: `RequireSignature = true` e `ExpectedSubject` = subject do certificado
   (ver [updater.md](updater.md)). A partir dessa versão, o atualizador só aceita instaladores assinados.

---

## Modelo da seção para o README

```markdown
## Code signing policy

Free code signing provided by [SignPath.io](https://about.signpath.io), certificate by [SignPath Foundation](https://signpath.org).

- Committers and reviewers: [igoredm](https://github.com/igoredm)
- Approvers: [igoredm](https://github.com/igoredm)

Every signed release is built by GitHub Actions from this repository. Third-party programs bundled in the installer
keep their own signatures (see installer/THIRD-PARTY-NOTICES.txt).

Privacy: this program does not transfer any information to other networked systems unless specifically requested by
the user, except for the update check against the GitHub Releases API (no user data is sent), which can be turned off in
the settings.
```
