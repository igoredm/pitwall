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
using Pitwall.Native;
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

    // Sessão: mín/máx por métrica, estatísticas e alertas de vermelho
    readonly MetricExtremes _extremes = new();
    readonly AlertTracker _alerts = new();
    SessionStatsAccumulator? _stats;
    long _statsCursor;
    long _lastTickMs;
    long _extremesSentAt;
    long _sessionSavedAt;

    // Relatório de crash: buffer dos últimos 60 s (em disco durante o jogo) e o relatório detectado ao abrir
    readonly CrashRing _ring = new();
    volatile CrashReport? _crashReport;
    /// <summary>Relatório pendente (null com features.crashReport desligado).</summary>
    public CrashReport? PendingCrashReport => _crashFeature ? _crashReport : null;
    volatile bool _crashFeature;
    int _crashDetectStarted;
    /// <summary>Relatório de crash detectado ao abrir (thread de fundo).</summary>
    public event Action<CrashReport>? CrashReportDetected;

    public event Action<GameInfo?>? GameChanged;
    /// <summary>Métrica no vermelho por 5 s ou mais (título, texto). Disparado na thread de telemetria.</summary>
    public event Action<string, string>? AlertRaised;
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
            // Mín/máx desligado (features.sessionPeaks): nem a mensagem completa vai
            OnConnect = () => _config.Current.Features.SessionPeaks
                ? [CatalogMessage(), ConfigMessage(), SessionsMessage(), ExtremesMessage()]
                : [CatalogMessage(), ConfigMessage(), SessionsMessage()],
            OnMessage = HandleMessage,
        };
        // Celular na rede local: servidor separado, somente leitura, com dados sanitizados
        _remote = new RemoteServer(() => _config.Current.Remote.PairedDevices, _pairing)
        {
            OnAuthenticated = () => [CatalogMessage(remote: true), RemoteConfigMessage()],
        };
        _remote.Paired += d =>
        {
            // Lista nova em vez de Add: o servidor da rede pode estar lendo a antiga em outra thread.
            // O "devices" vai no Authenticated logo depois (aí o aparelho já conta como online).
            _config.Update(c => c.Remote.PairedDevices = [.. c.Remote.PairedDevices, d]);
        };
        _remote.Authenticated += (id, paired) =>
        {
            TouchDevices(new HashSet<string> { id });
            _ws.Broadcast(DevicesMessage(paired ? id : null));
        };
        _remote.Disconnected += _ => _ws.Broadcast(DevicesMessage());

        _crashFeature = config.Current.Features.CrashReport;
        _peaksOn = config.Current.Features.SessionPeaks;
        RefreshLastReasons();
        _retentionKey = RetentionKey(config.Current.Log);
        config.Changed += c =>
        {
            ApplyActive(c);
            // Relatório de crash ligado/desligado: some/volta no catálogo (e, se ainda não rodou, a detecção roda agora)
            if (c.Features.CrashReport != _crashFeature)
            {
                _crashFeature = c.Features.CrashReport;
                if (_crashFeature && Interlocked.Exchange(ref _crashDetectStarted, 1) == 0) _ = Task.Run(DetectCrash);
                _ws.Broadcast(CatalogMessage());
            }
            // Mudou a retenção (ou a pasta): roda de novo daqui a pouco, sem esperar o ciclo diário
            var key = RetentionKey(c.Log);
            if (key != _retentionKey)
            {
                _retentionKey = key;
                Interlocked.Exchange(ref _retentionAt, Environment.TickCount64 + RetentionDebounceMs);
            }
            if (_lang != L.Lang)
            {
                _lang = L.Lang;
                _ws.Broadcast(CatalogMessage());
                if (_remote.HasClients) _remote.Broadcast(CatalogMessage(remote: true));
            }
            _ws.Broadcast(ConfigMessage());
            if (_remote.HasClients) _remote.Broadcast(RemoteConfigMessage());
            ApplyRemote(c.Remote);
        };
    }

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

    string _lang = L.Lang;

    public int Port => _ws.Port;

    /// <summary>Atualizador (Update/UpdateService): estado no catálogo e mensagens próprias no WebSocket.</summary>
    public Update.UpdateService? Updater { get; set; }
    public void Broadcast(string json) => _ws.Broadcast(json);

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
        // Relatório de crash desligado: nem olha o sessions.json/log do Windows (roda se for ligado depois)
        if (_config.Current.Features.CrashReport && Interlocked.Exchange(ref _crashDetectStarted, 1) == 0) _ = Task.Run(DetectCrash);
        ApplyRemote(_config.Current.Remote);
    }

    /// <summary>A última sessão não terminou, ou o Windows registrou Kernel-Power 41 depois dela?</summary>
    void DetectCrash()
    {
        try
        {
            var last = _sessions.LastAtStartup;
            if (last == null) return;
            var kp41 = CrashDetector.LastKernelPower41(last.Start);
            var report = CrashDetector.Detect(last, CrashRing.Load(), kp41, CrashDetector.DismissedSessionStart());
            if (report == null) return;
            _crashReport = report;
            _ws.Broadcast(CatalogMessage());
            if (_crashFeature) CrashReportDetected?.Invoke(report);
        }
        catch { }
    }

    /// <summary>Próxima limpeza de logs (TickCount64). Antecipada quando a config de retenção muda.</summary>
    long _retentionAt = Environment.TickCount64 + 15_000;
    string _retentionKey;
    /// <summary>Espera depois de mudar a retenção (o usuário pode estar clicando entre as opções).</summary>
    const long RetentionDebounceMs = 5_000;

    static string RetentionKey(LogConfig l) => $"{l.KeepDays}|{l.MaxTotalMb}|{l.Folder}";

    void Loop()
    {
        var cleanupAt = Environment.TickCount64 + 30_000;
        // Retenção de logs: logo depois de abrir (o CSV atual já existe), 1x por dia e ~5 s depois de mudar a config
        while (!_cts.IsCancellationRequested)
        {
            var retentionAt = Interlocked.Read(ref _retentionAt);
            if (Environment.TickCount64 > retentionAt)
            {
                Interlocked.CompareExchange(ref _retentionAt, Environment.TickCount64 + 24 * 3600_000L, retentionAt);
                var logCfg = _config.Current.Log;
                var keep = RetentionProtected();
                _ = Task.Run(() => { try { LogRetention.Run(logCfg, keep); } catch { } });
            }
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
            // "Visto por último" dos aparelhos conectados: no máximo 1x por minuto
            if (started - _lastSeenAt >= LastSeenEveryMs)
            {
                _lastSeenAt = started;
                if (_remote.HasClients) TouchDevices(_remote.OnlineDeviceIds());
            }
            var wait = Math.Max(50, cfg.RefreshMs - (int)(Environment.TickCount64 - started));
            _cts.Token.WaitHandle.WaitOne(wait);
        }
        EndSession();
    }

    readonly GameSuggester _suggester = new();

    /// <summary>"Marcar como jogo?": olha o processo em foco (em janela, apresentando frames).</summary>
    void UpdateSuggestion(AppConfig cfg, GameInfo? game, long now)
    {
        var fg = Win32.GetForegroundWindow();
        Win32.GetWindowThreadProcessId(fg, out var pid);
        string? exe = null;
        var ok = false;
        if (pid != 0 && pid != Environment.ProcessId && _presentMon.Get((int)pid) is { } s)
        {
            exe = s.Application;
            ok = !Win32.IsFullscreen(fg, out _) && s.CurrentFps() >= GameSuggester.MinFps;
        }
        _suggester.Update(exe, ok, game?.Exe, cfg.Games, now);
    }

    /// <summary>Arquivos que a retenção nunca apaga: o atual e o da sessão mais recente.</summary>
    List<string?> RetentionProtected() =>
        [_log.CurrentPath, _sessions.Recent.FirstOrDefault(s => s.CsvFile != null)?.CsvFile, _crashReport?.CsvFile];

    /// <summary>Fecha a sessão aberta gravando as estatísticas finais.</summary>
    void EndSession()
    {
        var stats = _stats;
        var csv = _log.CurrentPath;
        _sessions.End(CurrentGame, s =>
        {
            try
            {
                stats?.ApplyTo(s, DateTime.Now);
                if (csv != null) s.CsvFile ??= Path.GetFileName(csv);
            }
            catch { }
        });
        RefreshLastReasons();
    }

    // Motivos do limite de clock da última sessão (mostrados fora de jogo); atualizado só quando uma sessão termina
    (string Exe, Dictionary<string, double> Sec)? _lastReasons;
    bool _peaksOn;
    bool _ringDirty;

    void RefreshLastReasons()
    {
        var last = _sessions.Recent.FirstOrDefault();
        _lastReasons = last?.ClockReasonSec is { Count: > 0 } sec ? (last.Exe, sec) : null;
    }

    /// <summary>snapshot.clockReasons: segundos por motivo na sessão atual (live) ou, fora de jogo, na última.</summary>
    JsonObject? ClockReasonsNode(GameInfo? game) =>
        ClockReasonsNode(game?.Exe, _stats?.ClockReasonSeconds(), _lastReasons?.Exe, _lastReasons?.Sec);

    /// <summary>Regra pura (testável): em jogo, a sessão atual (live); fora, a última sessão que tem dados; senão null.</summary>
    internal static JsonObject? ClockReasonsNode(string? gameExe, Dictionary<string, double>? liveSec, string? lastExe, Dictionary<string, double>? lastSec)
    {
        var (exe, sec, live) = gameExe != null ? (gameExe, liveSec, true) : (lastExe, lastSec, false);
        if (exe == null || sec == null) return null;
        return new JsonObject { ["live"] = live, ["exe"] = exe, ["sec"] = JsonSerializer.SerializeToNode(sec) };
    }

    void Tick(AppConfig cfg)
    {
        var features = cfg.Features;
        _sensors.Read(_values);
        // Motivo do limite de clock: desligado = nenhuma consulta ao NVML e nada em texts
        string? clockReason = null;
        if (features.ClockReason && _available.Contains("gpu.perfcap"))
        {
            clockReason = _tuner.ClockReasonsMask() is { } mask ? ClockReasons.Map(mask, _values.GetValueOrDefault("gpu.load")) : null;
            _texts["gpu.perfcap"] = clockReason;
        }
        else _texts.Remove("gpu.perfcap");

        var now = Environment.TickCount64;
        var dt = _lastTickMs == 0 ? 0 : Math.Clamp((now - _lastTickMs) / 1000.0, 0, 5);
        _lastTickMs = now;

        var game = _games.Update(cfg.Games);
        if (game?.Pid != CurrentGame?.Pid)
        {
            EndSession();
            _sessions.Start(game);
            _log.Rotate(game?.Exe);
            CurrentGame = game;
            _stats = game != null ? new SessionStatsAccumulator() : null;
            _statsCursor = 0;
            _sessionSavedAt = now;
            _ring.Reset();
            if (game != null)
            {
                _extremes.Reset();
                _extremesSentAt = 0;
            }
            GameChanged?.Invoke(game);
            _ws.Broadcast(SessionsMessage());
        }

        // Perfil do jogo: vale só enquanto ele roda; ao sair, volta a config geral (o GpuTuner desfaz com o marcador de crash)
        var profile = game != null ? cfg.Games.ProfileFor(game.Exe) : null;
        _tuner.Update(GameProfiles.EffectiveTuning(cfg.GpuTuning, profile, game != null), game != null);

        // "Marcar como jogo?" desligado: nem olha a janela em foco
        if (features.GameSuggestions) UpdateSuggestion(cfg, game, now);
        else if (_suggester.Suggestion != null) _suggester.Clear();

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

        // Mín/máx: ligar/desligar zera (o epoch novo faz a página descartar o que tinha)
        if (features.SessionPeaks != _peaksOn)
        {
            _peaksOn = features.SessionPeaks;
            _extremes.Reset();
            _extremesSentAt = 0;
            if (_peaksOn) _ws.Broadcast(ExtremesMessage());
        }
        if (_peaksOn) _extremes.Add(_values);
        if (_stats != null)
        {
            if (stats != null) _stats.AddFrames(stats.FramesSince(ref _statsCursor, 16_384));
            _stats.AddTick(_values, cfg.Metrics, dt);
            _stats.AddClockReason(clockReason, dt);
            if (now - _sessionSavedAt > 30_000)
            {
                _sessionSavedAt = now;
                var csv = _log.CurrentPath;
                _sessions.UpdateOpen(s =>
                {
                    _stats.ApplyTo(s, DateTime.Now);
                    if (csv != null) s.CsvFile ??= Path.GetFileName(csv);
                });
            }
        }
        CheckAlerts(cfg, now);

        // Buffer do relatório de crash: desligado = nada na memória nem no disco
        if (features.CrashReport && game != null && _sessions.Open is { } open)
        {
            _ring.Sample(_values, now);
            _ring.PersistIfDue(open, _log.CurrentPath is { } p ? Path.GetFileName(p) : null, now);
            _ringDirty = true;
        }
        else if (_ringDirty)
        {
            _ring.Reset();
            _ringDirty = false;
        }

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
            ["profile"] = profile == null ? null : new JsonObject
            {
                ["exe"] = game!.Exe,
                ["tuningPreset"] = profile.TuningPreset,
                ["layout"] = profile.Layout,
            },
            ["gameSuggestion"] = _suggester.Suggestion is { } sug ? new JsonObject { ["exe"] = sug } : null,
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

        // Segundos por motivo do limite de clock: sessão atual (ao vivo) ou a última
        if (features.ClockReason && ClockReasonsNode(game) is { } reasons) msg["clockReasons"] = reasons;

        // Mín/máx da sessão: só o que mudou, no máximo 1x por segundo
        if (_peaksOn && now - _extremesSentAt >= 1_000 && _extremes.TakeChanges() is { } changed)
        {
            _extremesSentAt = now;
            msg["extremes"] = new JsonObject
            {
                ["epoch"] = changed.Epoch,
                ["values"] = JsonSerializer.SerializeToNode(changed.Values),
            };
        }

        // Gráfico de frametime: frametimes reais de cada frame desde o último snapshot
        if (stats != null && cfg.Metrics.Any(m => m.Id == "fps.graph" && m.Enabled))
        {
            var frames = new JsonArray();
            foreach (var f in stats.FramesSince(ref _graphCursor, 600)) frames.Add(Math.Round(f, 2));
            msg["frames"] = frames;
        }

        _ws.Broadcast(msg.ToJsonString());

        // Celular: o mesmo snapshot sem nome de arquivo, ajuste da GPU nem sugestão de jogo
        if (_remote.HasClients)
        {
            msg.Remove("log");
            msg.Remove("tuning");
            msg.Remove("gameSuggestion");
            (msg["profile"] as JsonObject)?.Remove("tuningPreset");
            _remote.Broadcast(msg.ToJsonString());
        }
    }

    /// <param name="remote">Versão do celular: sem ajuste da GPU, monitores, relatório de crash nem estado do servidor.</param>
    string CatalogMessage(bool remote = false)
    {
        var screens = Screen.AllScreens;
        var node = JsonSerializer.SerializeToNode(new
        {
            type = "catalog",
            lang = L.Lang,
            version = typeof(TelemetryHub).Assembly.GetName().Version?.ToString(3),
            admin = new WindowsPrincipal(WindowsIdentity.GetCurrent()).IsInRole(WindowsBuiltInRole.Administrator),
            presentMon = _presentMon.Available,
            battery = _battery.Available,
            hardware = new { cpu = _sensors.CpuName, gpu = _sensors.GpuName, gpu2 = _sensors.Gpu2Name },
            crashReport = _crashFeature ? _crashReport : null,
            remote = new { running = _remote.Running, port = _remote.Running ? _remote.Port : (int?)null, error = _remote.LastError },
            tuning = _tuner.Caps,
            update = Updater?.State,
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
        }, ConfigStore.Json)!.AsObject();
        // Sobre: componente ausente vai como null explícito (o resto do catálogo omite nulls)
        node["about"] = JsonSerializer.SerializeToNode(AboutInfo.Current, AboutJson);
        if (remote)
            foreach (var key in new[] { "admin", "crashReport", "remote", "tuning", "tuningPresets", "monitors", "update", "about" }) node.Remove(key);
        return node.ToJsonString(ConfigStore.Json);
    }

    static readonly JsonSerializerOptions AboutJson = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };

    /// <summary>Config para a página local. Os hashes dos tokens dos celulares não saem do backend.</summary>
    string ConfigMessage()
    {
        var config = JsonSerializer.SerializeToNode(_config.Current, ConfigStore.Json)!;
        if (config["remote"]?["pairedDevices"] is JsonArray devices)
            foreach (var d in devices) (d as JsonObject)?.Remove("tokenHash");
        return new JsonObject { ["type"] = "config", ["config"] = config }.ToJsonString(ConfigStore.Json);
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

    string SessionsMessage() => JsonSerializer.Serialize(new { type = "sessions", sessions = _sessions.Recent }, ConfigStore.Json);

    /// <summary>getSessions → sessionsPage (só para quem pediu).</summary>
    string SessionsPageMessage(JsonNode node)
    {
        var offset = Int(node["offset"]) ?? 0;
        var limit = Int(node["limit"]) ?? SessionStore.MaxPageSize;
        string? exe = null;
        try { exe = node["exe"]?.GetValue<string>(); } catch { }
        var (total, sessions) = _sessions.Page(offset, limit, exe);
        return JsonSerializer.Serialize(new { type = "sessionsPage", total, offset = Math.Max(0, offset), sessions }, ConfigStore.Json);
    }

    /// <summary>
    /// getLogStats → logStats (só para quem pediu): uso da pasta de logs e o que a retenção apagaria com os valores dados
    /// (ausentes = os da config). Nada é apagado aqui.
    /// </summary>
    string LogStatsMessage(JsonNode node)
    {
        var log = _config.Current.Log;
        var keepDays = Int(node["keepDays"]) is { } k ? ConfigStore.SnapKeepDays(k) : log.KeepDays;
        var maxTotalMb = Int(node["maxTotalMb"]) is { } m ? Math.Clamp(m, 0, 1_000_000) : log.MaxTotalMb;
        var stats = LogRetention.Stats(LogRetention.ListFiles(log.Folder), DateTime.UtcNow, keepDays, maxTotalMb * 1024L * 1024L,
            RetentionProtected());
        return JsonSerializer.Serialize(new
        {
            type = "logStats",
            totalBytes = stats.TotalBytes,
            files = stats.Files,
            oldest = stats.OldestUtc?.ToLocalTime(),
            wouldDeleteFiles = stats.WouldDeleteFiles,
            wouldDeleteBytes = stats.WouldDeleteBytes,
        }); // sem ConfigStore.Json: oldest vai como null explícito
    }

    /// <summary>Número inteiro de um campo JSON (aceita 30 ou 30.0); ausente/inválido = null.</summary>
    static int? Int(JsonNode? n)
    {
        try
        {
            if (n is not JsonValue v) return null;
            if (v.TryGetValue<int>(out var i)) return i;
            if (v.TryGetValue<double>(out var d) && double.IsFinite(d)) return (int)Math.Clamp(Math.Round(d), int.MinValue, int.MaxValue);
        }
        catch { }
        return null;
    }

    /// <summary>Mín/máx completos (cliente recém-conectado); depois disso vão só as mudanças no snapshot.</summary>
    string ExtremesMessage()
    {
        var (epoch, values) = _extremes.Snapshot();
        return JsonSerializer.Serialize(new { type = "extremes", epoch, values });
    }

    void CheckAlerts(AppConfig cfg, long now)
    {
        if (!cfg.Alerts.Enabled)
        {
            _alerts.Clear();
            return;
        }
        var interval = cfg.Alerts.MinIntervalMin * 60_000L;
        var sustain = Math.Clamp(cfg.Alerts.SustainSec, 1, 120);
        foreach (var s in cfg.Metrics)
        {
            if (s.Crit == null || !_alerts.Step(s.Id, _values.GetValueOrDefault(s.Id), s.Crit, now, interval, sustain * 1000L)) continue;
            var def = _definitions.FirstOrDefault(d => d.Id == s.Id);
            if (def == null) continue;
            var name = $"{GroupName(def.Group)} · {(string.IsNullOrWhiteSpace(s.Label) ? L.MetricName(def) : s.Label)}";
            var value = _values.GetValueOrDefault(s.Id) ?? 0;
            var crit = s.Crit.Value;
            var unit = def.Unit is "fps" or "text" or "graph" ? "" : " " + def.Unit;
            if (def.IsTemperature && s.Unit == "F") { value = value * 9 / 5 + 32; crit = crit * 9 / 5 + 32; unit = " °F"; }
            AlertRaised?.Invoke(
                L.T($"{name} no vermelho", $"{name} in the red"),
                L.T($"{value:0.#}{unit} há mais de {sustain} s (limite {crit:0.#}{unit}).", $"{value:0.#}{unit} for over {sustain} s (limit {crit:0.#}{unit})."));
        }
    }

    static string GroupName(MetricGroup g) => g switch
    {
        MetricGroup.Fps => "FPS",
        MetricGroup.Gpu => "GPU",
        MetricGroup.Cpu => "CPU",
        MetricGroup.Ram => "RAM",
        _ => L.T("Outros", "Other"),
    };

    string? HandleMessage(string raw)
    {
        try
        {
            var node = JsonNode.Parse(raw);
            if (node != null && Updater?.TryHandle(node, out var updateReply) == true) return updateReply;
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
                        ConfigStore.Sanitize(cfg);
                        if (!LogFolderAllowed(cfg.Log.Folder)) cfg.Log.Folder = _config.Current.Log.Folder;
                        // Celulares pareados só mudam por startPairing/revokeDevice, nunca pelo config da página.
                        cfg.Remote.PairedDevices = _config.Current.Remote.PairedDevices;
                        // Tour: cliente antigo que só conhece tutorialDone continua funcionando (tutorialDone = tour.done)
                        ConfigStore.SyncTour(cfg, _config.Current, node["config"]?["tour"] is JsonObject);
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
                case "startPairing":
                    return StartPairing();
                case "listDevices":
                    return DevicesMessage();
                case "revokeDevice":
                {
                    var id = node["id"]?.GetValue<string>();
                    if (string.IsNullOrEmpty(id)) return null;
                    _config.Update(c => c.Remote.PairedDevices = [.. c.Remote.PairedDevices.Where(d => d.Id != id)]);
                    _remote.Disconnect(id);
                    _ws.Broadcast(DevicesMessage());
                    return null;
                }
                case "dismissCrashReport":
                    if (_crashReport is { } report)
                    {
                        CrashDetector.Dismiss(report.Session.Start);
                        _crashReport = null;
                        _ws.Broadcast(CatalogMessage());
                    }
                    return null;
                case "acceptGameSuggestion":
                case "dismissGameSuggestion":
                {
                    // Só vale para a sugestão atual (a página não escolhe um exe qualquer)
                    if (_suggester.Suggestion is not { } exe) return null;
                    var sent = node["exe"]?.GetValue<string>();
                    if (sent != null && !string.Equals(sent, exe, StringComparison.OrdinalIgnoreCase)) return null;
                    var accept = node["type"]!.GetValue<string>() == "acceptGameSuggestion";
                    _suggester.Clear();
                    _config.Update(c =>
                    {
                        var list = accept ? c.Games.Include : c.Games.DismissedSuggestions;
                        if (!list.Contains(exe, StringComparer.OrdinalIgnoreCase)) list.Add(exe);
                    });
                    return null;
                }
                case "testAlert":
                    AlertRaised?.Invoke(L.T("Pitwall · aviso de teste", "Pitwall · test alert"),
                        L.T("É assim que o aviso aparece quando uma métrica fica no vermelho.", "This is how the alert looks when a metric stays in the red."));
                    return null;
                case "replayTutorial":
                    // A página recebe tour = { step: 0, done: false, dismissed: false } (e tutorialDone = false) e abre o tour
                    _config.Update(ConfigStore.ResetTour);
                    return null;
                case "getSessions":
                    return SessionsPageMessage(node);
                case "getLogStats":
                    return LogStatsMessage(node);
                case "resetExtremes":
                    if (!_config.Current.Features.SessionPeaks) return null;
                    _extremes.Reset();
                    _ws.Broadcast(ExtremesMessage());
                    return null;
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
        EndSession();
        _ws.Dispose();
        _remote.Dispose(); // a regra do firewall fica enquanto o recurso estiver ligado; sai ao desligar ou desinstalar
        _log.Dispose();
    }
}
