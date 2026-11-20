using System.Diagnostics;
using Pitwall.Fps;
using Xunit.Abstractions;

namespace Pitwall.Tests;

/// <summary>Micro benchmark do leitor do CSV do PresentMon (custo por linha, cabeçalho real do 2.6 com --v2_metrics).</summary>
public class ParserBenchTests(ITestOutputHelper output)
{
    const string Header = "Application,ProcessID,SwapChainAddress,PresentRuntime,SyncInterval,PresentFlags,AllowsTearing,PresentMode,FrameType,CPUStartTime,FrameTime,CPUBusy,CPUWait,DisplayLatency,DisplayedTime,AnimationError,AnimationTime,MsFlipDelay";
    const string Line = "game.exe,2340,0x20E832B5998,DXGI,0,0,1,Hardware: Independent Flip,Application,10.4057,8.0639,7.6920,0.3719,20.0039,5.5647,-0.4213,10.4057,NA";

    [Fact]
    public void ParseCostPerLine()
    {
        var csv = PresentMonCsv.FromHeader(Header)!;
        const int n = 200_000;
        for (int i = 0; i < 20_000; i++) csv.TryParse(Line, out _);
        var best = double.MaxValue;
        for (int run = 0; run < 5; run++)
        {
            var sw = Stopwatch.StartNew();
            for (int i = 0; i < n; i++) csv.TryParse(Line, out _);
            best = Math.Min(best, sw.Elapsed.TotalNanoseconds / n);
        }
        output.WriteLine($"PresentMonCsv.TryParse: {best:0} ns/linha");
        // Folga larga (máquina de CI lenta): o que importa é a ordem de grandeza (300 fps = 300 linhas/s)
        Assert.True(best < 20_000);
    }

    [Fact]
    public void StutterDetectorCostPerFrame()
    {
        var d = new StutterDetector();
        var frames = Enumerable.Range(0, 300_000).Select(i => i % 97 == 0 ? 25f : 3.3f + (i % 7) * 0.05f).ToArray();
        d.Add(frames.AsSpan(0, 10_000));
        var sw = Stopwatch.StartNew();
        d.Add(frames.AsSpan(10_000));
        var ns = sw.Elapsed.TotalNanoseconds / (frames.Length - 10_000);
        output.WriteLine($"StutterDetector.Add: {ns:0} ns/frame ({d.Count} engasgos)");
        Assert.True(ns < 20_000);
    }
}
