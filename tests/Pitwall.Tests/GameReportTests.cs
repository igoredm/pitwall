using System.Text.Json;
using Pitwall.Config;
using Pitwall.Fps;
using Pitwall.Games;
using Pitwall.Logging;
using Pitwall.Metrics;
using Pitwall.Ui;

namespace Pitwall.Tests;

/// <summary>1.2: engasgos, colunas novas do PresentMon, médias da sessão, marcadores, séries e atalhos.</summary>
public class StutterDetectorTests
{
    /// <summary>Frames constantes por <paramref name="seconds"/> segundos.</summary>
    static void Feed(StutterDetector d, float ft, double seconds)
    {
        for (double t = 0; t < seconds * 1000; t += ft) d.Add(ft);
    }

    [Fact]
    public void At300Fps_ThresholdIsMedianPlus10()
    {
        // 300 fps: mediana 3,33 ms → max(8,3; 13,3) = 13,3 ms
        var d = new StutterDetector();
        Feed(d, 3.333f, 11);
        Assert.False(d.Add(12f));
        Assert.True(d.Add(14f));
        Feed(d, 3.333f, 1);
        Assert.True(d.Add(40f));
        Assert.Equal(2, d.Count);
    }

    [Fact]
    public void At30Fps_ThresholdIs2_5xMedian()
    {
        // 30 fps: mediana 33,3 ms → max(83,3; 43,3) = 83,3 ms
        var d = new StutterDetector();
        Feed(d, 33.333f, 11);
        Assert.False(d.Add(60f));
        Assert.False(d.Add(80f));
        Assert.True(d.Add(90f));
        Assert.Equal(1, d.Count);
    }

    [Fact]
    public void IgnoresFirst10Seconds()
    {
        var d = new StutterDetector();
        Feed(d, 5f, 3);
        Assert.False(d.Add(200f)); // carregamento
        Feed(d, 5f, 6.5);
        Assert.False(d.Add(200f));
        Feed(d, 5f, 1);
        Assert.True(d.Add(200f));
        Assert.Equal(1, d.Count);
    }

    [Fact]
    public void Prime_FillsWindowWithoutCountingOrWarmup()
    {
        var d = new StutterDetector();
        d.Prime(Enumerable.Repeat(4f, 20_000).ToArray()); // 80 s de backlog: não conta como sessão
        Assert.False(d.Add(100f));
        Assert.Equal(0, d.Count);
    }

    [Fact]
    public void MedianIsRobustToStutterBursts()
    {
        // Rajada de engasgos não sobe a mediana: todos contam
        var d = new StutterDetector();
        Feed(d, 6.94f, 11); // 144 fps
        for (int i = 0; i < 10; i++)
        {
            d.Add(50f);
            d.Add(6.94f);
        }
        Assert.Equal(10, d.Count);
    }

    [Fact]
    public void Accumulator_CountsOnlyWhenOn_AndPrimesWithBacklog()
    {
        var off = new SessionStatsAccumulator();
        off.AddFrames(Enumerable.Repeat(5f, 3000).ToArray());
        Assert.Null(off.Stutters);

        var acc = new SessionStatsAccumulator(countStutters: true);
        acc.AddFrames(Enumerable.Repeat(5f, 5000).Append(300f).ToArray()); // backlog (com um frame ruim) = só a janela
        acc.AddFrames(Enumerable.Repeat(5f, 2200).ToArray());               // 11 s de sessão
        acc.AddFrames(new[] { 5f, 80f, 5f });
        Assert.Equal(1, acc.Stutters);
        var s = new GameSession { Start = DateTime.Now };
        acc.ApplyTo(s, DateTime.Now);
        Assert.Equal(1, s.Stutters);
    }
}

public class PresentMon2ColumnsTests
{
    const string V2Header = "Application,ProcessID,SwapChainAddress,PresentRuntime,SyncInterval,PresentFlags,AllowsTearing,PresentMode,FrameType,CPUStartTime,FrameTime,CPUBusy,CPUWait,DisplayLatency,DisplayedTime,AnimationError,AnimationTime,MsFlipDelay";

