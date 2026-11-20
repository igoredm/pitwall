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

/// <summary>Um tick da telemetria: lê sensores e FPS, troca de sessão, grava o CSV e monta o snapshot.</summary>
public sealed partial class TelemetryHub
{
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

    // Motivos do limite de clock da última sessão (mostrados fora de jogo); atualizado só quando uma sessão termina
    (string Exe, Dictionary<string, double> Sec)? _lastReasons;
    bool _peaksOn;

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
            _stats = game != null ? new SessionStatsAccumulator(features.Stutters) : null;
            _statsCursor = 0;
            _sessionSavedAt = now;
            if (game != null)
            {
                var (gpuName, cpuName) = (_sensors.GpuName, _sensors.CpuName);
                _sessions.UpdateOpen(s => { s.Gpu = gpuName; s.Cpu = cpuName; });
            }
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
        _values["fps.animError"] = has ? fps!.Value.AnimErrorMs : null;
        _values["fps.pcLatency"] = has ? fps!.Value.PcLatencyMs : null;
        if (_stats != null) _stats.CountStutters = features.Stutters;
        _values["fps.stutters"] = game != null ? _stats?.Stutters : null;
        // Sem FPS: o motivo vai em texts (a página mostra no Monitor e no widget)
        if (FpsReason.For(has, game != null, _presentMon.Available, _admin, _presentMon.Blocked, _presentMon.Healthy, _presentMon.LastError) is { } reason)
            _texts["fps.reason"] = reason;
        else _texts.Remove("fps.reason");

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
        _extremesApp.Add(_values);
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

        // Buffer do Relatório do PC (com ou sem jogo): desligado = nada na memória nem no disco
        if (features.CrashReport) _health.Tick(_values, game != null ? _sessions.Open : null, _log.CurrentPath is { } p ? Path.GetFileName(p) : null, now);
        else if (_health.Active) _health.Stop();

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

        // 1.2: mín/máx desde que o app abriu (Monitor): só o que mudou, no máximo a cada 5 s
        if (now - _extremesAppSentAt >= 5_000 && _extremesApp.TakeChanges() is { } appChanged)
        {
            _extremesAppSentAt = now;
            msg["extremesApp"] = JsonSerializer.SerializeToNode(appChanged.Values);
        }

        // Gráfico de frametime: frametimes reais de cada frame desde o último snapshot
        if (stats != null && cfg.Metrics.Any(m => m.Id == "fps.graph" && m.Enabled))
        {
            var frames = new JsonArray();
            foreach (var f in stats.FramesSince(ref _graphCursor, 600)) frames.Add(Math.Round(f, 2));
            msg["frames"] = frames;
        }

        _ws.Broadcast(msg.ToJsonString());

        // Home Assistant: guarda só uma cópia dos valores (o JSON é montado quando alguém pede)
        _apiSnapshot = cfg.Remote is { Enabled: true, ApiEnabled: true }
            ? new ApiSnapshot(DateTimeOffset.Now, game?.Exe, new(_values), new(_texts))
            : null;

        // Celular: o mesmo snapshot sem nome de arquivo, ajuste da GPU nem sugestão de jogo
        if (_remote.HasClients)
        {
            msg.Remove("log");
            msg.Remove("tuning");
            msg.Remove("gameSuggestion");
            msg.Remove("extremesApp");
            (msg["profile"] as JsonObject)?.Remove("tuningPreset");
            _remote.Broadcast(msg.ToJsonString());
        }
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
}
