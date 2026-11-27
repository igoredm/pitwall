using Pitwall.Battery;

namespace Pitwall.Tests;

/// <summary>Saída do "BatteryHub.exe --json" (v1.1.0, src/json_output.h).</summary>
public class BatteryParseTests
{
    [Fact]
    public void RealOutput_AulaMouse()
    {
        var d = Assert.Single(BatteryService.Parse(
            "[{\"key\":\"aula-infortech:38A6:28F9\",\"name\":\"AULA X5 Ultra\",\"via\":\"2.4 GHz receiver\",\"kind\":\"mouse\"," +
            "\"percent\":81,\"level\":\"\",\"detail\":\"\",\"charging\":false,\"asleep\":false,\"connected\":true," +
            "\"millivolts\":0,\"graceSec\":1800}]\n"));
        Assert.Equal("AULA X5 Ultra", d.Name);
        Assert.Equal("aula-infortech:38A6:28F9", d.Key);
        Assert.Equal("2.4 GHz receiver", d.Via);
        Assert.Equal("mouse", d.Kind);
        Assert.Equal(81, d.Percent);
        Assert.Null(d.LevelText);
        Assert.True(d.Connected);
    }

    [Fact]
    public void States_AndLevelText()
    {
        var list = BatteryService.Parse("""
            [{"key":"razer:0552","name":"Razer Barracuda X","via":"2.4 GHz receiver","kind":"headset","percent":85,"level":"","detail":"","charging":true,"asleep":false,"connected":true,"millivolts":0,"graceSec":0},
             {"key":"hidpp:c54f","name":"Logitech G Pro","via":"LIGHTSPEED","kind":"mouse","percent":-1,"level":"","detail":"","charging":false,"asleep":true,"connected":true,"millivolts":0,"graceSec":0},
             {"key":"8bitdo:310b","name":"8BitDo Ultimate 2","via":"2.4 GHz receiver","kind":"gamepad","percent":-1,"level":"Full","detail":"","charging":false,"asleep":false,"connected":true,"millivolts":0,"graceSec":0},
             {"key":"bt:1","name":"Xbox Wireless Controller","via":"Bluetooth","kind":"gamepad","percent":-1,"level":"","detail":"","charging":false,"asleep":false,"connected":false,"millivolts":0,"graceSec":0}]
            """);
        Assert.Equal(4, list.Count);
        Assert.True(list[0].Charging);
        Assert.Equal("headset", list[0].Kind);
        Assert.True(list[1].Asleep);
        Assert.Null(list[1].Percent);
        Assert.Equal("Full", list[2].LevelText);
        Assert.False(list[3].Connected);
    }

    [Fact]
    public void OtherKind_FallsBackToName()
    {
        var d = Assert.Single(BatteryService.Parse(
            "[{\"key\":\"x\",\"name\":\"SteelSeries Arctis 7\",\"via\":\"USB\",\"kind\":\"other\",\"percent\":40}]"));
        Assert.Equal("headset", d.Kind);
        Assert.Equal(40, d.Percent);
    }

    /// <summary>1.5: saída real do batteryhub-json (Rust, fork igoredm) no PC do autor: campo "full" novo é ignorado.</summary>
    [Fact]
    public void RealOutput_RustReader()
    {
        const string json = "[{\"key\":\"compx:373b:11d9\",\"name\":\"ATK 8K mouse\",\"via\":\"2.4 GHz receiver\",\"kind\":\"mouse\",\"percent\":-1,\"level\":\"\",\"detail\":\"\",\"charging\":false,\"full\":false,\"asleep\":false,\"connected\":false,\"millivolts\":0,\"graceSec\":1800}," +
            "{\"key\":\"aula-infortech:38A6:28F9\",\"name\":\"AULA X5 Ultra\",\"via\":\"2.4 GHz receiver\",\"kind\":\"mouse\",\"percent\":91,\"level\":\"\",\"detail\":\"\",\"charging\":false,\"full\":false,\"asleep\":false,\"connected\":true,\"millivolts\":0,\"graceSec\":1800}]\n";
        var list = BatteryService.Parse(json);
        Assert.Equal(2, list.Count);
        Assert.False(list[0].Connected);
        Assert.Null(list[0].Percent);
        Assert.Equal("AULA X5 Ultra", list[1].Name);
        Assert.Equal(91, list[1].Percent);
        Assert.True(list[1].Connected);
    }

    [Theory]
    [InlineData("")]
    [InlineData("[]\n")]
    [InlineData("[{\"name\":\"sem chave\"}]")]
    public void EmptyOrIncomplete_GivesNothing(string json) => Assert.Empty(BatteryService.Parse(json));
}