    [Fact]
    public void ParsesAnimationError_V2Metrics()
    {
        var csv = PresentMonCsv.FromHeader(V2Header)!;
        Assert.True(csv.HasAnimationError);
        Assert.False(csv.HasPcLatency);
        Assert.True(csv.TryParse("g.exe,10,0x1,DXGI,0,0,1,Hardware: Independent Flip,Application,100.5,8.33,7,1,20,8.33,-0.75,100.5,NA", out var r));
        Assert.Equal(-0.75, r.AnimErrorMs, 6);
        Assert.True(double.IsNaN(r.PcLatencyMs));
        Assert.Equal(8.33, r.FrametimeMs, 6);
        Assert.True(csv.TryParse("g.exe,10,0x1,DXGI,0,0,1,Hardware: Independent Flip,Application,100.5,8.33,7,1,20,8.33,NA,100.5,NA", out r));
        Assert.True(double.IsNaN(r.AnimErrorMs));
    }

    [Fact]
    public void ParsesMsColumns_DefaultFormat()
    {
        // Formato padrão do 2.x (sem --v2_metrics): MsAnimationError e MsPCLatency
        var h = "Application,ProcessID,SwapChainAddress,FrameType,CPUStartTime,FrameTime,DisplayedTime,MsPCLatency,MsAnimationError";
        var csv = PresentMonCsv.FromHeader(h)!;
        Assert.True(csv.TryParse("g.exe,10,0x1,Application,5,10,10,22.5,1.25", out var r));
        Assert.Equal(22.5, r.PcLatencyMs, 6);
        Assert.Equal(1.25, r.AnimErrorMs, 6);
    }

    [Fact]
    public void OldHeader_StillParses()
    {
        var csv = PresentMonCsv.FromHeader("Application,ProcessID,FrameType,CPUStartTime,FrameTime,DisplayedTime")!;
        Assert.False(csv.HasAnimationError);
        Assert.True(csv.TryParse("g.exe,10,Application,5,10,10", out var r));
        Assert.True(double.IsNaN(r.AnimErrorMs));
        Assert.Equal(10, r.FrametimeMs);
    }

    [Fact]
    public void FrameStats_AnimErrorIsAverageAbsOverLastSecond()
    {
        var s = new FrameStats("g.exe");
        // 2 s a 100 fps: no primeiro segundo erro 5 ms, no último ±1 ms
        for (int i = 0; i < 200; i++)
            s.AddPresent(new PresentRow("g.exe", 1, 10, 10, i * 10, FrameKind.Application, i < 100 ? 5 : (i % 2 == 0 ? 1 : -1)));
        var snap = s.Snapshot();
        Assert.Equal(1, snap.AnimErrorMs!.Value, 3);
        Assert.Null(snap.PcLatencyMs);
    }
}

public class SessionAveragesTests
{
    [Fact]
    public void Accumulator_AveragesAndCpuPeak()
    {
        var acc = new SessionStatsAccumulator();
        void Tick(double gpuTemp, double cpuTemp, double? anim) => acc.AddTick(new Dictionary<string, double?>
        {
            ["gpu.temp"] = gpuTemp, ["gpu.hotspot"] = gpuTemp + 12, ["gpu.power"] = 200, ["gpu.clock"] = 1800.4, ["gpu.load"] = 97,
            ["cpu.temp"] = cpuTemp, ["cpu.load"] = 40, ["fps.animError"] = anim, ["fps.pcLatency"] = null,
        }, [], 1);
        Tick(70, 60, 0.4);
        Tick(80, 80, null);
        Tick(75, 70, 0.6);
        var s = new GameSession { Start = DateTime.Now };
        acc.ApplyTo(s, DateTime.Now);
        Assert.Equal(75, s.AvgGpuTemp);
        Assert.Equal(87, s.AvgHotspot);
        Assert.Equal(200, s.AvgGpuPower);
        Assert.Equal(1800, s.AvgGpuClock);
        Assert.Equal(97, s.AvgGpuLoad);
        Assert.Equal(70, s.AvgCpuTemp);
        Assert.Equal(40, s.AvgCpuLoad);
        Assert.Equal(80, s.PeakCpuTemp);
        Assert.Equal(0.5, s.AnimErrorMs);
        Assert.Null(s.PcLatencyMs);
        Assert.Null(s.Stutters);
    }

