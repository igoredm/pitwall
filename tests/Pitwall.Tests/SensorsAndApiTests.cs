using System.Text.Json.Nodes;
using Pitwall.Config;
using Pitwall.Metrics;
using Pitwall.Sensors;
using Pitwall.Server;

namespace Pitwall.Tests;

public class MissingReasonTests
{
    static MissingContext Nvidia(string name = "NVIDIA GeForce RTX 3080", bool pawn = true, bool admin = true, bool pm = true) =>
        new("nvidia", name, pawn, admin, pm);

    [Theory]
    [InlineData("NVIDIA GeForce RTX 5090", true)]
    [InlineData("NVIDIA GeForce RTX 5070 Ti", true)]
    [InlineData("NVIDIA GeForce RTX 5060 Laptop GPU", true)]
    [InlineData("NVIDIA GeForce RTX 4090", false)]
    [InlineData("NVIDIA GeForce RTX 3080", false)]
    [InlineData(null, false)]
    public void Rtx50(string? name, bool expected) => Assert.Equal(expected, MissingReasons.IsRtx50(name));

    [Fact]
    public void Hotspot_on_rtx50_says_nvidia_removed_it()
    {
        var r = MissingReasons.For("gpu.hotspot", Nvidia("NVIDIA GeForce RTX 5080"));
        Assert.Equal(MissingReason.NotExposed, r.Reason);
        Assert.Contains("RTX 50", r.Text);
        Assert.Contains("RTX 50", MissingReasons.For("gpu.hotspotDelta", Nvidia("NVIDIA GeForce RTX 5080")).Text);
        Assert.DoesNotContain("RTX 50", MissingReasons.For("gpu.hotspot", Nvidia()).Text);
    }

    [Theory]
    [InlineData("amd", "AMD")]
    [InlineData("intel", "Intel")]
    public void Gpu_sensor_on_amd_or_intel_names_the_brand(string vendor, string brand)
    {
        var r = MissingReasons.For("gpu.fanRpm", new MissingContext(vendor, "Some GPU", true, true, true));
        Assert.Equal(MissingReason.NotExposed, r.Reason);
        Assert.Contains(brand, r.Text);
    }

    [Fact]
    public void Clock_reason_needs_nvidia()
    {
        Assert.Equal(MissingReason.NeedsNvidia, MissingReasons.For("gpu.perfcap", new MissingContext("amd", "RX 7900", true, true, true)).Reason);
        Assert.Equal(MissingReason.NotExposed, MissingReasons.For("gpu.perfcap", Nvidia()).Reason);
    }

    [Theory]
    [InlineData("cpu.temp")]
    [InlineData("cpu.power")]
    [InlineData("cpu.clockAvg")]
    [InlineData("cpu.p1.temp")]
    [InlineData("cpu.e2.clock")]
    [InlineData("ram.dimm1.temp")]
    [InlineData("mb.temp3")]
    public void Cpu_sensors_need_pawnio_then_admin(string id)
    {
        Assert.Equal(MissingReason.NeedsPawnIO, MissingReasons.For(id, Nvidia(pawn: false)).Reason);
        Assert.Equal(MissingReason.NeedsPawnIO, MissingReasons.For(id, Nvidia(pawn: false, admin: false)).Reason);
        Assert.Equal(MissingReason.NeedsAdmin, MissingReasons.For(id, Nvidia(admin: false)).Reason);
        Assert.Equal(MissingReason.NotExposed, MissingReasons.For(id, Nvidia()).Reason);
    }

    [Fact]
    public void Cpu_load_does_not_blame_the_driver() =>
        Assert.Equal(MissingReason.NotExposed, MissingReasons.For("cpu.load", Nvidia(pawn: false)).Reason);

    [Fact]
    public void Fps_needs_presentmon_then_admin()
    {
        Assert.Equal(MissingReason.NeedsPresentMon, MissingReasons.For("fps.current", Nvidia(pm: false)).Reason);
        Assert.Equal(MissingReason.NeedsPresentMon, MissingReasons.For("fps.low1", Nvidia(pm: false, admin: false)).Reason);
        Assert.Equal(MissingReason.NeedsAdmin, MissingReasons.For("fps.current", Nvidia(admin: false)).Reason);
    }

