using System.Text.Json;
using Pitwall.Config;
using Pitwall.Fps;
using Pitwall.Games;
using Pitwall.Metrics;

namespace Pitwall.Tests;

public class SessionStatsTests
{
    [Fact]
    public void Histogram_LowsMatchExactCalculation()
    {
        var rnd = new Random(42);
        var frames = Enumerable.Range(0, 50_000).Select(_ => 5 + rnd.NextDouble() * 20 + (rnd.Next(200) == 0 ? 60 : 0)).ToArray();
        var h = new FrametimeHistogram();
        foreach (var f in frames) h.Add(f);
        var sorted = frames.OrderBy(x => x).ToArray();

        Assert.Equal(frames.Length, h.Frames);
        Assert.Equal(frames.Length * 1000.0 / frames.Sum(), h.AvgFps!.Value, 6);
        // Resolução de 0,05 ms: diferença desprezível
        Assert.Equal(FrameStats.Low(sorted, 0.01)!.Value, h.Low(0.01)!.Value, 1);
        Assert.Equal(FrameStats.Low(sorted, 0.001)!.Value, h.Low(0.001)!.Value, 1);
    }

    [Fact]
    public void Histogram_HandlesLongFramesAndTooFew()
    {
        var h = new FrametimeHistogram();
        for (int i = 0; i < 19; i++) h.Add(10);
        Assert.Null(h.Low(0.01));
        h.Add(2_500); // acima de 1 s: balde de estouro, soma exata
        Assert.Equal(1000.0 / 2_500, h.Low(0.01)!.Value, 6);
        h.Add(0);
        h.Add(double.NaN);
        Assert.Equal(20, h.Frames);
    }

    static readonly List<MetricSetting> Settings =
    [
        new() { Id = "gpu.temp", Warn = 80, Crit = 87 },
        new() { Id = "gpu.hotspot", Warn = 95, Crit = 105 },
        new() { Id = "cpu.load" },
    ];

    [Fact]
    public void Accumulator_SecondsAboveThresholdsAndPeaks()
    {
        var acc = new SessionStatsAccumulator();
        void Tick(double temp, double hot, double power, double dt = 1) =>
            acc.AddTick(new Dictionary<string, double?>
            {
                ["gpu.temp"] = temp, ["gpu.hotspot"] = hot, ["gpu.hotspotDelta"] = hot - temp, ["gpu.power"] = power, ["cpu.load"] = 99,
            }, Settings, dt);

        Tick(70, 85, 200);
        Tick(85, 100, 250);
        Tick(85, 100, 260);
        Tick(88, 106, 320);
        Tick(90, 104, 300, dt: 0.5);
        acc.AddFrames(Enumerable.Repeat(10f, 1000).ToArray());

        var start = new DateTime(2026, 11, 18, 20, 0, 0);
        var s = new GameSession { Exe = "game.exe", Start = start, End = start.AddMinutes(10) };
        acc.ApplyTo(s, start.AddHours(5));

        Assert.Equal(600, s.DurationSec);
        Assert.Equal(100, s.AvgFps);
        Assert.Equal(100, s.Low1);
        Assert.Equal(90, s.PeakGpuTemp);
        Assert.Equal(106, s.PeakHotspot);
        Assert.Equal(18, s.PeakHotspotDelta);
        Assert.Equal(320, s.PeakGpuPower);
        Assert.Equal(4, s.SecondsAboveWarn!["gpu.temp"]);   // 85, 85, 88, 90(0,5 s) → 3,5 → arredonda 4
        Assert.Equal(2, s.SecondsAboveCrit!["gpu.temp"]);   // 88 (1 s) + 90 (0,5 s)
        Assert.Equal(4, s.SecondsAboveWarn!["gpu.hotspot"]);
        Assert.Equal(1, s.SecondsAboveCrit!["gpu.hotspot"]);
        Assert.False(s.SecondsAboveWarn.ContainsKey("cpu.load")); // sem limites
    }

