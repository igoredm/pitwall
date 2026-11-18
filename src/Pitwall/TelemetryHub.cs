using Pitwall.Localization;
using System.Security.Principal;
using System.Text.Json;
using System.Text.Json.Nodes;
using Pitwall.Battery;
using Pitwall.Config;
using Pitwall.Fps;
using Pitwall.Games;
using Pitwall.Gpu;
using Pitwall.Logging;
using Pitwall.Metrics;
using Pitwall.Sensors;
using Pitwall.Server;

namespace Pitwall;

/// <summary>Loop principal: lê sensores + FPS, detecta jogo, publica no WebSocket e grava o CSV.</summary>
public sealed class TelemetryHub : IDisposable
{
    readonly ConfigStore _config;
    readonly SensorService _sensors;
    readonly PresentMonService _presentMon;
    readonly GameDetector _games;
    readonly GpuTuner _tuner;
    readonly BatteryService _battery;
    readonly SessionStore _sessions = new();
    readonly CsvLogger _log = new();
    readonly WsServer _ws;
    readonly CancellationTokenSource _cts = new();
    readonly Dictionary<string, double?> _values = [];
    /// <summary>Métricas de texto (unit "text"), ex.: gpu.perfcap.</summary>
    readonly Dictionary<string, string?> _texts = [];
    readonly List<MetricDefinition> _definitions;
    readonly HashSet<string> _available;
    readonly HashSet<string> _optionalIds;
    string[] _logColumns = [];
    long _graphCursor;

    public event Action<GameInfo?>? GameChanged;
    /// <summary>"Compacto no canto superior direito" (tela de configurações).</summary>
    public event Action<string>? PlaceTopRightRequested;
    /// <summary>Só em Debug: permite reiniciar o app a partir do dev tooling (o processo é elevado).</summary>
#pragma warning disable CS0067 // disparado só em Debug
    public event Action? QuitRequested;
#pragma warning restore CS0067
    public GameInfo? CurrentGame { get; private set; }
    public string? LogPath => _log.CurrentPath;

    public TelemetryHub(ConfigStore config, SensorService sensors, PresentMonService presentMon, GpuTuner tuner, BatteryService battery)
    {
        _tuner = tuner;
        _battery = battery;
        _config = config;
        _sensors = sensors;
        _presentMon = presentMon;
        _games = new GameDetector(presentMon);

        _definitions = [.. MetricCatalog.Static, .. sensors.DynamicDefinitions];
        _available = sensors.AvailableIds();
        _optionalIds = sensors.OptionalIds.ToHashSet();
        if (presentMon.Available)
            foreach (var d in MetricCatalog.Static.Where(d => d.Group == MetricGroup.Fps)) _available.Add(d.Id);
        if (tuner.ClockReasonsMask() != null) _available.Add("gpu.perfcap");

        var dynamicMissing = sensors.DynamicDefinitions.Where(d => config.Current.Metrics.All(m => m.Id != d.Id)).ToList();
        if (dynamicMissing.Count > 0) config.Update(c => MetricCatalog.EnsureSettings(c, dynamicMissing));

        ApplyActive(config.Current);

        _ws = new WsServer(config.Current.WebSocketPort)
        {
            OnConnect = () => [CatalogMessage(), ConfigMessage(), SessionsMessage()],
            OnMessage = HandleMessage,
        };
        config.Changed += c =>
        {
            ApplyActive(c);
            if (_lang != L.Lang) { _lang = L.Lang; _ws.Broadcast(CatalogMessage()); }
            _ws.Broadcast(ConfigMessage());
        };
    }

    string _lang = L.Lang;

    public int Port => _ws.Port;

    /// <summary>
    /// Log = tudo que o hardware principal (CPU/GPU/RAM/FPS) expõe, visível ou não no widget,
    /// + os "Outros" (discos, placa-mãe, rede) que estiverem habilitados — esses só são lidos quando ativos.
    /// </summary>
    void ApplyActive(AppConfig c)
    {
        var enabled = c.Metrics.Where(m => m.Enabled).Select(m => m.Id).ToHashSet();
        _sensors.SetActive(enabled);
        _logColumns = _definitions
            .Where(d => _available.Contains(d.Id) && d.Unit != "graph")
            .Where(d => !_optionalIds.Contains(d.Id) || enabled.Contains(d.Id))
            .Select(d => d.Id)
            .ToArray();
    }

