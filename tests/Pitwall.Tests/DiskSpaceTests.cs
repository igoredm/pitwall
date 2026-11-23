using Pitwall.Config;
using Pitwall.Games;
using Pitwall.Metrics;
using Pitwall.Sensors;

namespace Pitwall.Tests;

/// <summary>1.3.1: disco sem volume legível não tem "espaço usado", e espaço em disco não conta como tempo acima do limite.</summary>
public class DiskSpaceTests
{
    [Theory]
    [InlineData("/nvme/3", false)] // só partição que o Windows não lê
    [InlineData("/nvme/2", true)]
    [InlineData("/ssd/0", true)]
    [InlineData("/ssd/1/", false)]
    [InlineData("/nvme/abc", true)] // id fora do padrão: mantém
    public void ReadableSpace_FollowsPhysicalDisk(string id, bool expected) =>
        Assert.Equal(expected, DiskVolumes.HasReadableSpace(id, new HashSet<int> { 0, 2, 4 }));

    [Fact]
    public void NoVolumeInfo_KeepsMetric() => Assert.True(DiskVolumes.HasReadableSpace("/nvme/3", new HashSet<int>()));

    [Fact]
    public void DiskUsed_DoesNotCountAsTimeAboveLimit()
    {
        var acc = new SessionStatsAccumulator();
        MetricSetting[] settings =
        [
            new() { Id = "disk1.used", Warn = 90, Crit = 97 },
            new() { Id = "disk1.temp", Warn = 60, Crit = 70 },
        ];
        acc.AddTick(new Dictionary<string, double?> { ["disk1.used"] = 99.9, ["disk1.temp"] = 75 }, settings, 10);
        var session = new GameSession { Exe = "game.exe", Start = DateTime.Now };
        acc.ApplyTo(session, DateTime.Now);
        Assert.False(session.SecondsAboveCrit!.ContainsKey("disk1.used"));
        Assert.Equal(10, session.SecondsAboveCrit["disk1.temp"]);
    }
}