    [Fact]
    public void Accumulator_OpenSessionUsesNow()
    {
        var acc = new SessionStatsAccumulator();
        var start = new DateTime(2026, 11, 18, 20, 0, 0);
        var s = new GameSession { Exe = "g.exe", Start = start };
        acc.ApplyTo(s, start.AddSeconds(95));
        Assert.Equal(95, s.DurationSec);
        Assert.Null(s.AvgFps);
        Assert.Null(s.SecondsAboveWarn);
    }

    [Fact]
    public void SessionsJson_BackwardCompatible()
    {
        // sessions.json da 0.6 (só exe/start/end) continua sendo lido
        var old = """[ { "exe": "FC25.exe", "start": "2026-10-22T21:00:00-03:00", "end": "2026-10-22T22:30:00-03:00" }, { "exe": "x.exe", "start": "2026-10-23T10:00:00-03:00" } ]""";
        var list = JsonSerializer.Deserialize<List<GameSession>>(old, ConfigStore.Json)!;
        Assert.Equal(2, list.Count);
        Assert.Null(list[1].End);
        Assert.Null(list[0].AvgFps);

        // e o formato novo mantém os campos antigos com os mesmos nomes; os novos só aparecem quando existem
        var json = JsonSerializer.Serialize(list[0], ConfigStore.Json);
        Assert.Contains("\"exe\"", json);
        Assert.Contains("\"start\"", json);
        Assert.Contains("\"end\"", json);
        Assert.DoesNotContain("avgFps", json);
        list[0].AvgFps = 144;
        list[0].SecondsAboveCrit = new() { ["gpu.hotspot"] = 12 };
        json = JsonSerializer.Serialize(list[0], ConfigStore.Json);
        Assert.Contains("\"avgFps\": 144", json);
        Assert.Contains("\"gpu.hotspot\": 12", json); // chave do dicionário sem camelCase
    }
}

public class ExtremesAndAlertsTests
{
    [Fact]
    public void Extremes_TrackMinMaxAndChanges()
    {
        var e = new MetricExtremes();
        e.Add(new Dictionary<string, double?> { ["a"] = 5, ["b"] = null, ["c"] = double.NaN });
        var first = e.TakeChanges()!.Value;
        Assert.Equal([5, 5], first.Values["a"]);
        Assert.False(first.Values.ContainsKey("b"));
        Assert.False(first.Values.ContainsKey("c"));

        e.Add(new Dictionary<string, double?> { ["a"] = 5 });
        Assert.Null(e.TakeChanges()); // nada mudou → nada no snapshot

        e.Add(new Dictionary<string, double?> { ["a"] = 2 });
        e.Add(new Dictionary<string, double?> { ["a"] = 9.876 });
        Assert.Equal([2, 9.88], e.TakeChanges()!.Value.Values["a"]);

        var epoch = e.Epoch;
        e.Reset();
        Assert.Equal(epoch + 1, e.Epoch);
        Assert.Empty(e.Snapshot().Values);
    }

    [Fact]
    public void Alert_NeedsFiveSecondsAndRespectsInterval()
    {
        var a = new AlertTracker();
        const long interval = 5 * 60_000;
        Assert.False(a.Step("gpu.hotspot", 106, 105, 0, interval));
        Assert.False(a.Step("gpu.hotspot", 107, 105, 4_000, interval));
        Assert.True(a.Step("gpu.hotspot", 107, 105, 5_000, interval));
        Assert.False(a.Step("gpu.hotspot", 107, 105, 6_000, interval)); // já avisou

        // Caiu e voltou: precisa de mais 5 s e do intervalo mínimo
        Assert.False(a.Step("gpu.hotspot", 100, 105, 7_000, interval));
        Assert.False(a.Step("gpu.hotspot", 106, 105, 8_000, interval));
        Assert.False(a.Step("gpu.hotspot", 106, 105, 20_000, interval));
        Assert.True(a.Step("gpu.hotspot", 106, 105, 5_000 + interval, interval));

        // Por métrica: outra métrica não é afetada
        Assert.False(a.Step("gpu.temp", 90, 87, 0, interval));
        Assert.True(a.Step("gpu.temp", 90, 87, 5_000, interval));

        // Sem limite ou sem valor: nunca
        Assert.False(a.Step("x", 1000, null, 0, interval));
        Assert.False(a.Step("x", null, 1, 10_000, interval));
    }
}

