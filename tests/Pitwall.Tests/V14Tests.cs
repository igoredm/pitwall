using Pitwall.Health;

namespace Pitwall.Tests;

/// <summary>1.4: "Instalado recentemente" no Relatório do PC.</summary>
public class PcInstallsTests
{
    static readonly DateTime Since = new(2026, 10, 26);

    [Fact]
    public void InstallDate_yyyyMMdd_is_date_only()
    {
        var r = PcInstalls.ParseInstallDate("20261120");
        Assert.Equal((new DateTime(2026, 11, 20), true), r);
    }

    [Fact]
    public void InstallDate_unix_seconds_has_time()
    {
        var r = PcInstalls.ParseInstallDate("1785020514");
        Assert.NotNull(r);
        Assert.False(r!.Value.DateOnly);
        Assert.Equal(DateTimeOffset.FromUnixTimeSeconds(1785020514).LocalDateTime, r.Value.Time);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("2026")]
    [InlineData("abc")]
    public void InstallDate_invalid_is_null(string? s) => Assert.Null(PcInstalls.ParseInstallDate(s));

    [Fact]
    public void Program_skips_system_components_updates_and_children()
    {
        Assert.NotNull(PcInstalls.ProgramItem("TeamSpeak", "6.0.0", "TeamSpeak", "20261123", false, false, null));
        Assert.Null(PcInstalls.ProgramItem("X", null, null, "20261123", true, false, null));
        Assert.Null(PcInstalls.ProgramItem("X", null, null, "20261123", false, true, null));
        Assert.Null(PcInstalls.ProgramItem("X", null, null, "20261123", false, false, "Security Update"));
        Assert.Null(PcInstalls.ProgramItem("  ", null, null, "20261123", false, false, null));
        Assert.Null(PcInstalls.ProgramItem("X", null, null, null, false, false, null));
    }

    static object?[] PnpProps(string device, string inf, string cls, string ver, string prov, string store)
    {
        var p = new object?[15];
        p[0] = device; p[1] = inf; p[2] = cls; p[4] = ver; p[5] = prov; p[14] = store;
        return p;
    }

    [Fact]
    public void Pnp_uses_original_inf_name_from_driver_store()
    {
        var x = PcInstalls.Pnp(new DateTime(2026, 11, 20, 17, 11, 0),
            PnpProps(@"USB\VID_05AC&PID_828D\6&1d503be9&0&3", "oem36.inf", "e0cbf06c-cd8b-4647-bb8a-263b43f0f974", "6.0.6100.0", "Apple Inc.", "applebtbc.inf_amd64_1234"));
        Assert.NotNull(x);
        Assert.Equal("applebtbc.inf", x!.Inf);
        Assert.Equal("Apple Inc.", x.Provider);
        Assert.Equal("bluetooth", PcInstalls.ClassOf(x.ClassGuid, x.Device));
    }

    [Fact]
    public void Driver_counts_only_first_configuration_and_inside_window()
    {
        var net = "4d36e972-e325-11ce-bfc1-08002be10318";
        var pnp = new[]
        {
            // repete a cada boot desde agosto: não é novo
            new PcInstalls.PnpConfigured(new DateTime(2026, 8, 1), "ROOT\\VMS", "wvms.inf", "1.0", "Microsoft", net),
            new PcInstalls.PnpConfigured(new DateTime(2026, 11, 25), "ROOT\\VMS", "wvms.inf", "1.0", "Microsoft", net),
            // novo em 20/11
            new PcInstalls.PnpConfigured(new DateTime(2026, 11, 20, 17, 11, 0), "PCI\\VEN_14E4&DEV_43A0", "bcmwl63a.inf", "7.35.118.40", "Broadcom", net),
            new PcInstalls.PnpConfigured(new DateTime(2026, 11, 21, 9, 0, 0), "PCI\\VEN_14E4&DEV_43A0", "bcmwl63a.inf", "7.35.118.40", "Broadcom", net),
        };
        var services = new[]
        {
            (new DateTime(2026, 11, 20, 17, 11, 30), "BCM43XX", "PCI\\VEN_14E4&DEV_43A0"), // já coberto pelo driver acima
            (new DateTime(2026, 10, 27, 20, 37, 0), "kltun", "ROOT\\NET\\0001"),
        };
        var items = PcInstalls.DriverItems(pnp, services, Since);
        Assert.Equal(2, items.Count);
        var bcm = Assert.Single(items, i => i.Name == "bcmwl63a.inf");
        Assert.Equal(new DateTime(2026, 11, 20, 17, 11, 0), bcm.Time);
        Assert.Equal("net", bcm.DeviceClass);
        Assert.Contains(items, i => i.Name == "kltun");
    }

    [Fact]
    public void Update_skips_defender_definitions()
    {
        Assert.Null(PcInstalls.Update(DateTime.Now, "Atualização de inteligência de segurança para Microsoft Defender Antivirus - KB2267602 (versão 1.463.470.0)"));
        Assert.Equal("update", PcInstalls.Update(DateTime.Now, "2026-11 Atualização cumulativa (KB5070000)")!.Kind);
    }

    [Fact]
    public void Update_store_app_gets_package_name()
    {
        var u = PcInstalls.Update(DateTime.Now, "9NMPJ99VJBWV-Microsoft.YourPhone")!;
        Assert.Equal("store", u.Kind);
        Assert.Equal("Microsoft.YourPhone", u.Name);
    }

    [Fact]
    public void Vendor_from_pci_id() =>
        Assert.Equal("Broadcom", PcInstalls.VendorOf(@"PCI\VEN_14E4&DEV_43A0&SUBSYS_0111106B&REV_03\B80900FFFF00000000"));

    [Fact]
    public void Finish_dedupes_and_sorts_newest_first()
    {
        var a = new PcInstall { Time = new DateTime(2026, 11, 1), Kind = "program", Name = "Git", Version = "2.56" };
        var b = new PcInstall { Time = new DateTime(2026, 11, 2), Kind = "program", Name = "git", Version = "2.56" };
        var c = new PcInstall { Time = new DateTime(2026, 11, 3), Kind = "driver", Name = "x.inf" };
        var list = PcInstalls.Finish([a, b, c]);
        Assert.Equal(2, list.Count);
        Assert.Same(c, list[0]);
        Assert.Same(b, list[1]);
    }
}
