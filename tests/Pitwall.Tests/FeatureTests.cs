using System.Text.Json;
using Pitwall.Config;
using Pitwall.Games;
using Pitwall.Metrics;

namespace Pitwall.Tests;

public class FeatureAndClockReasonTests
{
    [Fact]
    public void Accumulator_SecondsPerClockReason()
    {
        var acc = new SessionStatsAccumulator();
        Assert.Null(acc.ClockReasonSeconds());
        acc.AddClockReason("power", 1);
        acc.AddClockReason("power", 1.4);
        acc.AddClockReason("thermal", 0.4);
        acc.AddClockReason(null, 3);      // sem leitura: não conta
        acc.AddClockReason("voltage", 0); // primeiro tick (dt = 0): não conta
        var sec = acc.ClockReasonSeconds()!;
        Assert.Equal(2, sec["power"]);
        Assert.Equal(0, sec["thermal"]);
        Assert.False(sec.ContainsKey("voltage"));

        var s = new GameSession { Exe = "g.exe", Start = new DateTime(2026, 11, 18, 20, 0, 0) };
        acc.ApplyTo(s, s.Start.AddMinutes(1));
        Assert.Equal(2, s.ClockReasonSec!["power"]);

        var json = JsonSerializer.Serialize(s, ConfigStore.Json);
        Assert.Contains("\"clockReasonSec\"", json);
        Assert.Contains("\"power\": 2", json);
    }

    [Fact]
    public void Accumulator_NoClockReasonsWhenFeatureOff()
    {
        // Com features.clockReason desligado o hub nunca chama AddClockReason: a sessão sai sem o campo
        var acc = new SessionStatsAccumulator();
        var s = new GameSession { Exe = "g.exe", Start = new DateTime(2026, 11, 18, 20, 0, 0) };
        acc.ApplyTo(s, s.Start.AddMinutes(1));
        Assert.Null(s.ClockReasonSec);
        Assert.DoesNotContain("clockReasonSec", JsonSerializer.Serialize(s, ConfigStore.Json));
    }

    [Fact]
    public void ClockReasonsNode_LiveOrLastSession()
    {
        var live = new Dictionary<string, double> { ["voltage"] = 120, ["power"] = 30 };
        var last = new Dictionary<string, double> { ["thermal"] = 10 };

        var inGame = TelemetryHub.ClockReasonsNode("FC25.exe", live, "Old.exe", last)!;
        Assert.True(inGame["live"]!.GetValue<bool>());
        Assert.Equal("FC25.exe", inGame["exe"]!.GetValue<string>());
        Assert.Equal(120, inGame["sec"]!["voltage"]!.GetValue<double>());

        var idle = TelemetryHub.ClockReasonsNode(null, null, "Old.exe", last)!;
        Assert.False(idle["live"]!.GetValue<bool>());
        Assert.Equal("Old.exe", idle["exe"]!.GetValue<string>());

        Assert.Null(TelemetryHub.ClockReasonsNode("FC25.exe", null, "Old.exe", last)); // jogo sem leitura ainda
        Assert.Null(TelemetryHub.ClockReasonsNode(null, null, null, null));
    }

    [Fact]
    public void Features_DefaultOnAndSurviveSetConfigSanitize()
    {
        var c = new AppConfig { Features = null! };
        ConfigStore.Sanitize(c);
        Assert.NotNull(c.Features);
        Assert.True(c.Features.CrashReport && c.Features.GameSuggestions && c.Features.SessionPeaks && c.Features.ClockReason);

        // A página manda o config inteiro (setConfig): o que ela desligou continua desligado
        var json = """{ "features": { "crashReport": false, "gameSuggestions": true, "sessionPeaks": false, "clockReason": true } }""";
        var fromPage = JsonSerializer.Deserialize<AppConfig>(json, ConfigStore.Json)!;
        ConfigStore.Sanitize(fromPage);
        Assert.False(fromPage.Features.CrashReport);
        Assert.True(fromPage.Features.GameSuggestions);
        Assert.False(fromPage.Features.SessionPeaks);
        Assert.True(fromPage.Features.ClockReason);
    }

    [Fact]
    public void Suggester_ClearDropsPendingSuggestion()
    {
        // features.gameSuggestions desligado: o hub limpa a sugestão pendente e para de chamar Update
        var g = new GameSuggester();
        var cfg = new GamesConfig();
        g.Update("x.exe", true, null, cfg, 1);
        g.Update("x.exe", true, null, cfg, 1 + GameSuggester.RequiredMs);
        Assert.Equal("x.exe", g.Suggestion);
        g.Clear();
        Assert.Null(g.Suggestion);
    }
}
