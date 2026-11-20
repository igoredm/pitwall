using Pitwall.Localization;
using System.Security.Principal;
using System.Text.Json;
using System.Text.Json.Nodes;
using Pitwall.Battery;
using Pitwall.Config;
using Pitwall.Fps;
using Pitwall.Games;
using Pitwall.Gpu;
using Pitwall.Health;
using Pitwall.Logging;
using Pitwall.Metrics;
using Pitwall.Native;
using Pitwall.Sensors;
using Pitwall.Server;

namespace Pitwall;

/// <summary>Celular/TV na rede local: servidor remoto, pareamento, aparelhos e a API do Home Assistant.</summary>
public sealed partial class TelemetryHub
{
    readonly PairingManager _pairing = new();
    readonly RemoteServer _remote;
    readonly Lock _remoteGate = new();
    int _remoteWanted = -1;

    /// <summary>Liga/desliga o servidor da rede e a regra do firewall quando Remote.Enabled/Port mudam (netsh fora da thread de telemetria).</summary>
    void ApplyRemote(RemoteConfig r)
    {
        var want = r.Enabled ? r.Port : 0;
        lock (_remoteGate)
        {
            if (want == _remoteWanted) return;
            _remoteWanted = want;
        }
        _ = Task.Run(() =>
        {
            lock (_remoteGate)
            {
                if (want != _remoteWanted) return; // mudou de novo enquanto esperava
                if (want == 0)
                {
                    _remote.Stop();
                    _pairing.Cancel();
                    Firewall.Remove();
                }
                else if (_remote.Start(want)) Firewall.Add(want);
            }
            _ws.Broadcast(CatalogMessage());
        });
    }

    /// <summary>Config sanitizada para o celular: só aparência e métricas (sem pastas, ajuste da GPU, jogos ou celulares).</summary>
    string RemoteConfigMessage()
    {
        var c = _config.Current;
        return JsonSerializer.Serialize(new
        {
            type = "config",
            config = new
            {
                refreshMs = c.RefreshMs,
                appTheme = c.AppTheme,
                widgetTheme = c.WidgetTheme,
                themeMode = c.ThemeMode,
                accent = c.Accent,
                language = c.Language,
                groupLabels = c.GroupLabels,
                widget = new { layout = c.Widget.Layout },
                battery = new { enabled = c.Battery.Enabled, hidden = c.Battery.Hidden, lowPercent = c.Battery.LowPercent },
                metrics = c.Metrics,
            },
        }, ConfigStore.Json);
    }

    /// <summary>Celulares/TVs pareados (sem hash), com "visto por último" e se estão conectados agora.
    /// <paramref name="paired"/> = id do que acabou de parear.</summary>
    string DevicesMessage(string? paired = null)
    {
        var online = _remote.OnlineDeviceIds();
        return JsonSerializer.Serialize(new
        {
            type = "devices",
            paired,
            devices = _config.Current.Remote.PairedDevices.Select(d => new
            {
                id = d.Id,
                name = d.Name,
                created = d.Created,
                lastSeen = d.LastSeen,
                kind = d.Kind,
                online = online.Contains(d.Id),
            }),
        }, ConfigStore.Json);
    }

    /// <summary>Intervalo mínimo entre gravações do "visto por último" enquanto conectado.</summary>
    const long LastSeenEveryMs = 60_000;
    long _lastSeenAt;

    /// <summary>
    /// Atualiza o "visto por último" (sem reenviar a config: a página vê isso na mensagem devices).
    /// Lista nova com cópias: o servidor da rede lê a lista atual em outra thread.
    /// </summary>
    void TouchDevices(IReadOnlySet<string> ids)
    {
        if (ids.Count == 0) return;
        var now = DateTime.Now;
        _config.UpdateQuiet(c => c.Remote.PairedDevices = [.. c.Remote.PairedDevices.Select(d => ids.Contains(d.Id)
            ? new PairedDevice { Id = d.Id, Name = d.Name, TokenHash = d.TokenHash, Created = d.Created, LastSeen = now, Kind = d.Kind }
            : d)]);
    }

