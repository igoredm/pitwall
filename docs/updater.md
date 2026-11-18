# Atualizador

O Pitwall roda como administrador, então o atualizador é tratado como a parte mais sensível do app: ele baixa um
executável da internet e o executa elevado. Este documento descreve o fluxo, cada verificação e como publicar uma versão.

Código: `src/Pitwall/Update/` (`UpdateService`, `ReleaseClient`, `Authenticode`, `UpdateFolder`, `SemVer`) e
`src/Pitwall/Ui/UpdateTray.cs` (menu e balões da bandeja).

## Configuração

`config.json` (`%APPDATA%\Pitwall`):

```json
"update": {
  "autoCheck": true,          // verifica 2 min depois de abrir e a cada 24 h
  "channel": "stable",        // "stable" | "beta"
  "skippedVersion": "0.7.1"   // opcional: versão que o usuário mandou pular
}
```

- **stable**: só releases publicadas que não são pré-lançamento (nem rascunho).
- **beta**: inclui pré-lançamentos (tags `vX.Y.Z-beta.N`). Quem está no beta recebe a estável assim que ela sair,
  porque `0.8.0` > `0.8.0-beta.3` pela ordem SemVer.
- Com `autoCheck: false` nada é consultado sozinho; "Verificar atualizações" na bandeja continua funcionando.
- A versão pulada não gera aviso automático, mas uma verificação manual mostra ela de novo. Uma versão mais nova avisa normalmente.

## Fluxo

```
idle ──(timer ou "Verificar")──> checking ──> available ──("Atualizar agora" / "ao sair")──> downloading ──> ready ──> instalador
                                     │                                                          │
                                     └──> idle (nada novo)        error <──(qualquer verificação falhou: arquivo apagado)┘
```

1. **Verificação**: `GET https://api.github.com/repos/igoredm/pitwall/releases?per_page=30`, com `User-Agent: Pitwall-Updater`
   e nada mais (sem cookies, sem token, sem identificador da máquina, sem versão do Windows). Pega a maior versão
   SemVer do canal que seja maior que a atual. A versão atual vem do `AssemblyInformationalVersion` (que o CI preenche
   com a tag).
2. **Aviso**: balão na bandeja (uma vez por versão por execução) e item "Atualização: Pitwall X" no menu, com
   *Atualizar agora*, *Atualizar ao sair* e *Pular esta versão*. A interface web recebe o mesmo estado.
3. **Download** só depois do consentimento: "Atualizar agora" ou "Atualizar ao sair".
4. **Instalação**:
   - *Agora*: se houver jogo detectado, espera ele fechar (+15 s, caso o launcher reabra outro exe) e só então instala.
     O instalador é iniciado com `/VERYSILENT /SUPPRESSMSGBOXES /NORESTART /RESTARTAPPLICATIONS /LOG=...` e o app fecha
     normalmente (restaurando o ajuste da GPU). O instalador espera o mutex `Global\Pitwall.SingleInstance` sumir (até 15 s,
     depois `taskkill`), instala e reabre o app porque recebeu `/RESTARTAPPLICATIONS` (ver `RestartAfterSilentUpdate` no `.iss`).
   - *Ao sair*: o download acontece em segundo plano; quando o usuário sai do app, o instalador roda sem reabrir o Pitwall.
     Se houver um jogo aberto na hora de sair, a atualização fica para a próxima vez.
   - **Nunca** instala com jogo detectado.

## Verificações de segurança (nesta ordem)

| # | Verificação | Por quê |
|---|---|---|
| 1 | Só HTTPS, porta padrão, sem userinfo. API só em `api.github.com`; downloads só em `github.com`, `objects.githubusercontent.com`, `release-assets.githubusercontent.com`. Redirecionamentos são seguidos à mão (no máximo 5) e **cada salto** é conferido. | Um redirecionamento ou URL na resposta da API não leva o app para outro host. |
| 2 | A tag precisa ser SemVer; o asset precisa se chamar exatamente `Pitwall-Setup-<versão>.exe` e a URL precisa ser `https://github.com/igoredm/pitwall/releases/download/<tag>/<nome>`. Uma tag de pré-lançamento marcada como estável no GitHub não entra no canal estável. | Nada de assets de outro repositório ou de outra release. |
| 3 | Limites de tamanho: resposta da API ≤ 4 MB, `SHA256SUMS.txt` ≤ 64 KB, instalador ≤ 400 MB **e** igual ao `size` anunciado pela API (aborta se passar). Conexão parada por 60 s é abortada. | Sem estouro de memória/disco por resposta maliciosa ou travada. |
| 4 | O instalador é gravado em `%LOCALAPPDATA%\Pitwall\updates`, pasta com ACL própria sem herança: Administradores e SYSTEM com controle total, o usuário só leitura, dono = Administradores. Se a pasta existir com outra ACL ou for link/junção, é apagada e recriada; se `%LOCALAPPDATA%\Pitwall` for uma junção, a atualização é recusada. | Um processo comum do usuário (sem elevação) não consegue plantar nem trocar o instalador. |
| 5 | **SHA-256** do download igual ao do `SHA256SUMS.txt` da mesma release (comparação em tempo constante). | Garante que o arquivo é o que o CI publicou (sem corrupção nem troca no caminho). |
| 6 | O arquivo é reaberto **só para leitura, sem compartilhar escrita/exclusão**, o caminho real do handle é conferido (`GetFinalPathNameByHandle`) e o SHA-256 é recalculado **a partir desse handle**. O handle fica aberto até o instalador ser iniciado. | Fecha a janela entre verificar e executar: ninguém altera, apaga ou renomeia o arquivo (nem as pastas acima) depois da verificação. |
| 7 | **Authenticode** (`WinVerifyTrust`, revogação na cadeia inteira, sem UI) sobre o handle travado. Se o `Pitwall.exe` em execução é assinado, o instalador **tem** que ter assinatura válida com o **mesmo subject**. Se o build atual não é assinado (hoje), basta o hash e o log registra um aviso; mesmo assim, uma assinatura presente mas quebrada é rejeitada. | Quando as releases forem assinadas, só quem tem o certificado consegue publicar uma atualização aceita. |
| 8 | O instalador é iniciado direto (`UseShellExecute = false`, caminho completo, argumentos fixos). | Nada de associação de arquivo ou parâmetro vindo da rede. |