public class GamesTests
{
    static GamesConfig Cfg() => new() { Include = ["known.exe"], Ignore = ["Discord.exe"], DismissedSuggestions = ["no.exe"] };

    [Fact]
    public void Suggestion_After60sOfWindowedFrames()
    {
        var s = new GameSuggester();
        var cfg = Cfg();
        for (long t = 0; t < 30_000; t += 500) Assert.Null(s.Update("indie.exe", true, null, cfg, t));
        for (long t = 30_000; t < 33_000; t += 500) Assert.Null(s.Update("indie.exe", false, null, cfg, t)); // pausa curta (alt+tab)
        for (long t = 33_000; t < 60_000; t += 500) Assert.Null(s.Update("indie.exe", true, null, cfg, t));
        Assert.Equal("indie.exe", s.Update("indie.exe", true, null, cfg, 60_000));
        Assert.Equal("indie.exe", s.Suggestion);

        // Aceita (vai para Include): some
        cfg.Include.Add("indie.exe");
        Assert.Null(s.Update("indie.exe", true, null, cfg, 61_000));
    }

    [Fact]
    public void Suggestion_ResetsAfterLongGapAndSkipsKnown()
    {
        var s = new GameSuggester();
        var cfg = Cfg();
        s.Update("indie.exe", true, null, cfg, 0);
        s.Update(null, false, null, cfg, 10_000);
        s.Update(null, false, null, cfg, 20_000); // > 5 s sem: zera
        Assert.Null(s.Update("indie.exe", true, null, cfg, 61_000));
        Assert.Equal("indie.exe", s.Update("indie.exe", true, null, cfg, 121_000));

        var t = new GameSuggester();
        foreach (var exe in new[] { "known.exe", "Discord.exe", "no.exe", "current.exe" })
        {
            t.Update(exe, true, "current.exe", cfg, 0);
            Assert.Null(t.Update(exe, true, "current.exe", cfg, 120_000));
        }
    }

    [Fact]
    public void Profile_TuningOnlyWhileGameRuns()
    {
        var general = new GpuTuningConfig { Enabled = false, Preset = "balanced", PowerLimitW = 250, MaxClockMhz = 1700 };
        var cool = new GameProfile { TuningPreset = "cool" };

        var inGame = GameProfiles.EffectiveTuning(general, cool, gameActive: true);
        Assert.True(inGame.Enabled);
        Assert.Equal("cool", inGame.Preset);

        Assert.Same(general, GameProfiles.EffectiveTuning(general, cool, gameActive: false)); // jogo fechou: volta ao geral
        Assert.Same(general, GameProfiles.EffectiveTuning(general, null, gameActive: true));
        Assert.Same(general, GameProfiles.EffectiveTuning(general, new GameProfile { Layout = "compact" }, true));

        var on = new GpuTuningConfig { Enabled = true, Preset = "cool" };
        Assert.False(GameProfiles.EffectiveTuning(on, new GameProfile { TuningPreset = "off" }, true).Enabled);
        var custom = GameProfiles.EffectiveTuning(general, new GameProfile { TuningPreset = "custom" }, true);
        Assert.Equal((250, 1700), (custom.PowerLimitW, custom.MaxClockMhz));
    }

    [Fact]
    public void ClockReasons_Mapping()
    {
        Assert.Equal("thermal", Pitwall.Gpu.ClockReasons.Map(0x20 | 0x4, 90));
        Assert.Equal("thermal", Pitwall.Gpu.ClockReasons.Map(0x40, 90));
        Assert.Equal("power", Pitwall.Gpu.ClockReasons.Map(0x4, 99));
        Assert.Equal("power", Pitwall.Gpu.ClockReasons.Map(0x8, 99));
        Assert.Equal("sync", Pitwall.Gpu.ClockReasons.Map(0x10, 99));
        Assert.Equal("idle", Pitwall.Gpu.ClockReasons.Map(0x1, 2));
        Assert.Equal("none", Pitwall.Gpu.ClockReasons.Map(0x2, 99));
        Assert.Equal("voltage", Pitwall.Gpu.ClockReasons.Map(0, 97));
        Assert.Equal("none", Pitwall.Gpu.ClockReasons.Map(0, 10));
        Assert.Equal("none", Pitwall.Gpu.ClockReasons.Map(0, null));
    }
}