    public void Start()
    {
        _ws.Start();
        new Thread(Loop) { IsBackground = true, Name = "Telemetry", Priority = ThreadPriority.BelowNormal }.Start();
    }

    void Loop()
    {
        var cleanupAt = Environment.TickCount64 + 30_000;
        while (!_cts.IsCancellationRequested)
        {
            var started = Environment.TickCount64;
            var cfg = _config.Current;
            try
            {
                Tick(cfg);
            }
            catch (Exception ex)
            {
                _ws.Broadcast(JsonSerializer.Serialize(new { type = "error", message = ex.Message }));
            }
            if (started > cleanupAt)
            {
                _presentMon.CleanupStale();
                cleanupAt = started + 30_000;
            }
            var wait = Math.Max(50, cfg.RefreshMs - (int)(Environment.TickCount64 - started));
            _cts.Token.WaitHandle.WaitOne(wait);
        }
        _sessions.End(CurrentGame);
    }

    void Tick(AppConfig cfg)
    {
        _sensors.Read(_values);
        if (_available.Contains("gpu.perfcap"))
            _texts["gpu.perfcap"] = _tuner.ClockReasonsMask() is { } mask ? ClockReasons.Map(mask, _values.GetValueOrDefault("gpu.load")) : null;

        var game = _games.Update(cfg.Games);
        if (game?.Pid != CurrentGame?.Pid)
        {
            _sessions.End(CurrentGame);
            _sessions.Start(game);
            _log.Rotate(game?.Exe);
            CurrentGame = game;
            GameChanged?.Invoke(game);
            _ws.Broadcast(SessionsMessage());
        }

        _tuner.Update(cfg.GpuTuning, game != null);

        var stats = game != null ? _presentMon.Get(game.Pid) : null;
        var fps = stats?.Snapshot();
        var has = fps is { HasData: true };
        _values["fps.current"] = has ? fps!.Value.Current : null;
        _values["fps.frametime"] = has ? fps!.Value.FrametimeMs : null;
        _values["fps.low1"] = has ? fps!.Value.Low1 : null;
        _values["fps.low01"] = has ? fps!.Value.Low01 : null;
        _values["fps.avg"] = has ? fps!.Value.SessionAvg : null;
        _values["fps.displayed"] = has ? fps!.Value.Displayed : null;

        _log.Write(cfg.Log, _logColumns, _values, _texts, game?.Exe);

        var values = new JsonObject();
        foreach (var (k, v) in _values)
            values[k] = v is { } d && double.IsFinite(d) ? Math.Round(d, 2) : null;
        var texts = new JsonObject();
        foreach (var (k, v) in _texts) texts[k] = v;

        var msg = new JsonObject
        {
            ["type"] = "snapshot",
            ["t"] = DateTimeOffset.Now.ToUnixTimeMilliseconds(),
            ["game"] = game == null ? null : new JsonObject { ["exe"] = game.Exe, ["mode"] = game.Mode },
            ["values"] = values,
            ["texts"] = texts,
            ["presentMonError"] = _presentMon.Available ? null : _presentMon.LastError,
            ["fpsStatus"] = _presentMon.StatusText,
            ["batteries"] = cfg.Battery.Enabled ? JsonSerializer.SerializeToNode(_battery.Devices, ConfigStore.Json) : null,
            ["tuning"] = JsonSerializer.SerializeToNode(_tuner.Status, ConfigStore.Json),
            ["log"] = _log.CurrentPath == null ? null : new JsonObject
            {
                ["file"] = Path.GetFileName(_log.CurrentPath),
                ["size"] = _log.CurrentSize,
            },
        };

        // Gráfico de frametime: frametimes reais de cada frame desde o último snapshot
        if (stats != null && cfg.Metrics.Any(m => m.Id == "fps.graph" && m.Enabled))
        {
            var frames = new JsonArray();
            foreach (var f in stats.FramesSince(ref _graphCursor, 600)) frames.Add(Math.Round(f, 2));
            msg["frames"] = frames;
        }

        _ws.Broadcast(msg.ToJsonString());
    }