Qualquer falha descarta o arquivo, mostra `error` e registra o motivo em `%LOCALAPPDATA%\Pitwall\updates\updater.log`
(o log do Inno da última instalação fica em `install.log`, na mesma pasta).

### Limite atual e como fechar

Enquanto as releases não forem assinadas, o `SHA256SUMS.txt` vem **da mesma release** que o instalador: ele protege contra
corrupção e troca no caminho, mas não contra alguém que tenha acesso de escrita às releases do repositório. A proteção
de verdade contra isso é a assinatura (item 7). Para torná-la obrigatória:

1. Assine `Pitwall.exe` e o instalador com o mesmo certificado (ver [signpath.md](signpath.md)).
2. Em `UpdateService.cs`, troque `RequireSignature = false` para `true` e preencha `ExpectedSubject` com o subject do
   certificado (só é usado quando o exe atual não é assinado; com exe assinado, o subject dele é a referência).
3. A primeira versão assinada ainda é aceita pelos clientes antigos (sem assinatura) pelo hash; dali em diante, todo
   cliente assinado exige assinatura igual.

### Notas da release

O campo `notes` é o corpo da release em markdown, truncado em 4000 caracteres. É texto vindo da internet: a interface
deve renderizar com sanitização (o `[innerHTML]` do Angular já sanitiza; não usar `bypassSecurityTrustHtml`).
Links não devem ser abertos a partir do processo elevado (abriria o navegador como administrador).

## Interface (WebSocket)

O estado vai no catálogo (`catalog.update`) e, a cada mudança, numa mensagem própria:

```json
{ "type": "update", "update": {
  "status": "available", "current": "0.7.0", "version": "0.7.1", "channel": "stable",
  "notesUrl": "https://github.com/igoredm/pitwall/releases/tag/v0.7.1", "notes": "## Novidades\n…",
  "progress": 42, "error": "…", "installOnExit": false, "waitingForGame": false, "lastCheck": "2026-11-18T10:00:00-03:00"
} }
```

Mensagens aceitas (tipos em `web/src/app/models.ts`, `UpdateCommand`):

| Mensagem | Efeito |
|---|---|
| `{ "type": "checkUpdate" }` | Verificação manual (mostra também versão pulada). |
| `{ "type": "installUpdate", "when": "now" }` | Baixa, verifica e instala (espera o jogo fechar). |
| `{ "type": "installUpdate", "when": "exit" }` | Baixa e verifica agora; instala ao sair. |
| `{ "type": "skipUpdate" }` | Grava `update.skippedVersion` e descarta o download. |
| `{ "type": "setUpdateChannel", "channel": "beta" }` | Troca o canal e verifica de novo. (`setConfig` com `update.channel` também funciona.) |
| `{ "type": "getUpdate" }` | Responde com a mensagem `update`. |

## Como publicar uma versão

1. Atualize o `<Version>` do `src/Pitwall/Pitwall.csproj` e o padrão do `installer/Pitwall.iss` (só valem para builds locais;
   o CI usa a tag).
2. Crie e envie a tag: `git tag v0.7.1 && git push origin v0.7.1`.
3. O workflow `build` compila, gera `Pitwall-Setup-0.7.1.exe` e `SHA256SUMS.txt` e cria uma **release rascunho** com os dois.
4. Confira a release (notas, assets, hash), edite o texto e clique em **Publish release**. Rascunhos não aparecem para o
   atualizador; a partir da publicação, os clientes veem a versão na próxima verificação (até 24 h, ou na hora pelo menu).
5. Não renomeie os assets nem apague o `SHA256SUMS.txt`: sem os dois com os nomes exatos, a release é ignorada.

### Canal beta

- Tag `vX.Y.Z-beta.N` (ex.: `v0.8.0-beta.1`). O workflow marca como pré-lançamento qualquer tag com `-`.
- Só quem escolheu o canal beta recebe. Ordem: `0.8.0-beta.1` < `0.8.0-beta.2` < `0.8.0-rc.1` < `0.8.0`.
- Para promover: crie a tag estável `v0.8.0` (novo build); não desmarque "pre-release" de uma beta — o atualizador
  ignora no canal estável uma tag com sufixo de pré-lançamento mesmo assim.