    [Fact]
    public void GameSession_NewFieldsJson()
    {
        var s = new GameSession
        {
            Exe = "g.exe", Start = new DateTime(2026, 11, 19, 21, 0, 0), Stutters = 3, Gpu = "RTX 3080", Cpu = "i5-12600K",
            Markers = [new SessionMarker { T = 845.2, At = new DateTime(2026, 11, 19, 21, 14, 5), Note = "travou" }],
        };
        var json = JsonSerializer.Serialize(s, ConfigStore.Json);
        Assert.Contains("\"stutters\": 3", json);
        Assert.Contains("\"t\": 845.2", json);
        Assert.Contains("\"gpu\": \"RTX 3080\"", json);
        Assert.DoesNotContain("avgGpuTemp", json); // null não vai
        var back = JsonSerializer.Deserialize<GameSession>(json, ConfigStore.Json)!;
        Assert.Equal("travou", back.Markers![0].Note);
    }
}

public class CsvMarkerTests
{
    [Fact]
    public void Header_EndsWithMarkerColumn()
    {
        var h = CsvLogger.Header(["fps.current", "gpu.temp"]);
        Assert.Equal("# pitwall-csv v3\r\ntimestamp,game,fps.current,gpu.temp,marker\r\n", h);
    }

    [Fact]
    public void Row_MarkerIsOneOrEmpty()
    {
        var t = new DateTime(2026, 11, 19, 21, 14, 5, 123);
        var values = new Dictionary<string, double?> { ["fps.current"] = 143.456, ["gpu.temp"] = null };
        var texts = new Dictionary<string, string?>();
        Assert.Equal("2026-11-19 21:14:05.123,g.exe,143.46,,1\r\n", CsvLogger.Row(t, "g.exe", ["fps.current", "gpu.temp"], values, texts, true));
        Assert.Equal("2026-11-19 21:14:05.123,,143.46,,\r\n", CsvLogger.Row(t, null, ["fps.current", "gpu.temp"], values, texts, false));
    }
}

public class SessionSeriesTests
{
    [Fact]
    public void Downsample_AveragesPerBucket_NullWhenEmpty()
    {
        double[] t = [0, 1, 2, 3, 4, 5, 6, 7];
        float[] v = [10, 20, float.NaN, float.NaN, 30, 30, 40, 60];
        var r = SessionSeries.Downsample(t, v, 4, 8);
        Assert.Equal([15, null, 30, 50], r);
    }

    [Fact]
    public void Downsample_LastRowGoesToLastBucket()
    {
        var r = SessionSeries.Downsample([0.0, 10.0], [1f, 3f], 2, 10);
        Assert.Equal([1, 3], r);
    }

    [Fact]
    public void Read_PitwallCsv_KnownColumnsOnly()
    {
        var sb = new System.Text.StringBuilder();
        sb.Append(CsvLogger.Header(["fps.current", "gpu.temp", "gpu.perfcap", "cpu.load"]));
        var start = new DateTime(2026, 11, 19, 21, 0, 0);
        for (int i = 0; i < 600; i++)
        {
            var values = new Dictionary<string, double?> { ["fps.current"] = i < 300 ? 100 : 200, ["gpu.temp"] = 60 + i / 60, ["cpu.load"] = null };
            var texts = new Dictionary<string, string?> { ["gpu.perfcap"] = "power" };
            sb.Append(CsvLogger.Row(start.AddSeconds(i), "g.exe", ["fps.current", "gpu.temp", "gpu.perfcap", "cpu.load"], values, texts, i == 10));
        }
        var r = SessionSeries.Read(new StringReader(sb.ToString()), 10)!;
        Assert.Equal(59.9, r.StepSec);
        Assert.Equal(["fps.current", "gpu.temp"], r.Series.Keys.Order().ToArray()); // cpu.load vazio, perfcap não é série
        Assert.Equal(100, r.Series["fps.current"][0]);
        Assert.Equal(200, r.Series["fps.current"][9]);
        Assert.Equal(10, r.Series["fps.current"].Length);
    }