    [Fact]
    public void Battery_without_device_or_turned_off()
    {
        var ctx = Nvidia() with { HasDevice = false };
        Assert.Equal(MissingReason.NoDevice, MissingReasons.For("battery.mouse", ctx).Reason);
        Assert.Equal(MissingReason.Off, MissingReasons.For("battery.mouse", ctx with { BatteryOn = false }).Reason);
    }

    [Fact]
    public void Second_gpu_missing_vs_without_sensors()
    {
        Assert.Equal(MissingReason.NoDevice, MissingReasons.For("gpu2.temp", Nvidia()).Reason);
        var withRx580 = Nvidia() with { Gpu2Vendor = "amd", Gpu2Name = "Radeon RX 580 Series" };
        var r = MissingReasons.For("gpu2.temp", withRx580);
        Assert.Equal(MissingReason.NotExposed, r.Reason);
        Assert.Contains("AMD", r.Text);
    }

    [Fact]
    public void No_gpu_at_all_is_no_device() =>
        Assert.Equal(MissingReason.NoDevice, MissingReasons.For("gpu.temp", new MissingContext(null, null, true, true, true)).Reason);

    [Fact]
    public void Every_catalog_metric_gets_a_reason_and_text()
    {
        var ctx = new MissingContext("intel", "Intel Arc A770", false, false, false);
        string[] valid = [MissingReason.NotExposed, MissingReason.NeedsNvidia, MissingReason.NeedsPawnIO, MissingReason.NeedsAdmin,
            MissingReason.NoDevice, MissingReason.NeedsPresentMon, MissingReason.Off];
        foreach (var d in MetricCatalog.Static)
        {
            var r = MissingReasons.For(d.Id, ctx);
            Assert.Contains(r.Reason, valid);
            Assert.False(string.IsNullOrWhiteSpace(r.Text), d.Id);
        }
    }
}

public class SensorDumpTests
{
    [Fact]
    public void Scrub_removes_identifying_things()
    {
        var text = "host: GAMER-PC user igor path C:\\Users\\igor\\AppData\\x.txt share \\\\nas\\games " +
                   "nic /nic/%7B1A2B3C4D-1111-2222-3333-444455556666%7D mac 00:1A:2B:3C:4D:5E serial S5GXNF0R123456X " +
                   "model WDS500G3XHC-00SJG0 cpu i5-12600K";
        var s = SensorDumpText.Scrub(text, ["GAMER-PC", "igor"]);
        Assert.DoesNotContain("GAMER-PC", s);
        Assert.DoesNotContain("igor", s);
        Assert.DoesNotContain("AppData", s);
        Assert.DoesNotContain("nas", s);
        Assert.DoesNotContain("1A2B3C4D", s);
        Assert.DoesNotContain("00:1A", s);
        Assert.DoesNotContain("S5GXNF0R", s);
        // Modelos de peça ficam (servem para o diagnóstico)
        Assert.Contains("WDS500G3XHC-00SJG0", s);
        Assert.Contains("i5-12600K", s);
    }

    [Fact]
    public void Write_and_parse_round_trip()
    {
        var d = new SensorDumpData();
        d.Header["app"] = "1.2.0";
        d.Header["gpu"] = "NVIDIA GeForce RTX 3080";
        d.Hardware.Add(new DumpHardware("GpuNvidia", "NVIDIA GeForce RTX 3080", "/gpu-nvidia/0", 0,
            [new DumpSensor("Temperature", "GPU Core", "/gpu-nvidia/0/temperature/0", 61.25, 35, null)]));
        d.Hardware.Add(new DumpHardware("SuperIO", "Nuvoton | NCT", "/lpc/nct6798d/0", 1, []));
        d.Mapping.Add(new DumpMapping("gpu.temp", "x (/gpu-nvidia/0/temperature/0)"));
        d.Missing.Add(new DumpMissing("gpu2.temp", "noDevice", "Sem GPU 2"));

        var text = SensorDumpText.Write(d, []);
        var back = SensorDumpText.Parse(text);
        Assert.Equal("1.2.0", back.Get("app"));
        Assert.Equal(2, back.Hardware.Count);
        Assert.Equal(1, back.Hardware[1].Depth);
        Assert.Equal("Nuvoton / NCT", back.Hardware[1].Name); // "|" vira "/" (é o separador)
        var s = back.Hardware[0].Sensors.Single();
        Assert.Equal(("Temperature", "GPU Core", 61.25, 35.0, (double?)null), (s.Type, s.Name, s.Value!.Value, s.Min!.Value, s.Max));
        Assert.Equal("gpu.temp", back.Mapping.Single().Id);
        Assert.Equal(("gpu2.temp", "noDevice", "Sem GPU 2"), (back.Missing[0].Id, back.Missing[0].Reason, back.Missing[0].Text));
    }

