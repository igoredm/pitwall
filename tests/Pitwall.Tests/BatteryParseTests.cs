using Pitwall.Battery;

namespace Pitwall.Tests;

/// <summary>Saída do "WirelessBattery.exe --list": formato antigo (5b872f8) e novo com {Marca} (958a60a).</summary>
public class BatteryParseTests
{
    [Fact]
    public void OldFormat_StillParses()
    {
        var d = Assert.Single(BatteryService.Parse("AULA X5 Ultra  [2.4 GHz receiver]  76%   (aula:2f08)\r\n"));
        Assert.Equal("AULA X5 Ultra", d.Name);
        Assert.Equal(76, d.Percent);
    }

    [Fact]
    public void NewFormat_WithBrandToken()
    {
        var list = BatteryService.Parse(
            "Razer Barracuda X  [2.4 GHz receiver]  {Razer}  85%, charging   (razer:0552)\n" +
            "Logitech G Pro  [LIGHTSPEED]  {Logitech}  asleep   (hidpp:c54f)\n" +
            "8BitDo Ultimate 2  [2.4 GHz receiver]  {8BitDo}  Full   (8bitdo:310b)\n" +
            "No devices with battery info found.\n");
        Assert.Equal(3, list.Count);
        Assert.Equal("Razer Barracuda X", list[0].Name);
        Assert.Equal(85, list[0].Percent);
        Assert.True(list[0].Charging);
        Assert.Equal("headset", list[0].Kind);
        Assert.True(list[1].Asleep);
        Assert.Equal("Full", list[2].LevelText);
        Assert.Equal("gamepad", list[2].Kind);
    }

    [Fact]
    public void Detail_IsStripped()
    {
        var d = Assert.Single(BatteryService.Parse("Rapoo VT9  [2.4 GHz receiver]  {Rapoo}  60% (approximate (raw 0x3c))   (rapoo:1)\n"));
        Assert.Equal(60, d.Percent);
    }
}
