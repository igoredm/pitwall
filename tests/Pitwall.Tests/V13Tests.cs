using System.Text.Json;
using Pitwall.Config;
using Pitwall.Games;
using Pitwall.Health;
using Pitwall.Metrics;
using Pitwall.Ui;

namespace Pitwall.Tests;

/// <summary>1.3: eventos novos do Windows, gameExit, energia, tendência, benchmark e config v9.</summary>
public class PcEventV13Tests
{
    static readonly DateTime T = new(2026, 11, 18, 3, 12, 0, DateTimeKind.Local);
    static readonly HashSet<string> Games = new(StringComparer.OrdinalIgnoreCase) { "FC25.exe", "Cyberpunk2077.exe" };

    static RawEvent Raw(string provider, int id, string? desc = null, params object?[] props) => new(provider, id, 4, T, desc, props);

    [Theory]
    [InlineData("Microsoft-Windows-Kernel-Power", 42, "sleep")]
    [InlineData("Microsoft-Windows-Power-Troubleshooter", 1, "resume")]
    [InlineData("Microsoft-Windows-Kernel-General", 12, "boot")]
    [InlineData("Microsoft-Windows-Kernel-General", 13, "shutdown")]
    [InlineData("User32", 1074, "shutdown")]
    public void StateKinds(string provider, int id, string kind)
    {
        var e = PcEvents.Parse(Raw(provider, id, "x"))!;
        Assert.Equal(kind, e.Kind);
        Assert.Equal("state", e.Category);
        Assert.Null(e.Exe);
    }

    [Theory]
    [InlineData("Microsoft-Windows-Kernel-General", 1)]
    [InlineData("Microsoft-Windows-Kernel-Power", 109)]
    [InlineData("Microsoft-Windows-Power-Troubleshooter", 2)]
    [InlineData("User32", 1075)]
    [InlineData("Application Error", 1001)]
    [InlineData("Application Hang", 1000)]
    public void OtherIds_Ignored(string provider, int id) => Assert.Null(PcEvents.Parse(Raw(provider, id, "x", "FC25.exe"), games: Games));

    [Fact]
    public void ProblemKinds_HaveProblemCategory()
    {
        Assert.Equal("problem", PcEvents.Parse(Raw("Microsoft-Windows-Kernel-Power", 41, null, 0L))!.Category);
        Assert.Equal("problem", PcEvents.Parse(Raw("Display", 4101))!.Category);
    }

    [Fact]
    public void Sleep_And_Resume_Messages()
    {
        Assert.Equal("The system is entering sleep.", PcEvents.Parse(Raw("Microsoft-Windows-Kernel-Power", 42, "The system is entering sleep.\r\n\r\nSleep Reason: Application API"))!.Message);
        Assert.Equal("O sistema está entrando em suspensão.", PcEvents.Parse(Raw("Microsoft-Windows-Kernel-Power", 42, "O sistema está entrando em suspensão.\r\n\r\nMotivo da Suspensão: API de Aplicativo"))!.Message);
        Assert.Equal("O sistema voltou de um estado de baixa energia.",
            PcEvents.Parse(Raw("Microsoft-Windows-Power-Troubleshooter", 1, "O sistema voltou de um estado de baixa energia.\r\n\r\nTempo de Suspensão: ..."))!.Message);
    }