    [Theory]
    [InlineData("32.0.15.8157", "NVIDIA GeForce RTX 3080", "581.57 (32.0.15.8157)")]
    [InlineData("32.0.16.1074", "NVIDIA GeForce RTX 3080", "610.74 (32.0.16.1074)")]
    [InlineData("31.0.24033.1003", "AMD Radeon RX 580 Series", "31.0.24033.1003")]
    public void Driver_version(string raw, string desc, string expected) => Assert.Equal(expected, SystemInfo.FriendlyDriver(raw, desc));
}

/// <summary>
/// Fixtures = listas de sensores reais/sintéticas no formato do getSensorDump. Para testar o PC de alguém, cole a lista
/// da issue em Fixtures/&lt;nome&gt;.txt: o teste genérico roda nela sozinho.
/// </summary>
public class SensorFixtureTests
{
    static string Dir => Path.Combine(AppContext.BaseDirectory, "Fixtures");

    public static TheoryData<string> Files()
    {
        var data = new TheoryData<string>();
        foreach (var f in Directory.GetFiles(Dir, "*.txt").OrderBy(f => f)) data.Add(Path.GetFileName(f));
        return data;
    }

    static SensorDumpData Load(string file) => SensorDumpText.Parse(File.ReadAllText(Path.Combine(Dir, file)));

    static MissingContext Context(SensorDumpData d) => new(
        d.Get("gpuVendor"), d.Get("gpu"), d.Flag("pawnIO"), d.Flag("admin"), d.Flag("presentMon"),
        Gpu2Vendor: d.Get("gpu2Vendor"), Gpu2Name: d.Get("gpu2"));

    static (HashSet<string> Available, Dictionary<string, DumpSensor> Map) Analyze(SensorDumpData d)
    {
        var map = SensorMapping.MapDump(d);
        var cpu = d.Hardware.FirstOrDefault(h => h.Type == "Cpu");
        var coreClocks = cpu?.Sensors.Any(s => s.Type == "Clock" && s.Name.Contains("Core #")) == true;
        var nics = d.Hardware.Any(h => h.Type == "Network" && h.Sensors.Any(s => s.Name == "Upload Speed"));
        var available = SensorMapping.Available(map.Keys, coreClocks, nics);
        if (d.Flag("presentMon"))
            foreach (var m in MetricCatalog.Static.Where(m => m.Group == MetricGroup.Fps)) available.Add(m.Id);
        return (available, map);
    }

    [Theory]
    [MemberData(nameof(Files))]
    public void Every_fixture_parses_maps_and_explains_what_is_missing(string file)
    {
        var d = Load(file);
        Assert.NotEmpty(d.Hardware);
        var (available, map) = Analyze(d);
        var ctx = Context(d);
        foreach (var m in MetricCatalog.Static.Where(m => !available.Contains(m.Id)))
            Assert.False(string.IsNullOrWhiteSpace(MissingReasons.For(m.Id, ctx).Text));

        // O mapeamento gravado na lista (pelo app de quem gerou) bate com as regras atuais para as métricas fixas
        foreach (var recorded in d.Mapping.Where(x => SensorMapping.Rules.Any(r => r.Id == x.Id)))
        {
            Assert.True(map.TryGetValue(recorded.Id, out var sensor), $"{file}: {recorded.Id} não mapeado");
            Assert.EndsWith($"({sensor!.Identifier})", recorded.Source);
        }
    }

