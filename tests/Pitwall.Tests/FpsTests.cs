using Pitwall.Fps;

namespace Pitwall.Tests;

public class FrameStatsTests
{
    [Fact]
    public void Low_IsAverageOfWorstFrames()
    {
        // 99 frames de 10 ms + 1 de 50 ms: o 1% pior é o frame de 50 ms → 20 FPS
        var frames = Enumerable.Repeat(10.0, 99).Append(50.0).OrderBy(x => x).ToArray();
        Assert.Equal(20, FrameStats.Low(frames, 0.01)!.Value, 6);
        Assert.Equal(20, FrameStats.Low(frames, 0.001)!.Value, 6);
    }

    [Fact]
    public void Low_RoundsFrameCountUp()
    {
        // 1010 frames: 1% = ceil(10,1) = 11 piores → 10×100 ms + 1×10 ms
        var frames = Enumerable.Repeat(10.0, 1000).Concat(Enumerable.Repeat(100.0, 10)).OrderBy(x => x).ToArray();
        Assert.Equal(1000.0 / (1010.0 / 11), FrameStats.Low(frames, 0.01)!.Value, 6);
    }

    [Fact]
    public void Low_NeedsAtLeast20Frames()
    {
        Assert.Null(FrameStats.Low(Enumerable.Repeat(10.0, 19).ToArray(), 0.01));
        Assert.NotNull(FrameStats.Low(Enumerable.Repeat(10.0, 20).ToArray(), 0.01));
    }

    [Fact]
    public void Snapshot_ConstantFrametime()
    {
        var s = new FrameStats("game.exe");
        for (int i = 0; i < 500; i++) s.Add(10);
        var snap = s.Snapshot();
        Assert.True(snap.HasData);
        Assert.Equal(100, snap.Current, 6);
        Assert.Equal(10, snap.FrametimeMs, 6);
        Assert.Equal(100, snap.Low1!.Value, 6);
        Assert.Equal(100, snap.SessionAvg!.Value, 6);
        Assert.Null(snap.Displayed); // sem rastreio de tela
    }

    [Fact]
    public void Snapshot_StutterShowsInLows()
    {
        var s = new FrameStats("game.exe");
        for (int i = 0; i < 990; i++) s.Add(10);
        for (int i = 0; i < 10; i++) s.Add(50);
        var snap = s.Snapshot();
        Assert.Equal(20, snap.Low1!.Value, 6);
        Assert.True(snap.SessionAvg < 100);
    }

    [Fact]
    public void Add_IgnoresInvalidFrametimes()
    {
        var s = new FrameStats("game.exe");
        s.Add(0);
        s.Add(-5);
        s.Add(10_000);
        Assert.False(s.Snapshot().HasData);
        Assert.Equal(0, s.SessionFrames);
    }

    [Fact]
    public void AddPresent_GeneratedFramesCountOnlyAsDisplayed()
    {
        // Geração de frames 2x: jogo a 60 FPS (16,67 ms), um frame gerado no meio de cada par; tela a 120 FPS
        var s = new FrameStats("game.exe");
        double start = 0;
        for (int i = 0; i < 400; i++)
        {
            var generated = i % 2 == 1;
            start += 8.333;
            s.AddPresent(new PresentRow("game.exe", 1, 8.333, 8.333, start, generated ? FrameKind.Generated : FrameKind.Application));
        }
        var snap = s.Snapshot();
        Assert.Equal(60, snap.Current, 0);
        Assert.Equal(120, snap.Displayed!.Value, 0);
    }

    [Fact]
    public void AddPresent_WithoutFrameTypeUsesPresentInterval()
    {
        var s = new FrameStats("game.exe");
        for (int i = 0; i < 300; i++)
            s.AddPresent(new PresentRow("game.exe", 1, 10, i % 4 == 0 ? null : 13.33, i * 10, FrameKind.Unknown));
        var snap = s.Snapshot();
        Assert.Equal(100, snap.Current, 6);
        Assert.Equal(75, snap.Displayed!.Value, 0); // 1 em cada 4 descartado
    }

    [Fact]
    public void CurrentFps_MatchesSnapshot()
    {
        var s = new FrameStats("app.exe");
        for (int i = 0; i < 100; i++) s.Add(25);
        Assert.Equal(40, s.CurrentFps(), 6);
    }
}

public class PresentMonCsvTests
{
    // Cabeçalhos e linhas reais do PresentMon 2.6.0 (--v1_metrics e padrão v2 com --track_frame_type)
    const string V1Header = "Application,ProcessID,SwapChainAddress,Runtime,SyncInterval,PresentFlags,Dropped,TimeInSeconds,msInPresentAPI,msBetweenPresents,AllowsTearing,PresentMode,msUntilRenderComplete,msUntilDisplayed,msBetweenDisplayChange,msFlipDelay";
    const string V1Line = "claude.exe,12712,0x0000024FB9E7BF80,DXGI,0,0,0,0.07001710000000,0.18820000000000,32.76260000000000,0,Composed: Flip,0.27210000000000,8.85890000000000,38.82890000000000,0.00000000000000";
    const string V1NoDisplayHeader = "Application,ProcessID,SwapChainAddress,Runtime,SyncInterval,PresentFlags,Dropped,TimeInSeconds,msInPresentAPI,msBetweenPresents";
    const string V2Header = "Application,ProcessID,SwapChainAddress,PresentRuntime,SyncInterval,PresentFlags,AllowsTearing,PresentMode,FrameType,CPUStartTime,FrameTime,CPUBusy,CPUWait,DisplayLatency,DisplayedTime,AnimationError,AnimationTime,MsFlipDelay";
    const string V2Line = "claude.exe,12712,0x24FB9E7BF80,DXGI,0,0,0,Composed: Flip,Application,37.6686,33.6340,33.5031,0.1309,37.6922,33.4053,NA,37.6686,NA";