    [Fact]
    public void Shutdown1074_FromProperties_NoUserOrMachine()
    {
        var e = PcEvents.Parse(Raw("User32", 1074,
            "The process C:\\Windows\\System32\\RuntimeBroker.exe (DESKTOP-ABC) has initiated the restart of computer DESKTOP-ABC on behalf of user DESKTOP-ABC\\fulano for the following reason: Other (Unplanned)",
            "C:\\Windows\\System32\\RuntimeBroker.exe (DESKTOP-ABC)", "DESKTOP-ABC", "Other (Unplanned)", "0x0", "restart", "", "DESKTOP-ABC\\fulano"), "fulano")!;
        Assert.Equal("shutdown", e.Kind);
        Assert.Equal("RuntimeBroker.exe · restart", e.Message);
        Assert.DoesNotContain("fulano", e.Message!, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("DESKTOP", e.Message!);
    }

    [Fact]
    public void Shutdown1074_PtBr_DescriptionOnly()
    {
        var e = PcEvents.Parse(Raw("User32", 1074,
            "O processo C:\\Windows\\system32\\winlogon.exe (DESKTOP-ABC) iniciou a desligamento do computador DESKTOP-ABC em nome do usuário DESKTOP-ABC\\fulano pelo seguinte motivo: Nenhum título para este motivo"), "fulano")!;
        Assert.Equal("winlogon.exe", e.Message);
        Assert.Null(PcEvents.Parse(Raw("User32", 1074, "sem processo no texto"))!.Message);
    }

    [Fact]
    public void Boot_MessageHasNoMachineName()
    {
        var e = PcEvents.Parse(Raw("Microsoft-Windows-Kernel-General", 12, "The operating system started at system time 2026-11-18T06:12:00Z on DESKTOP-ABC."), machineName: "DESKTOP-ABC")!;
        Assert.DoesNotContain("DESKTOP-ABC", e.Message!);
    }

    const string CrashEn = "Faulting application name: FC25.exe, version: 1.0.0.0, time stamp: 0x65a1b2c3\r\nFaulting module name: nvwgf2umx.dll, version: 32.0.15.9144, time stamp: 0x6789abcd\r\nException code: 0xc0000005";
    const string CrashPt = "Nome do aplicativo com falha: FC25.exe, versão: 1.0.0.0, carimbo de data/hora: 0x65a1b2c3\r\nNome do módulo com falha: nvwgf2umx.dll, versão: 32.0.15.9144, carimbo de data/hora: 0x6789abcd\r\nCódigo de exceção: 0xc0000005";

    [Fact]
    public void AppCrash_FromProperties()
    {
        var e = PcEvents.Parse(Raw("Application Error", 1000, CrashEn, "FC25.exe", "1.0.0.0", "65a1b2c3", "nvwgf2umx.dll", "32.0.15.9144"), games: Games)!;
        Assert.Equal("appCrash", e.Kind);
        Assert.Equal("problem", e.Category);
        Assert.Equal("FC25.exe", e.Exe);
        Assert.Equal("nvwgf2umx.dll", e.Code);
        Assert.Equal("Application Error 1000", e.Source);
        Assert.StartsWith("Faulting application name: FC25.exe", e.Message);
    }

    [Theory]
    [InlineData(CrashEn)]
    [InlineData(CrashPt)]
    public void AppCrash_FromDescription_PtAndEn(string desc)
    {
        var e = PcEvents.Parse(Raw("Application Error", 1000, desc), games: Games)!;
        Assert.Equal("fc25.exe", e.Exe!.ToLowerInvariant());
        Assert.Equal("nvwgf2umx.dll", e.Code);
    }

    [Theory]
    [InlineData("The program Cyberpunk2077.exe version 2.1.0.0 stopped interacting with Windows and was closed.")]
    [InlineData("O programa Cyberpunk2077.exe versão 2.1.0.0 parou de interagir com o Windows e foi fechado.")]
    public void AppHang_PtAndEn(string desc)
    {
        var e = PcEvents.Parse(Raw("Application Hang", 1002, desc), games: Games)!;
        Assert.Equal("appHang", e.Kind);
        Assert.Equal("Cyberpunk2077.exe", e.Exe);
        Assert.Null(e.Code);
        var withProps = PcEvents.Parse(Raw("Application Hang", 1002, desc, "Cyberpunk2077.exe", "2.1.0.0", 1234), games: Games)!;
        Assert.Equal("Cyberpunk2077.exe", withProps.Exe);
    }

    [Fact]
    public void AppEvents_OnlyKnownGames()
    {
        Assert.Null(PcEvents.Parse(Raw("Application Error", 1000, CrashEn.Replace("FC25.exe", "chrome.exe"), "chrome.exe"), games: Games));
        Assert.Null(PcEvents.Parse(Raw("Application Error", 1000, CrashEn, "FC25.exe")));              // sem lista = nenhum
        Assert.Null(PcEvents.Parse(Raw("Application Hang", 1002, "nada aqui"), games: Games));          // sem exe
        Assert.NotNull(PcEvents.Parse(Raw("Application Error", 1000, CrashEn, "C:\\Games\\fc25.EXE"), games: Games)); // caminho, outra caixa
    }

    [Fact]
    public void Combine_CapsEachCategory()
    {
        var problems = Enumerable.Range(0, 260).Select(i => new PcEvent { Kind = "whea", Category = "problem", Time = T.AddMinutes(-i) });
        var state = Enumerable.Range(0, 180).Select(i => new PcEvent { Kind = "sleep", Category = "state", Time = T.AddMinutes(-i).AddSeconds(-30) });
        var all = PcEvents.Combine(problems, state);
        Assert.Equal(PcEvents.MaxEvents, all.Count(e => e.Category == "problem"));
        Assert.Equal(PcEvents.MaxStateEvents, all.Count(e => e.Category == "state"));
        Assert.Equal(T, all[0].Time); // mais novos primeiro
        Assert.True(all.Zip(all.Skip(1)).All(p => p.First.Time >= p.Second.Time));
        Assert.Equal(T.AddMinutes(-199), all.Where(e => e.Category == "problem").Min(e => e.Time)); // ficam os mais novos
    }

    [Fact]
    public void XPaths()
    {
        foreach (var p in new[] { "Kernel-Power'] and EventID=42", "Power-Troubleshooter", "Kernel-General", "EventID=12", "EventID=13", "User32", "1074", $"{7 * 86_400_000L}" })
            Assert.Contains(p, PcEvents.StateXPath);
        var app = PcEvents.AppXPath();
        foreach (var p in new[] { "Application Error", "EventID=1000", "Application Hang", "EventID=1002", $"{30 * 86_400_000L}" })
            Assert.Contains(p, app);
    }

    [Fact]
    public void IncidentWindow_IncludesStateEvents_WithoutChangingKind()
    {
        var saved = T.AddMinutes(28);
        var events = new List<PcEvent>
        {
            new() { Kind = "sleep", Category = "state", Time = T.AddMinutes(25) },
            new() { Kind = "kernelPower41", Category = "problem", Time = saved.AddMinutes(2) },
        };
        var near = PcIncidentRules.EventsNear(events, saved, saved.AddMinutes(2));
        Assert.Equal(2, near.Count);
        Assert.Equal("abruptShutdown", PcIncidentRules.KindFor(near));
    }

    [Fact]
    public void Json_HasCategoryAndExe()
    {
        var e = PcEvents.Parse(Raw("Application Error", 1000, CrashEn, "FC25.exe", "1", "2", "nvwgf2umx.dll"), games: Games)!;
        using var doc = JsonDocument.Parse(JsonSerializer.Serialize(e, ConfigStore.Json));
        Assert.Equal("problem", doc.RootElement.GetProperty("category").GetString());
        Assert.Equal("FC25.exe", doc.RootElement.GetProperty("exe").GetString());
    }
}

public class GameExitTests
{
    static readonly DateTime S = new(2026, 11, 20, 21, 0, 0, DateTimeKind.Local);
    static GameSession Session(string exe = "FC25.exe") => new() { Exe = exe, Start = S, End = S.AddHours(1), DurationSec = 3600 };
    static PcEvent Ev(string kind, string exe, DateTime t) => new() { Kind = kind, Exe = exe, Time = t, Category = "problem" };