    [Fact]
    public void Read_FewerRowsThanPoints_OneBucketPerRow()
    {
        var text = "timestamp,game,fps.current\n2026-11-19 21:00:00.000,g,60\n2026-11-19 21:00:01.000,g,70\n2026-11-19 21:00:02.000,g,80\n";
        var r = SessionSeries.Read(new StringReader(text), 120)!;
        Assert.Equal([60, 70, 80], r.Series["fps.current"]);
    }

    [Fact]
    public void Read_NotACsv_ReturnsNull()
    {
        Assert.Null(SessionSeries.Read(new StringReader("hello\nworld"), 120));
        Assert.Null(SessionSeries.Read(new StringReader(""), 120));
    }
}

public class HotkeyParserTests
{
    [Theory]
    [InlineData("Ctrl+Alt+P", HotkeyParser.ModControl | HotkeyParser.ModAlt, 'P')]
    [InlineData("ctrl + alt + m", HotkeyParser.ModControl | HotkeyParser.ModAlt, 'M')]
    [InlineData("Ctrl+Alt+Shift+Win+7", HotkeyParser.ModControl | HotkeyParser.ModAlt | HotkeyParser.ModShift | HotkeyParser.ModWin, '7')]
    [InlineData("Control+Windows+Z", HotkeyParser.ModControl | HotkeyParser.ModWin, 'Z')]
    [InlineData("Shift+F12", HotkeyParser.ModShift, 0x7B)]
    [InlineData("F24", 0u, 0x87)]
    [InlineData("Alt+F1", HotkeyParser.ModAlt, 0x70)]
    public void Valid(string text, uint mods, uint vk)
    {
        Assert.Equal(HotkeyState.Ok, HotkeyParser.Parse(text, out var m, out var k));
        Assert.Equal(mods, m);
        Assert.Equal(vk, k);
    }

    [Theory]
    [InlineData("P")]           // letra sem modificador
    [InlineData("Ctrl+Alt")]    // só modificadores
    [InlineData("Ctrl+F25")]
    [InlineData("Ctrl+F0")]
    [InlineData("Ctrl+F01")]
    [InlineData("Ctrl+Esc")]
    [InlineData("Ctrl+P+Alt")]  // tecla no meio
    [InlineData("Ctrl++P")]
    [InlineData("Ctrl+PP")]
    public void Invalid(string text) => Assert.Equal(HotkeyState.Invalid, HotkeyParser.Parse(text, out _, out _));

    [Theory]
    [InlineData("")]
    [InlineData("  ")]
    [InlineData(null)]
    public void EmptyIsOff(string? text) => Assert.Equal(HotkeyState.Off, HotkeyParser.Parse(text, out _, out _));
}

public class FpsReasonAndSystemInfoTests
{
    [Fact]
    public void FpsReason_Order()
    {
        Assert.Null(FpsReason.For(true, true, true, true, false, true, null));
        Assert.Equal("noPresentMon", FpsReason.For(false, true, false, false, true, false, null));
        Assert.Equal("notAdmin", FpsReason.For(false, true, true, false, false, true, null));
        Assert.Equal("antiCheat", FpsReason.For(false, true, true, true, true, false, "error: failed to start trace session: access denied."));
        Assert.Equal("otherCapture", FpsReason.For(false, true, true, true, false, false, "error: failed to start trace session: too many sessions"));
        Assert.Equal("noGame", FpsReason.For(false, false, true, true, false, true, null));
        Assert.Equal("noGame", FpsReason.For(false, false, true, true, false, false, null));
        Assert.Equal("starting", FpsReason.For(false, true, true, true, false, false, null));
        Assert.Equal("noFrames", FpsReason.For(false, true, true, true, false, true, null));
    }

    [Fact]
    public void OsName_Windows11ByBuild()
    {
        Assert.Equal("Windows 11 24H2", SystemInfo.OsName(26100, "24H2"));
        Assert.Equal("Windows 10 22H2", SystemInfo.OsName(19045, "22H2"));
        Assert.Equal("Windows 11", SystemInfo.OsName(22000, null));
    }

    [Fact]
    public void RamGb_RoundsToNearest()
    {
        Assert.Equal(32, SystemInfo.RamGb(34_225_000_000)); // 31,87 GiB visíveis
        Assert.Equal(16, SystemInfo.RamGb(17_000_000_000));
    }
}