    [Fact]
    public void V1_Line()
    {
        var csv = PresentMonCsv.FromHeader(V1Header)!;
        Assert.Equal(1, csv.Version);
        Assert.True(csv.HasDisplay);
        Assert.True(csv.TryParse(V1Line, out var row));
        Assert.Equal("claude.exe", row.App);
        Assert.Equal(12712, row.Pid);
        Assert.Equal(32.7626, row.FrametimeMs, 4);
        Assert.Equal(38.8289, row.DisplayedMs!.Value, 4);
        Assert.Equal(70.0171, row.CpuStartMs, 3); // TimeInSeconds → ms
        Assert.Equal(FrameKind.Unknown, row.Kind);
    }

    [Fact]
    public void V1_DroppedFrameIsNotDisplayed()
    {
        var csv = PresentMonCsv.FromHeader(V1Header)!;
        var dropped = V1Line.Replace(",DXGI,0,0,0,", ",DXGI,0,0,1,");
        Assert.True(csv.TryParse(dropped, out var row));
        Assert.Null(row.DisplayedMs);
    }

    [Fact]
    public void V1_WithoutDisplayTracking()
    {
        var csv = PresentMonCsv.FromHeader(V1NoDisplayHeader)!;
        Assert.False(csv.HasDisplay);
        Assert.True(csv.TryParse("game.exe,42,0x1,DXGI,0,0,0,1.5,0.1,16.6667", out var row));
        Assert.Equal(16.6667, row.FrametimeMs, 4);
        Assert.Null(row.DisplayedMs);
    }

    [Fact]
    public void V2_Line()
    {
        var csv = PresentMonCsv.FromHeader(V2Header)!;
        Assert.Equal(2, csv.Version);
        Assert.True(csv.HasFrameType);
        Assert.True(csv.TryParse(V2Line, out var row));
        Assert.Equal(12712, row.Pid);
        Assert.Equal(33.634, row.FrametimeMs, 4);
        Assert.Equal(33.4053, row.DisplayedMs!.Value, 4);
        Assert.Equal(37.6686, row.CpuStartMs, 4);
        Assert.Equal(FrameKind.Application, row.Kind);
    }

    [Theory]
    [InlineData("Intel_XEFG", FrameKind.Generated)]
    [InlineData("AMD_AFMF", FrameKind.Generated)]
    [InlineData("Repeated", FrameKind.Repeated)]
    [InlineData("NotSet", FrameKind.Unknown)]
    [InlineData("Application", FrameKind.Application)]
    public void V2_FrameType(string type, FrameKind expected)
    {
        var csv = PresentMonCsv.FromHeader(V2Header)!;
        Assert.True(csv.TryParse(V2Line.Replace(",Application,", $",{type},"), out var row));
        Assert.Equal(expected, row.Kind);
    }

    [Fact]
    public void V2_NotDisplayed()
    {
        var csv = PresentMonCsv.FromHeader(V2Header)!;
        var line = "game.exe,7,0x1,DXGI,0,0,0,Hardware: Independent Flip,Application,10.0,6.9,6.0,0.9,NA,NA,NA,10.0,NA";
        Assert.True(csv.TryParse(line, out var row));
        Assert.Null(row.DisplayedMs);
        Assert.Equal(6.9, row.FrametimeMs, 4);
    }

    [Fact]
    public void V2_WithoutFrameTypeColumn()
    {
        var header = "Application,ProcessID,SwapChainAddress,PresentRuntime,SyncInterval,PresentFlags,AllowsTearing,PresentMode,CPUStartTime,FrameTime,CPUBusy,CPUWait,DisplayLatency,DisplayedTime,AnimationError,AnimationTime,MsFlipDelay";
        var csv = PresentMonCsv.FromHeader(header)!;
        Assert.False(csv.HasFrameType);
        Assert.True(csv.TryParse("Enpass.exe,21220,0x1E4C09BE050,DXGI,1,0,0,Composed: Flip,74.7370,15.2216,14.8505,0.3711,24.9035,16.6313,NA,74.7370,NA", out var row));
        Assert.Equal(15.2216, row.FrametimeMs, 4);
        Assert.Equal(16.6313, row.DisplayedMs!.Value, 4);
        Assert.Equal(FrameKind.Unknown, row.Kind);
    }

    [Fact]
    public void RejectsNonHeaderAndBadRows()
    {
        Assert.Null(PresentMonCsv.FromHeader("warning: something"));
        var csv = PresentMonCsv.FromHeader(V2Header)!;
        Assert.False(csv.TryParse("garbage", out _));
        Assert.False(csv.TryParse("game.exe,abc,0x1,DXGI,0,0,0,x,Application,1,16,1,1,1,1,NA,1,NA", out _));
        Assert.False(csv.TryParse("game.exe,5,0x1,DXGI,0,0,0,x,Application,1,NA,1,1,1,1,NA,1,NA", out _));
    }
}