    [Fact]
    public void Crash_InsideWindow()
    {
        Assert.Equal("crash", GameExitRules.For(Session(), [Ev("appCrash", "fc25.exe", S.AddHours(1).AddSeconds(5))]));
        Assert.Equal("crash", GameExitRules.For(Session(), [Ev("appCrash", "FC25.exe", S.AddHours(1).AddMinutes(2))])); // fim + 2 min
        Assert.Equal("hang", GameExitRules.For(Session(), [Ev("appHang", "FC25.exe", S.AddMinutes(30))]));
    }

    [Fact]
    public void CrashWinsOverHang()
    {
        Assert.Equal("crash", GameExitRules.For(Session(),
            [Ev("appHang", "FC25.exe", S.AddMinutes(59)), Ev("appCrash", "FC25.exe", S.AddMinutes(60))]));
    }

    [Fact]
    public void OutsideWindow_OtherExe_OrOtherKind_Null()
    {
        Assert.Null(GameExitRules.For(Session(), [Ev("appCrash", "FC25.exe", S.AddSeconds(-1))]));
        Assert.Null(GameExitRules.For(Session(), [Ev("appCrash", "FC25.exe", S.AddHours(1).AddMinutes(2).AddSeconds(1))]));
        Assert.Null(GameExitRules.For(Session(), [Ev("appCrash", "other.exe", S.AddMinutes(10))]));
        Assert.Null(GameExitRules.For(Session(), [Ev("gpuReset", "FC25.exe", S.AddMinutes(10))]));
        Assert.Null(GameExitRules.For(Session(), []));
    }