public class CrashDetectorTests
{
    static readonly DateTime Start = new(2026, 10, 22, 21, 0, 0, DateTimeKind.Local);

    static CrashRingFile Ring(string exe = "FC25.exe") => new()
    {
        Exe = exe,
        SessionStart = Start,
        SavedAt = Start.AddMinutes(42),
        Series = new() { ["gpu.hotspot"] = [104, 105, 106] },
        CsvFile = "pitwall_2026-10-22_21-00-00_FC25.csv",
    };

    [Fact]
    public void UnfinishedSession_UsesRing()
    {
        var r = CrashDetector.Detect(new GameSession { Exe = "FC25.exe", Start = Start }, Ring(), null, null)!;
        Assert.Equal("unfinishedSession", r.Reason);
        Assert.Equal(Start.AddMinutes(42), r.Time);
        Assert.Equal([104, 105, 106], r.Series!["gpu.hotspot"]);
        Assert.Equal("pitwall_2026-10-22_21-00-00_FC25.csv", r.CsvFile);
    }

    [Fact]
    public void KernelPowerAfterCleanSession()
    {
        var kp = Start.AddHours(3);
        var session = new GameSession { Exe = "FC25.exe", Start = Start, End = Start.AddHours(1), CsvFile = "a.csv" };
        var r = CrashDetector.Detect(session, Ring(), kp, null)!;
        Assert.Equal("kernelPower41", r.Reason);
        Assert.Equal(kp, r.Time);
        Assert.Null(r.Series); // buffer é do jogo, não do crash
        Assert.Equal("a.csv", r.CsvFile);

        Assert.Equal("both", CrashDetector.Detect(new GameSession { Exe = "FC25.exe", Start = Start }, Ring(), kp, null)!.Reason);
    }

    [Fact]
    public void NoReport()
    {
        var clean = new GameSession { Exe = "FC25.exe", Start = Start, End = Start.AddHours(1) };
        Assert.Null(CrashDetector.Detect(null, Ring(), Start.AddHours(2), null));
        Assert.Null(CrashDetector.Detect(clean, Ring(), null, null));
        Assert.Null(CrashDetector.Detect(clean, Ring(), Start.AddHours(-1), null)); // KP41 antes da sessão
        Assert.Null(CrashDetector.Detect(new GameSession { Exe = "FC25.exe", Start = Start }, Ring(), null, Start)); // dispensado
    }

    [Fact]
    public void RingFromAnotherSessionIsIgnored()
    {
        var r = CrashDetector.Detect(new GameSession { Exe = "Other.exe", Start = Start }, Ring(), null, null)!;
        Assert.Null(r.Series);
        Assert.Equal(Start, r.Time);
    }

    [Fact]
    public void CrashRing_FromPcRing_KeepsOldShape()
    {
        var ring = new Pitwall.Health.PcRing();
        for (int i = 0; i < 100; i++)
            ring.Sample(new Dictionary<string, double?> { ["gpu.temp"] = i, ["fps.current"] = null }, i * 1000L + 1);
        var pc = new Pitwall.Health.PcRingFile { Exe = "FC25.exe", SessionStart = Start, SavedAt = Start.AddMinutes(5), Series = ring.Series(), CsvFile = "a.csv" };
        var old = CrashRing.FromPcRing(pc)!;
        Assert.Equal(CrashRing.Ids.Length, old.Series.Count);
        Assert.Equal(60, old.Series["gpu.temp"].Length);
        Assert.Equal(40, old.Series["gpu.temp"][0]);
        Assert.Equal(99, old.Series["gpu.temp"][^1]);
        Assert.All(old.Series["fps.current"], v => Assert.Null(v));
        Assert.False(old.Series.ContainsKey("ram.load"));
        Assert.Equal("a.csv", old.CsvFile);
        Assert.Null(CrashRing.FromPcRing(new Pitwall.Health.PcRingFile { SavedAt = Start })); // fora de jogo
    }
}