    [Fact]
    public void Rtx3080_12600k_rx580()
    {
        var d = Load("rtx3080-12600k-rx580.txt");
        var (available, map) = Analyze(d);
        foreach (var id in new[] { "gpu.temp", "gpu.hotspot", "gpu.hotspotDelta", "gpu.memjunction", "gpu.power", "gpu.vramLoad",
                     "cpu.temp", "cpu.power", "cpu.clockAvg", "ram.total", "ram.virtualLoad", "fps.current" })
            Assert.Contains(id, available);
        Assert.Equal("/gpu-nvidia/0/temperature/2", map["gpu.hotspot"].Identifier);
        Assert.Equal("/intelcpu/0/temperature/12", map["cpu.temp"].Identifier);

        // RX 580 secundária: o LHM lista a placa mas sem nenhum sensor
        Assert.DoesNotContain("gpu2.temp", available);
        var r = MissingReasons.For("gpu2.temp", Context(d));
        Assert.Equal(MissingReason.NotExposed, r.Reason);
        Assert.Contains("AMD", r.Text);
        Assert.Equal(MissingReason.NotExposed, MissingReasons.For("gpu2.load", Context(d)).Reason);
    }

    [Fact]
    public void Rtx5080_without_pawnio()
    {
        var d = Load("rtx5080-9800x3d-nopawnio.txt");
        var (available, _) = Analyze(d);
        var ctx = Context(d);
        Assert.Contains("gpu.temp", available);
        Assert.DoesNotContain("gpu.hotspot", available);
        Assert.Contains("RTX 50", MissingReasons.For("gpu.hotspot", ctx).Text);
        Assert.Equal(MissingReason.NeedsPawnIO, MissingReasons.For("cpu.temp", ctx).Reason);
        Assert.Equal(MissingReason.NeedsPawnIO, MissingReasons.For("cpu.power", ctx).Reason);
        Assert.Contains("cpu.load", available);
        Assert.Equal(MissingReason.NoDevice, MissingReasons.For("gpu2.temp", ctx).Reason);
    }

    [Fact]
    public void Fixtures_have_nothing_identifying()
    {
        foreach (var f in Directory.GetFiles(Dir, "*.txt"))
        {
            var text = File.ReadAllText(f);
            Assert.Equal(SensorDumpText.Scrub(text, []), text);
            Assert.DoesNotContain(Environment.MachineName, text, StringComparison.OrdinalIgnoreCase);
        }
    }
}

public class StateApiTests
{
    static readonly (string Token, PairedDevice Device) Ha = StateApi.NewToken("Home Assistant", DateTime.Now);
    static readonly string PhoneToken = PairingManager.NewToken();
    static readonly PairedDevice Phone = new() { Id = "p1", Name = "Celular", TokenHash = PairingManager.Hash(PhoneToken), Kind = DeviceKind.Phone };
    static readonly PairedDevice[] Devices = [Phone, Ha.Device];

    [Fact]
    public void New_token_stores_only_the_hash()
    {
        var (token, d) = StateApi.NewToken("  ", DateTime.Now);
        Assert.Equal(DeviceKind.Integration, d.Kind);
        Assert.Equal("Home Assistant", d.Name);
        Assert.Equal(43, token.Length); // 256 bits em base64url
        Assert.Equal(PairingManager.Hash(token), d.TokenHash);
        Assert.DoesNotContain(token, d.TokenHash);
        Assert.True(DeviceKind.IsValid(DeviceKind.Integration));
    }

    [Fact]
    public void Disabled_is_404_before_anything()
    {
        Assert.Equal(ApiDecision.NotFound, StateApi.Authorize(false, "GET", "Bearer " + Ha.Token, false, Devices).Decision);
        Assert.Equal(404, StateApi.StatusCode(ApiDecision.NotFound));
    }

    [Theory]
    [InlineData("POST")]
    [InlineData("PUT")]
    [InlineData("OPTIONS")]
    public void Only_get(string method) =>
        Assert.Equal(ApiDecision.MethodNotAllowed, StateApi.Authorize(true, method, "Bearer " + Ha.Token, false, Devices).Decision);