    [Fact]
    public void NoEnd_UsesDuration_OrNothing()
    {
        var s = new GameSession { Exe = "FC25.exe", Start = S, DurationSec = 600 };
        Assert.Equal("crash", GameExitRules.For(s, [Ev("appCrash", "FC25.exe", S.AddMinutes(11))]));
        Assert.Null(GameExitRules.For(new GameSession { Exe = "FC25.exe", Start = S }, [Ev("appCrash", "FC25.exe", S.AddMinutes(1))]));
    }

    [Fact]
    public void SessionJson_NewFields()
    {
        var s = Session();
        s.GameExit = "crash";
        s.GpuDriver = "591.44";
        s.EnergyWh = 420.5;
        using var doc = JsonDocument.Parse(JsonSerializer.Serialize(s, ConfigStore.Json));
        Assert.Equal("crash", doc.RootElement.GetProperty("gameExit").GetString());
        Assert.Equal("591.44", doc.RootElement.GetProperty("gpuDriver").GetString());
        Assert.Equal(420.5, doc.RootElement.GetProperty("energyWh").GetDouble());
        Assert.False(JsonDocument.Parse(JsonSerializer.Serialize(new GameSession(), ConfigStore.Json)).RootElement.TryGetProperty("gameExit", out _));
    }
}

public class EnergyTests
{
    static Dictionary<string, double?> V(double? gpu, double? cpu) => new() { ["gpu.power"] = gpu, ["cpu.power"] = cpu };

    [Fact]
    public void Integrates_GpuPlusCpu_TimesDt()
    {
        var acc = new SessionStatsAccumulator();
        // 300 W + 100 W por 1 h (3600 ticks de 1 s) = 400 Wh
        for (int i = 0; i < 3600; i++) acc.AddTick(V(300, 100), [], 1);
        Assert.Equal(400, acc.EnergyWh);
        var s = new GameSession { Start = DateTime.Now };
        acc.ApplyTo(s, DateTime.Now);
        Assert.Equal(400, s.EnergyWh);
    }

