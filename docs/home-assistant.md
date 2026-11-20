# Pitwall no Home Assistant

**Português** · [English](#english)

A partir da 1.2 o Pitwall tem um endereço de **somente leitura** na rede local que o Home Assistant (ou qualquer outra
coisa que faça um GET com token) pode consultar: temperatura da GPU e da CPU, hot spot, FPS, consumo, o jogo aberto…
Dá para montar um painel, ligar um ventilador quando a GPU esquentar, ou registrar o histórico das jogatinas.

Vem **desligado**. Nada sai do PC até você ligar e criar um token.

## 1. Ligar

1. No Pitwall, abra **Celular e TV** e ligue **Ver no celular ou na TV** (é o mesmo servidor da rede, porta 48124).
2. Em **Celular e TV › Integrações**, ligue **API para Home Assistant**.
3. Clique em **Criar token**, dê um nome (ex.: "Home Assistant") e **copie o token na hora**: ele aparece uma vez só.
   O Pitwall guarda só uma impressão (hash SHA-256) dele; se perder, revogue e crie outro.
4. Anote o IP do PC (aparece na mesma tela, ex.: `192.168.0.20`). Vale fixar esse IP no roteador (reserva de DHCP).

Teste no navegador de outro aparelho não funciona (precisa do cabeçalho com o token). Num terminal:

```sh
curl -H "Authorization: Bearer SEU_TOKEN" http://192.168.0.20:48124/api/v1/state
```

Resposta:

```json
{
  "version": "1.2.0",
  "time": "2026-11-19T21:14:05-03:00",
  "game": { "exe": "cyberpunk2077.exe" },
  "values": {
    "gpu.temp":    { "name": "GPU · Núcleo",   "value": 61.2,  "unit": "°C" },
    "gpu.hotspot": { "name": "GPU · Hot spot", "value": 74.5,  "unit": "°C" },
    "cpu.temp":    { "name": "CPU · Package",  "value": 58,    "unit": "°C" },
    "fps.current": { "name": "FPS · FPS",      "value": 141.3, "unit": "fps" },
    "gpu.power":   { "name": "GPU · Consumo",  "value": 286.4, "unit": "W" }
  }
}
```

- `values` traz as métricas que este PC tem (os ids são os mesmos da tela de métricas e do CSV). `value: null` = sem
  leitura agora (ex.: FPS fora de jogo). Temperaturas sempre em °C (o Home Assistant converte se você usa °F).
- `game` é `null` fora de jogo.
- Os valores são os do último ciclo de leitura do Pitwall (o pedido não lê sensor nenhum a mais).

## 2. configuration.yaml

Guarde o token em `secrets.yaml`:

```yaml
# secrets.yaml
pitwall_token: "Bearer SEU_TOKEN"
```

E em `configuration.yaml`, **um** recurso REST com vários sensores (o Home Assistant faz um pedido só por ciclo):

```yaml
rest:
  - resource: http://192.168.0.20:48124/api/v1/state
    scan_interval: 10
    timeout: 5
    headers:
      Authorization: !secret pitwall_token
    sensor:
      - name: "PC GPU temperatura"
        unique_id: pitwall_gpu_temp
        value_template: "{{ value_json['values']['gpu.temp']['value'] if 'gpu.temp' in value_json['values'] else none }}"
        unit_of_measurement: "°C"
        device_class: temperature
        state_class: measurement
      - name: "PC GPU hot spot"
        unique_id: pitwall_gpu_hotspot
        value_template: "{{ value_json['values']['gpu.hotspot']['value'] if 'gpu.hotspot' in value_json['values'] else none }}"
        unit_of_measurement: "°C"
        device_class: temperature
        state_class: measurement
      - name: "PC CPU temperatura"
        unique_id: pitwall_cpu_temp
        value_template: "{{ value_json['values']['cpu.temp']['value'] if 'cpu.temp' in value_json['values'] else none }}"
        unit_of_measurement: "°C"
        device_class: temperature
        state_class: measurement
      - name: "PC FPS"
        unique_id: pitwall_fps
        value_template: "{{ value_json['values']['fps.current']['value'] if 'fps.current' in value_json['values'] else none }}"
        unit_of_measurement: "fps"
        state_class: measurement
      - name: "PC GPU consumo"
        unique_id: pitwall_gpu_power
        value_template: "{{ value_json['values']['gpu.power']['value'] if 'gpu.power' in value_json['values'] else none }}"
        unit_of_measurement: "W"
        device_class: power
        state_class: measurement
      - name: "PC jogo"
        unique_id: pitwall_game
        value_template: "{{ value_json.game.exe if value_json.game else 'nenhum' }}"
```

Os `if ... in value_json['values']` deixam o sensor "desconhecido" em vez de dar erro quando o PC não tem aquela leitura
(ex.: hot spot nas RTX 50, que a NVIDIA tirou). Reinicie o Home Assistant (ou recarregue "Entidades REST") depois de salvar.
Com o PC desligado os sensores ficam "indisponíveis" — é o esperado.

Exemplo de automação (avisar quando o hot spot passar de 100 °C):

```yaml
automation:
  - alias: "GPU quente"
    trigger:
      - platform: numeric_state
        entity_id: sensor.pc_gpu_hot_spot
        above: 100
        for: "00:00:30"
    action:
      - service: notify.notify
        data:
          message: "Hot spot da GPU em {{ states('sensor.pc_gpu_hot_spot') }} °C"
```

## 3. Segurança

- **Só na rede local**, pela porta do "Ver no celular ou na TV" (48124). Não abra essa porta no roteador para a internet.
  O tráfego é HTTP sem criptografia, como o resto da visualização na rede: use em rede de confiança.
- **Somente leitura**: o endereço só devolve leituras. Não muda configuração, não ajusta GPU, não mexe em jogo.
- **Desligado por padrão** e só funciona com "Ver no celular ou na TV" **e** "API para Home Assistant" ligados; desligado,
  responde 404.
- **Token por integração**: 256 bits aleatórios, guardado só como hash. Token errado conta no mesmo limite do pareamento
  (5 erros em 1 min bloqueiam o IP por 5 min). O token do Home Assistant **não** abre a tela do PC no navegador, e o token do
  celular **não** vale na API.
- **Revogar**: em Celular e TV › Integrações, o token aparece com o ícone de chave → **Revogar**. Para de
  funcionar na hora.
- A resposta não tem nome do PC, usuário, pastas nem nada do que está no seu disco: só as leituras e o nome do executável do
  jogo aberto.

---

## English

Since 1.2 Pitwall has a **read-only** endpoint on your local network that Home Assistant (or anything that can do an
authenticated GET) can poll: GPU/CPU temperature, hot spot, FPS, power, the running game… It is **off by default**.

### Enable it

1. In Pitwall open **Phone & TV** and turn on **View on phone or TV** (same LAN server, port 48124).
2. In **Phone & TV › Integrations**, turn on **Home Assistant API**.
3. Click **Create token**, name it, and **copy it right away**: it is shown only once (Pitwall keeps only its SHA-256 hash).
4. Note the PC's IP (shown on the same screen) and ideally reserve it in your router.

```sh
curl -H "Authorization: Bearer YOUR_TOKEN" http://192.168.0.20:48124/api/v1/state
```

The response is `{ version, time, game: { exe } | null, values: { "<metricId>": { name, value, unit } } }`; `value: null`
means no reading right now; temperatures are always °C; values come from Pitwall's last read cycle (no extra sensor reads).

### configuration.yaml

Use the same `rest:` block as above (one resource, several sensors via `value_template`), with
`pitwall_token: "Bearer YOUR_TOKEN"` in `secrets.yaml`. The `if ... in value_json['values']` guards keep a sensor
"unknown" instead of failing when the PC doesn't have that reading (e.g. hot spot on RTX 50 cards, which NVIDIA removed).

### Security

- **LAN only** (port 48124, plain HTTP like the rest of the LAN view). Do not forward this port to the internet.
- **Read-only**: it only returns readings; nothing can be changed through it.
- **Off by default**; requires both "View on phone or TV" and "Home Assistant API", otherwise it answers 404.
- **Per-integration token**: 256 random bits, stored only as a hash; wrong tokens share the pairing rate limit (5 failures
  per minute block the IP for 5 minutes). Integration tokens **cannot** open the LAN view (WebSocket) and phone tokens
  **cannot** be used on the API.
- **Revoke** it in Phone & TV › Integrations (key icon → Revoke); it stops working immediately.
- No machine name, user name or file paths in the response: only readings and the running game's executable name.
