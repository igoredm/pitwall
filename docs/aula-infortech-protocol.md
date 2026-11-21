# Protocolo de bateria — mouses AULA no "AULA Receiver" (Infortech)

Descoberto em 2026-11-17 a partir do driver web oficial (https://hub.aulacn.com, SDK "InfortechDevice" embutido
no bundle). Verificado num **AULA Kunlun X5 Ultra** (PID do mouse `2F08`) pelo receptor `38A6:28F9`.
Implementado em `tools/battery-patches/aula_infortech.cpp` (driver extra do Battery Hub, ex-WirelessBattery).

## Dispositivos

| Receptor | Notas |
|---|---|
| `38A6:28F9` "AULA Receiver" | verificado |
| `38A6:2F1A` "AULA Receiver" | mesmo SDK no AULA HUB (não testado) |

Modelos (PID do mouse, lido pelo comando `A0`): `28F7` L9, `28FF` SC880 Ultra, `28E7` SC880 MAX, `28E8` X5 MAX,
`2F08` X5 Ultra, `2F10` X5 mini, `2F0C` L5 Ultra, `2EF4` SC900 V2 Ultra, `2EF6` SC900 V2 Master, `2EFE` SC900 V2 Pro,
`2EEE` V9 Ultra+, `2EF2` V9 Ultra, `2F14` X9 Ultra, `2F18` V3 MAX.

## Transporte

- Coleção vendor **`FFA8` / `0002`**, relatórios de 64 bytes.
- Pedido: **relatório de saída `0x0B`** — `[0B][cmd][len][args…]`, completado com zeros.
- Resposta: **relatório de entrada `0x0A`** — `[0A][cmd][len][status][dados…]`; `status == 0` é sucesso.
  O SDK chama `dados` de `getDataSlice` (resposta a partir do índice 3, sem o id do relatório).
- Sem checksum, sem sequência.

## Comandos de leitura usados

| Cmd | Nome no SDK | Pedido | Resposta (`dados`) |
|---|---|---|---|
| `D0` | IsConnectMouse | `0B D0` | `[0]` = 1 se o mouse está ligado ao receptor |
| `A0` | DevGetMouseConfigExt | `0B A0 00` | `[0..1]` VID do mouse, `[2..3]` PID (LE), `[4]` sensor |
| `81` | DevGetInfo | `0B 81 00` | `[1..6]` MAC, `[7..8]` fw receptor, `[9..10]` fw mouse, `[13]` carregando, **`[14]` bateria %**, `[15]` carga completa, `[17]` perfil |

Exemplo real: `0A 81 2F 00 05 8F CF 51 5E 0C D0 40 01 00 02 00 00 00 4C 00 01 01` → bateria `0x4C` = 76%.

## Aviso espontâneo

Tipo `0x80` (DevStateReport): `[2]` subtipo — 1 DPI, 2 polling, 3 perfil, **4 bateria** (`[3]` nível, `[4]` cheia,
`[5]` carregando), 5 workState, 6 conexão.

## Comandos que NÃO devem ser enviados

O SDK tem gravações (`84` botões, `86` config, `88` DPI, `8E` macro, `93` reset de fábrica, `89` pareamento...) e
firmware (`C1` início de atualização, `C2` progresso, `C3` fim). O driver do Pitwall só usa `D0`, `A0` e `81`.