    [Fact]
    public void OnlyWhatHasReading_AndNothingWithoutReadings()
    {
        var acc = new SessionStatsAccumulator();
        Assert.Null(acc.EnergyWh);
        acc.AddTick(V(null, null), [], 1);
        acc.AddTick(new Dictionary<string, double?>(), [], 1);
        Assert.Null(acc.EnergyWh);
        acc.AddTick(V(null, 72), [], 50);         // só CPU: 72 W × 50 s = 1 Wh
        acc.AddTick(V(double.NaN, null), [], 10); // inválido não conta
        acc.AddTick(V(360, null), [], 0);         // dt = 0 não conta
        Assert.Equal(1, acc.EnergyWh);
        acc.AddTick(V(180, null), [], 20);        // só GPU: 1 Wh
        Assert.Equal(2, acc.EnergyWh);
    }

    [Fact]
    public void Rounds_OneDecimal()
    {
        var acc = new SessionStatsAccumulator();
        acc.AddTick(V(100, 0), [], 10); // 1000 J = 0,2777… Wh
        Assert.Equal(0.3, acc.EnergyWh);
    }
}

public class TrendTests
{
    static readonly DateTime D = new(2026, 11, 1, 20, 0, 0, DateTimeKind.Local);

    static GameSession S(string exe, int day, double dur = 600, double? fps = 140, string? driver = "591.44") => new()
    {
        Exe = exe, Start = D.AddDays(day), End = D.AddDays(day).AddSeconds(dur), DurationSec = dur, AvgFps = fps, Low1 = fps * 0.7,
        AvgGpuTemp = 70, AvgHotspot = 92, PeakHotspot = 101, AvgGpuPower = 250, Stutters = 3, GpuDriver = driver, EnergyWh = 50,
    };

    [Fact]
    public void Filters_ShortAndNoFps_OrdersOldestFirst()
    {
        var all = new List<GameSession>
        {
            S("FC25.exe", 5), S("FC25.exe", 1), S("FC25.exe", 3, dur: 119), S("FC25.exe", 4, fps: null), S("FC25.exe", 2, dur: 120),
        };
        var t = TrendBuilder.Build(all, "FC25.exe");
        Assert.Equal("FC25.exe", t.Exe);
        Assert.Equal(new[] { 1, 2, 5 }, t.Points.Select(p => (p.Start - D).Days));
        var p = t.Points[0];
        Assert.Equal(600, p.DurationSec);
        Assert.Equal(140, p.AvgFps);
        Assert.Equal("591.44", p.GpuDriver);
        Assert.Equal(50, p.EnergyWh);
        Assert.Equal(101, p.PeakHotspot);
    }

    [Fact]
    public void Games_AtLeastTwoSessions_MostPlayedFirst_DefaultExe()
    {
        var all = new List<GameSession>
        {
            S("A.exe", 1), S("A.exe", 2),
            S("B.exe", 3), S("b.exe", 4), S("B.exe", 5),
            S("C.exe", 9),                                   // 1 sessão: fora
            S("D.exe", 6), S("D.exe", 7, dur: 30),           // só 1 conta: fora
            S("E.exe", 8), S("E.exe", 10),                   // empata com A, jogado mais recentemente
        };
        var t = TrendBuilder.Build(all, null);
        Assert.Equal(new[] { "B.exe", "E.exe", "A.exe" }, t.Games.Select(g => g.Exe));
        Assert.Equal(3, t.Games[0].Count);
        Assert.Equal(D.AddDays(5), t.Games[0].Last);
        Assert.Equal("B.exe", t.Exe);
        Assert.Equal(3, t.Points.Count);
        Assert.Equal("B.exe", TrendBuilder.Build(all, "b.EXE").Exe);   // caixa das sessões
        Assert.Single(TrendBuilder.Build(all, "C.exe").Points);        // pedido explícito vale mesmo fora de games
    }