    string CatalogMessage()
    {
        var screens = Screen.AllScreens;
        return JsonSerializer.Serialize(new
        {
            type = "catalog",
            lang = L.Lang,
            version = typeof(TelemetryHub).Assembly.GetName().Version?.ToString(3),
            admin = new WindowsPrincipal(WindowsIdentity.GetCurrent()).IsInRole(WindowsBuiltInRole.Administrator),
            presentMon = _presentMon.Available,
            battery = _battery.Available,
            hardware = new { cpu = _sensors.CpuName, gpu = _sensors.GpuName, gpu2 = _sensors.Gpu2Name },
            tuning = _tuner.Caps,
            tuningPresets = new[] { "balanced", "cool" }.ToDictionary(p => p, p =>
            {
                var (pp, cp) = GpuTuner.Preset(p);
                return new { powerW = _tuner.Caps.PowerDefaultW * pp / 100, clockMhz = _tuner.Caps.MaxClockMhz * cp / 100 / 15 * 15 };
            }),
            monitors = screens.Select((s, i) => new
            {
                device = s.DeviceName,
                index = i + 1,
                x = s.Bounds.X,
                y = s.Bounds.Y,
                width = s.Bounds.Width,
                height = s.Bounds.Height,
                primary = s.Primary,
            }),
            metrics = _definitions.Select(d => new
            {
                id = d.Id,
                group = d.Group.ToString().ToLowerInvariant(),
                name = L.MetricName(d),
                unit = d.Unit,
                isTemperature = d.IsTemperature,
                available = _available.Contains(d.Id),
                source = d.Group == MetricGroup.Fps ? (_presentMon.Available ? "PresentMon (ETW)" : null)
                    : d.Id == "gpu.perfcap" ? (_available.Contains(d.Id) ? "NVML (clocks event reasons)" : null)
                    : _sensors.SourceOf(d.Id),
                defaultWarn = d.DefaultWarn,
                defaultCrit = d.DefaultCrit,
            }),
        }, ConfigStore.Json);
    }

    string ConfigMessage() => JsonSerializer.Serialize(new { type = "config", config = _config.Current }, ConfigStore.Json);

    string SessionsMessage() => JsonSerializer.Serialize(new { type = "sessions", sessions = _sessions.Recent }, ConfigStore.Json);

    string? HandleMessage(string raw)
    {
        try
        {
            var node = JsonNode.Parse(raw);
            switch (node?["type"]?.GetValue<string>())
            {
                case "setConfig":
                    var cfg = node["config"].Deserialize<AppConfig>(ConfigStore.Json);
                    if (cfg != null)
                    {
                        // Posição/tamanho da janela são do host; não deixar um config antigo da página sobrescrever.
                        var cur = _config.Current.Widget;
                        if (cfg.Widget.Monitor == cur.Monitor)
                            (cfg.Widget.X, cfg.Widget.Y, cfg.Widget.Width, cfg.Widget.Height) = (cur.X, cur.Y, cur.Width, cur.Height);
                        if (!LogFolderAllowed(cfg.Log.Folder)) cfg.Log.Folder = _config.Current.Log.Folder;
                        _config.Replace(cfg);
                    }
                    return null;
                case "placeTopRight":
                    PlaceTopRightRequested?.Invoke(node["layout"]?.GetValue<string>() == "mid" ? "mid" : "compact");
                    return null;
                case "refreshBatteries":
                    _battery.RefreshNow();
                    return null;
                case "restoreDefaults":
                    _config.RestoreDefaults();
                    return null;
                case "getState":
                    return CatalogMessage();
#if DEBUG
                case "quit":
                    QuitRequested?.Invoke();
                    return null;
#endif
            }
        }
        catch (Exception ex)
        {
            return JsonSerializer.Serialize(new { type = "error", message = ex.Message });
        }
        return null;
    }

    /// <summary>O processo é elevado: não deixa a config apontar o log para pastas do sistema ou de rede.</summary>
    internal static bool LogFolderAllowed(string? folder)
    {
        if (string.IsNullOrWhiteSpace(folder) || !Path.IsPathFullyQualified(folder) || folder.StartsWith(@"\\")) return false;
        var full = Path.GetFullPath(folder).TrimEnd('\\') + "\\";
        string[] blocked =
        [
            Environment.GetFolderPath(Environment.SpecialFolder.Windows),
            Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),
            Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86),
            Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
        ];
        return !blocked.Where(b => b.Length > 0).Any(b => full.StartsWith(b.TrimEnd('\\') + "\\", StringComparison.OrdinalIgnoreCase));
    }

    public void Dispose()
    {
        _cts.Cancel();
        _sessions.End(CurrentGame);
        _ws.Dispose();
        _log.Dispose();
    }
}