    [Fact]
    public void Integration_token_ok_with_any_bearer_casing()
    {
        var (decision, device) = StateApi.Authorize(true, "GET", "Bearer " + Ha.Token, false, Devices);
        Assert.Equal(ApiDecision.Ok, decision);
        Assert.Equal(Ha.Device.Id, device!.Id);
        Assert.Equal(ApiDecision.Ok, StateApi.Authorize(true, "GET", "bearer  " + Ha.Token, false, Devices).Decision);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("Basic dXNlcjpwYXNz")]
    [InlineData("Bearer")]
    [InlineData("Bearer wrong-token-wrong-token-wrong-token-xx")]
    public void Missing_or_wrong_token_is_401(string? header)
    {
        Assert.Equal(ApiDecision.Unauthorized, StateApi.Authorize(true, "GET", header, false, Devices).Decision);
        Assert.Equal(401, StateApi.StatusCode(ApiDecision.Unauthorized));
    }

    [Fact]
    public void Phone_token_is_not_accepted_on_the_api() =>
        Assert.Equal(ApiDecision.Unauthorized, StateApi.Authorize(true, "GET", "Bearer " + PhoneToken, false, Devices).Decision);

    [Fact]
    public void Integration_token_does_not_open_the_view_socket()
    {
        Assert.Null(PairingManager.Validate(Ha.Token, StateApi.ViewerDevices(Devices)));
        Assert.Equal("p1", PairingManager.Validate(PhoneToken, StateApi.ViewerDevices(Devices))!.Id);
    }

    [Fact]
    public void Blocked_ip_is_429_even_with_the_right_token()
    {
        Assert.Equal(ApiDecision.Blocked, StateApi.Authorize(true, "GET", "Bearer " + Ha.Token, true, Devices).Decision);
        Assert.Equal(429, StateApi.StatusCode(ApiDecision.Blocked));
    }

    [Fact]
    public void Revoked_token_stops_working() =>
        Assert.Equal(ApiDecision.Unauthorized, StateApi.Authorize(true, "GET", "Bearer " + Ha.Token, false, [Phone]).Decision);

    [Fact]
    public void Wrong_tokens_share_the_pairing_rate_limit()
    {
        var limiter = new AttemptLimiter();
        var now = DateTime.UtcNow;
        for (var i = 0; i < AttemptLimiter.MaxFailures; i++)
        {
            var (decision, _) = StateApi.Authorize(true, "GET", "Bearer nope", limiter.IsBlocked("1.2.3.4", now), Devices);
            Assert.Equal(ApiDecision.Unauthorized, decision);
            limiter.Fail("1.2.3.4", now);
        }
        Assert.Equal(ApiDecision.Blocked, StateApi.Authorize(true, "GET", "Bearer " + Ha.Token, limiter.IsBlocked("1.2.3.4", now), Devices).Decision);
    }

    [Fact]
    public void State_json_shape()
    {
        var json = StateApi.Build("1.2.0", new DateTimeOffset(2026, 11, 19, 21, 14, 5, TimeSpan.FromHours(-3)), "cyberpunk2077.exe",
        [
            new StateValue("gpu.temp", "GPU · Núcleo", 61.237, null, "°C"),
            new StateValue("gpu.hotspot", "GPU · Hot spot", null, null, "°C"),
            new StateValue("gpu.perfcap", "GPU · Motivo", null, "power", "text"),
            new StateValue("fps.current", "FPS · FPS", double.NaN, null, "fps"),
        ]);
        var node = JsonNode.Parse(json.ToJsonString())!;
        Assert.Equal("1.2.0", node["version"]!.GetValue<string>());
        Assert.Equal("2026-11-19T21:14:05-03:00", node["time"]!.GetValue<string>());
        Assert.Equal("cyberpunk2077.exe", node["game"]!["exe"]!.GetValue<string>());
        var v = node["values"]!;
        Assert.Equal(61.24, v["gpu.temp"]!["value"]!.GetValue<double>());
        Assert.Equal("°C", v["gpu.temp"]!["unit"]!.GetValue<string>());
        Assert.Equal("GPU · Núcleo", v["gpu.temp"]!["name"]!.GetValue<string>());
        Assert.True(v.AsObject().ContainsKey("gpu.hotspot"));
        Assert.Null(v["gpu.hotspot"]!["value"]);
        Assert.Equal("power", v["gpu.perfcap"]!["value"]!.GetValue<string>());
        Assert.Null(v["fps.current"]!["value"]);

        var idle = JsonNode.Parse(StateApi.Build("1.2.0", DateTimeOffset.Now, null, []).ToJsonString())!.AsObject();
        Assert.True(idle.ContainsKey("game"));
        Assert.Null(idle["game"]);
    }
}