    [Fact]
    public void Empty_ExeNullExplicitInJson()
    {
        var t = TrendBuilder.Build([], null);
        Assert.Null(t.Exe);
        Assert.Empty(t.Points);
        using var doc = JsonDocument.Parse(TelemetryHub.TrendJson(t));
        Assert.Equal("trend", doc.RootElement.GetProperty("type").GetString());
        Assert.Equal(JsonValueKind.Null, doc.RootElement.GetProperty("exe").ValueKind);
        Assert.Equal(0, doc.RootElement.GetProperty("games").GetArrayLength());
    }

    [Fact]
    public void Json_Shape()
    {
        var t = TrendBuilder.Build([S("A.exe", 1), S("A.exe", 2, driver: null)], null);
        using var doc = JsonDocument.Parse(TelemetryHub.TrendJson(t));
        var g = doc.RootElement.GetProperty("games")[0];
        Assert.Equal(new[] { "count", "exe", "last" }, g.EnumerateObject().Select(p => p.Name).Order());
        var p1 = doc.RootElement.GetProperty("points")[1];
        Assert.False(p1.TryGetProperty("gpuDriver", out _));
        Assert.True(p1.TryGetProperty("avgFps", out _));
        Assert.True(p1.TryGetProperty("durationSec", out _));
    }
}

public class BenchmarkTests
{
    static readonly DateTime Now = new(2026, 11, 22, 21, 0, 0, DateTimeKind.Local);
    static readonly BenchmarkContext Ctx = new("RTX 3080", "i5-12600K", "591.44", Now.AddMinutes(-10));

    static Dictionary<string, double?> V() => new() { ["gpu.power"] = 300, ["cpu.power"] = 60, ["gpu.load"] = 97, ["gpu.temp"] = 70 };

    /// <summary>Roda <paramref name="sec"/> ticks de 1 s a 100 FPS.</summary>
    static BenchmarkState? Run(BenchmarkRunner r, int sec, long startMs = 0)
    {
        BenchmarkState? last = null;
        var frames = Enumerable.Repeat(10f, 100).ToArray();
        for (int i = 1; i <= sec; i++)
        {
            r.AddFrames(frames);
            r.AddTick(V(), [], "power", 1);
            last = r.Step(startMs + i * 1000L) ?? last;
        }
        return last;
    }

    [Fact]
    public void StartErrors()
    {
        var r = new BenchmarkRunner();
        var noGame = r.Start(null, null, false, 60, null, true, Ctx, Now, 0);
        Assert.Equal("error", noGame.State);
        Assert.Equal("noGame", noGame.Error);
        var noFps = r.Start("FC25.exe", 42, false, 60, null, true, Ctx, Now, 0);
        Assert.Equal("noFps", noFps.Error);
        Assert.Equal("FC25.exe", noFps.Exe);
        Assert.False(r.IsRunning);
    }

    [Fact]
    public void FullRun_Done_WithResult()
    {
        var r = new BenchmarkRunner();
        var st = r.Start("FC25.exe", 42, true, 30, "  ultra RT  ", true, Ctx, Now, 0);
        Assert.Equal("running", st.State);
        Assert.Equal(30, st.DurationSec);
        Assert.Equal(Now, st.StartedAt);
        Assert.Equal(42, r.Pid);
        Assert.Same(st, r.Start("FC25.exe", 42, true, 60, null, true, Ctx, Now, 5)); // já rodando: nada muda
        r.Prime(Enumerable.Repeat(50f, 200).ToArray()); // frames de antes: não contam no FPS
        Assert.Null(Run(r, 29));
        var done = r.Step(30_000)!;
        Assert.Equal("done", done.State);
        var b = done.Result!;
        Assert.Equal(30, b.DurationSec);
        Assert.Null(b.Partial);
        Assert.Equal("ultra RT", b.Note);
        Assert.Equal(100, b.AvgFps);
        Assert.Equal(100, b.Low1);
        Assert.Equal(97, b.AvgGpuLoad);
        Assert.Equal(2.9, b.EnergyWh); // 360 W × 29 s
        Assert.Equal(29, b.ClockReasonSec!["power"]);
        Assert.Equal(0, b.Stutters);
        Assert.Equal("RTX 3080", b.Gpu);
        Assert.Equal("591.44", b.GpuDriver);
        Assert.Equal(Now.AddMinutes(-10), b.SessionStart);
        Assert.Equal("FC25.exe", b.Exe);
        Assert.False(r.IsRunning);
        Assert.Same(done, r.State);
    }