    string StartPairing()
    {
        var r = _config.Current.Remote;
        string Fail(string error) => JsonSerializer.Serialize(new { type = "pairing", ok = false, error, message = _remote.LastError }, ConfigStore.Json);
        if (!r.Enabled) return Fail("disabled");
        if (!_remote.Running) return Fail("notRunning");
        var ips = RemoteServer.LanAddresses();
        if (ips.Count == 0) return Fail("noNetwork");
        var (code, expires) = _pairing.Start(DateTime.UtcNow);
        var urls = ips.Select(ip => $"http://{ip}:{_remote.Port}{RemoteServer.MobilePath}?pair={code}").ToList();
        // Para digitar na TV/celular sem câmera: endereço curto (a raiz redireciona para a tela de código)
        var typeUrls = ips.Select(ip => $"http://{ip}:{_remote.Port}/").ToList();
        return JsonSerializer.Serialize(new { type = "pairing", ok = true, code, expiresAt = expires, url = urls[0], urls, typeUrl = typeUrls[0], typeUrls }, ConfigStore.Json);
    }

    // ---- 1.2: Home Assistant (token e GET /api/v1/state) ----

    sealed record ApiSnapshot(DateTimeOffset Time, string? GameExe, Dictionary<string, double?> Values, Dictionary<string, string?> Texts);
    volatile ApiSnapshot? _apiSnapshot;
    readonly System.Collections.Concurrent.ConcurrentDictionary<string, long> _apiSeenAt = new();

    /// <summary>createApiToken: token mostrado uma vez; aqui fica só o SHA-256 (aparelho kind "integration").</summary>
    string CreateApiToken(JsonNode node)
    {
        string? name = null;
        try { name = node["name"]?.GetValue<string>(); } catch { }
        if (_config.Current.Remote.PairedDevices.Count(d => d.Kind == DeviceKind.Integration) >= StateApi.MaxTokens)
            return JsonSerializer.Serialize(new
            {
                type = "error",
                message = L.T($"Limite de {StateApi.MaxTokens} tokens de integração. Revogue um para criar outro.",
                    $"Limit of {StateApi.MaxTokens} integration tokens. Revoke one to create another."),
            });
        var (token, device) = StateApi.NewToken(name, DateTime.Now);
        _config.Update(c => c.Remote.PairedDevices = [.. c.Remote.PairedDevices, device]);
        _ws.Broadcast(DevicesMessage());
        return JsonSerializer.Serialize(new
        {
            type = "apiToken",
            token,
            device = new { id = device.Id, name = device.Name, created = device.Created, kind = device.Kind, online = false },
        }, ConfigStore.Json);
    }

    /// <summary>Corpo do GET /api/v1/state (thread do servidor da rede): só o que o último tick já leu.</summary>
    string StateJson()
    {
        var snap = _apiSnapshot;
        var values = new List<StateValue>();
        if (snap != null)
            foreach (var d in _definitions)
            {
                if (d.Unit == "graph" || !_available.Contains(d.Id)) continue;
                var name = $"{GroupName(d.Group)} · {L.MetricName(d)}";
                if (d.Unit == "text")
                {
                    if (snap.Texts.TryGetValue(d.Id, out var t)) values.Add(new StateValue(d.Id, name, null, t, d.Unit));
                }
                else if (snap.Values.TryGetValue(d.Id, out var v)) values.Add(new StateValue(d.Id, name, v, null, d.Unit));
            }
        return StateApi.Build(typeof(TelemetryHub).Assembly.GetName().Version?.ToString(3), snap?.Time ?? DateTimeOffset.Now,
            snap?.GameExe, values).ToJsonString();
    }

    /// <summary>"Visto por último" do token de API, no máximo 1x/min por aparelho.</summary>
    void TouchApiDevice(string id)
    {
        var now = Environment.TickCount64;
        var last = _apiSeenAt.GetOrAdd(id, 0);
        if (last != 0 && now - last < LastSeenEveryMs) return;
        _apiSeenAt[id] = now;
        TouchDevices(new HashSet<string> { id });
    }
}