    [Fact]
    public void InvalidDuration_Becomes60()
    {
        var r = new BenchmarkRunner();
        Assert.Equal(60, r.Start("x.exe", 1, true, 45, null, false, Ctx, Now, 0).DurationSec);
        Assert.Null(r.Step(59_999));
        Assert.Equal(60, r.Step(60_000)!.Result!.DurationSec);
    }

    [Fact]
    public void GameEnded_PartialAfter10s_ErrorBefore()
    {
        var r = new BenchmarkRunner();
        r.Start("FC25.exe", 42, true, 120, null, true, Ctx, Now, 0);
        Run(r, 12);
        var partial = r.GameEnded(12_400)!;
        Assert.Equal("done", partial.State);
        Assert.True(partial.Result!.Partial);
        Assert.Equal(12, partial.Result.DurationSec);

        r.Start("FC25.exe", 42, true, 120, null, true, Ctx, Now, 100_000);
        var early = r.GameEnded(109_000)!;
        Assert.Equal("error", early.State);
        Assert.Equal("gameEnded", early.Error);
        Assert.Null(early.Result);
        Assert.Null(r.GameEnded(110_000)); // nada rodando
    }

    [Fact]
    public void Cancel()
    {
        var r = new BenchmarkRunner();
        Assert.Null(r.Cancel());
        r.Start("FC25.exe", 42, true, 60, null, true, Ctx, Now, 0);
        var c = r.Cancel()!;
        Assert.Equal("cancelled", c.State);
        Assert.Equal("FC25.exe", c.Exe);
        Assert.Null(c.Result);
        Assert.False(r.IsRunning);
        Assert.Null(r.Step(999_999));
    }

    [Fact]
    public void StateJson_Shape()
    {
        var json = JsonSerializer.Serialize(new BenchmarkState { State = "error", Error = "noFps", Exe = "a.exe" }, ConfigStore.Json);
        using var doc = JsonDocument.Parse(json);
        Assert.Equal(new[] { "error", "exe", "state" }, doc.RootElement.EnumerateObject().Select(p => p.Name).Order());
    }

    [Fact]
    public void Store_IdsRenameDeleteAndCap()
    {
        var path = Path.Combine(Path.GetTempPath(), $"pitwall-bench-{Guid.NewGuid():N}.json");
        try
        {
            var store = new BenchmarkStore(path);
            var a = store.Add(new Benchmark { Exe = "a.exe", Start = Now, DurationSec = 60 });
            var b = store.Add(new Benchmark { Exe = "a.exe", Start = Now, DurationSec = 60 });
            Assert.Equal("20261122-210000", a.Id);
            Assert.Equal("20261122-210000-2", b.Id);
            Assert.True(store.Rename(a.Id, "  driver novo "));
            Assert.False(store.Rename("nope", "x"));
            Assert.Equal("driver novo", new BenchmarkStore(path).List().Single(x => x.Id == a.Id).Note); // gravado
            Assert.True(store.Delete(b.Id));
            Assert.False(store.Delete(b.Id));
            Assert.Single(store.List());

            for (int i = 1; i <= 205; i++) store.Add(new Benchmark { Exe = "x.exe", Start = Now.AddMinutes(i), DurationSec = 30 });
            var list = new BenchmarkStore(path).List();
            Assert.Equal(BenchmarkStore.Max, list.Count);
            Assert.Equal(Now.AddMinutes(205), list[0].Start);             // mais novo primeiro
            Assert.DoesNotContain(list, x => x.Id == a.Id);                // o mais antigo saiu
            Assert.Equal(Now.AddMinutes(6), list[^1].Start);
        }
        finally { File.Delete(path); }
    }

    [Fact]
    public void TrayBalloon()
    {
        var done = new BenchmarkState { State = "done", Result = new Benchmark { DurationSec = 60, AvgFps = 143.4, Low1 = 98.2 } };
        var text = TrayApp.BenchmarkBalloon(done)!;
        Assert.StartsWith("Benchmark: 60 s · 143 FPS · 1% ", text);
        Assert.EndsWith("98", text);
        Assert.NotNull(TrayApp.BenchmarkBalloon(new BenchmarkState { State = "error", Error = "noGame" }));
        Assert.Null(TrayApp.BenchmarkBalloon(new BenchmarkState { State = "running" }));
        Assert.Null(TrayApp.BenchmarkBalloon(new BenchmarkState { State = "cancelled" }));
    }

    [Fact]
    public void Marker_ViaBenchmark() => Assert.Equal("benchmark", SessionMarker.ViaBenchmark);
}

public class ConfigV9Tests
{
    [Fact]
    public void V8_MigratesWithDefaults()
    {
        var c = ConfigStore.Parse("""{ "version": 8, "hotkeys": { "enabled": true, "toggleWidget": "Ctrl+Alt+P", "marker": "" } }""");
        Assert.Equal(ConfigStore.CurrentVersion, c.Version);
        Assert.Equal("Ctrl+Alt+B", c.Hotkeys.Benchmark);
        Assert.Equal("", c.Hotkeys.Marker);               // escolha do usuário fica
        Assert.Equal(60, c.Benchmark.DurationSec);
        Assert.Null(c.Energy.Tariff);
        Assert.Equal("R$", c.Energy.Currency);
    }

    [Fact]
    public void NewInstall_HasV9Fields()
    {
        var c = ConfigStore.Parse(null);
        Assert.Equal(ConfigStore.CurrentVersion, c.Version);
        Assert.Equal("Ctrl+Alt+B", c.Hotkeys.Benchmark);
        Assert.Equal(60, c.Benchmark.DurationSec);
    }

    [Theory]
    [InlineData(30, 30)]
    [InlineData(120, 120)]
    [InlineData(300, 300)]
    [InlineData(45, 60)]
    [InlineData(0, 60)]
    [InlineData(-1, 60)]
    public void BenchmarkDuration_Snapped(int value, int expected) =>
        Assert.Equal(expected, ConfigStore.Parse($$"""{ "version": 9, "benchmark": { "durationSec": {{value}} } }""").Benchmark.DurationSec);

    [Fact]
    public void Energy_Sanitized()
    {
        var c = ConfigStore.Parse("""{ "version": 9, "energy": { "tariff": 0.92, "currency": " US$ " } }""");
        Assert.Equal(0.92, c.Energy.Tariff);
        Assert.Equal("US$", c.Energy.Currency);
        var bad = ConfigStore.Parse("""{ "version": 9, "energy": { "tariff": -1, "currency": "" }, "benchmark": null, "hotkeys": null }""");
        Assert.Null(bad.Energy.Tariff);
        Assert.Equal("R$", bad.Energy.Currency);
        Assert.Equal(60, bad.Benchmark.DurationSec);
        Assert.NotNull(bad.Hotkeys);
        // ida e volta mantém os campos
        using var doc = JsonDocument.Parse(JsonSerializer.Serialize(c, ConfigStore.Json));
        Assert.Equal(0.92, doc.RootElement.GetProperty("energy").GetProperty("tariff").GetDouble());
        Assert.Equal("Ctrl+Alt+B", doc.RootElement.GetProperty("hotkeys").GetProperty("benchmark").GetString());
        Assert.Equal(60, doc.RootElement.GetProperty("benchmark").GetProperty("durationSec").GetInt32());
    }
}
