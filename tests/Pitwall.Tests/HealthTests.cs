using System.Text.Json;
using Pitwall.Config;
using Pitwall.Health;

namespace Pitwall.Tests;

public class PcIncidentRulesTests
{
    static readonly DateTime Saved = new(2026, 11, 18, 21, 14, 5, DateTimeKind.Local);

    static PcRingFile Ring(bool clean = false, string? exe = null) => new()
    {
        SavedAt = Saved,
        BootTime = Saved.AddHours(-3),
        AppStart = Saved.AddHours(-3).AddMinutes(1),
        Exe = exe,
        SessionStart = exe != null ? Saved.AddMinutes(-40) : null,
        CleanExit = clean,
        Series = new() { ["gpu.hotspot"] = [104, 105, null] },
        Last = [new PcReading { Id = "gpu.temp", Name = "Núcleo", Group = "gpu", Value = 74, Unit = "°C" }],
        CsvFile = exe != null ? "pitwall_FC25.csv" : null,
    };

    static PcEvent Ev(string kind, DateTime t, string? code = null) => new() { Kind = kind, Time = t, Source = "x", Code = code };

    [Fact]
    public void Classify_DecisionRule()
    {
        var boot = Saved.AddMinutes(3);
        Assert.Equal(PcExitKind.None, PcIncidentRules.Classify(null, boot));
        Assert.Equal(PcExitKind.Clean, PcIncidentRules.Classify(Ring(clean: true), boot));
        Assert.Equal(PcExitKind.Abrupt, PcIncidentRules.Classify(Ring(), boot));
        // Boot antes da última gravação = o Pitwall fechou/foi encerrado, o PC continuou ligado
        Assert.Equal(PcExitKind.AppExit, PcIncidentRules.Classify(Ring(), Saved.AddHours(-3)));
        Assert.Null(PcIncidentRules.Build(Ring(), Saved.AddHours(-3), []));
        Assert.Null(PcIncidentRules.Build(Ring(clean: true), boot, []));
    }

    [Fact]
    public void Build_AbruptShutdown_WithNearbyEvents()
    {
        var boot = Saved.AddHours(2); // ficou desligado 2 h
        var events = new[]
        {
            Ev("kernelPower41", boot.AddSeconds(20)),
            Ev("whea", Saved.AddMinutes(-5)),
            Ev("gpuReset", Saved.AddMinutes(-30)), // fora da janela
            Ev("unexpectedShutdown", boot.AddMinutes(11)), // fora da janela
        };
        var inc = PcIncidentRules.Build(Ring(exe: "FC25.exe"), boot, events)!;
        Assert.Equal("20261118-211405", inc.Id);
        Assert.Equal("abruptShutdown", inc.Kind);
        Assert.Equal(Saved, inc.Time);
        Assert.Equal(boot, inc.BootTime);
        Assert.Equal("FC25.exe", inc.Exe);
        Assert.Equal(Saved.AddMinutes(-40), inc.SessionStart);
        Assert.Equal(3 * 3600, inc.UptimeSec);
        Assert.Equal(["kernelPower41", "whea"], inc.Events.Select(e => e.Kind));
        Assert.Equal([104, 105, null], inc.Series["gpu.hotspot"]);
        Assert.Single(inc.Last);
        Assert.Equal("pitwall_FC25.csv", inc.CsvFile);
        Assert.False(inc.Seen);
    }

    [Fact]
    public void Build_Bugcheck_FromEventOrKernelPowerCode()
    {
        var boot = Saved.AddMinutes(2);
        Assert.Equal("bugcheck", PcIncidentRules.Build(Ring(), boot, [Ev("bugcheck", boot.AddMinutes(3), "0x00000124")])!.Kind);
        Assert.Equal("bugcheck", PcIncidentRules.Build(Ring(), boot, [Ev("kernelPower41", boot, "0x0000009F")])!.Kind);
        Assert.Equal("abruptShutdown", PcIncidentRules.Build(Ring(), boot, [Ev("kernelPower41", boot)])!.Kind);
        Assert.Null(PcIncidentRules.Build(Ring(), boot, [])!.Exe);
    }

    [Fact]
    public void Refresh_AttachesLateBugcheck()
    {
        var boot = Saved.AddMinutes(2);
        var inc = PcIncidentRules.Build(Ring(), boot, [Ev("kernelPower41", boot)])!;
        Assert.False(PcIncidentRules.Refresh(inc, [Ev("kernelPower41", boot)]));
        Assert.True(PcIncidentRules.Refresh(inc, [Ev("kernelPower41", boot), Ev("bugcheck", boot.AddMinutes(4), "0x00000124")]));
        Assert.Equal("bugcheck", inc.Kind);
        Assert.Equal(2, inc.Events.Count);
        Assert.Equal("bugcheck", inc.Events[0].Kind); // mais novo primeiro
    }

    [Fact]
    public void Retention_Keeps20Newest()
    {
        var ids = Enumerable.Range(0, 25).Select(i => PcIncidentRules.IdFor(Saved.AddDays(i))).Reverse().ToList();
        var del = PcIncidentRules.ToDelete(ids);
        Assert.Equal(5, del.Count);
        Assert.All(del, d => Assert.True(string.CompareOrdinal(d, PcIncidentRules.IdFor(Saved.AddDays(5))) < 0));
        Assert.Empty(PcIncidentRules.ToDelete(ids.Take(20)));
    }

    [Theory]
    [InlineData("20261118-211405", true)]
    [InlineData("../../x", false)]
    [InlineData("20261118-211405.json", false)]
    [InlineData("", false)]
    [InlineData(null, false)]
    public void ValidId(string? id, bool ok) => Assert.Equal(ok, PcIncidentRules.ValidId(id));

    [Fact]
    public void Store_SavesPrunesAndMarksSeen()
    {
        var dir = Path.Combine(Path.GetTempPath(), "pitwall-test-" + Guid.NewGuid().ToString("N"));
        try
        {
            var store = new PcIncidentStore(dir);
            for (int i = 0; i < 25; i++)
            {
                var r = Ring();
                r.SavedAt = Saved.AddDays(i);
                store.Save(PcIncidentRules.Build(r, r.SavedAt.AddMinutes(1), [])!);
            }
            Assert.Equal(20, Directory.GetFiles(dir, "*.json").Length);
            var list = store.List();
            Assert.Equal(20, list.Count);
            Assert.Equal(PcIncidentRules.IdFor(Saved.AddDays(24)), list[0].Id);
            Assert.Equal(list[0].Id, store.Pending!.Id);
            Assert.True(store.MarkSeen(list[0].Id));
            Assert.False(store.MarkSeen(list[0].Id));
            Assert.Equal(list[1].Id, store.Pending!.Id);
            Assert.True(store.Get(list[0].Id)!.Seen);
            Assert.Null(store.Get("../pc-ring"));
        }
        finally { try { Directory.Delete(dir, true); } catch { } }
    }
}

public class PcRingTests
{
    [Fact]
    public void Wraparound_Keeps120InOrder()
    {
        var ring = new PcRing();
        for (int i = 0; i < 250; i++)
            ring.Sample(new Dictionary<string, double?> { ["gpu.temp"] = i, ["cpu.load"] = double.NaN }, i * 1000L + 1);
        var s = ring.Series();
        Assert.Equal(PcRing.Ids.Length, s.Count);
        Assert.Equal(120, s["gpu.temp"].Length);
        Assert.Equal(130, s["gpu.temp"][0]);
        Assert.Equal(249, s["gpu.temp"][^1]);
        Assert.All(s["cpu.load"], v => Assert.Null(v));
        Assert.Equal([247, 248, 249], ring.Series(3)["gpu.temp"]);
    }

    [Fact]
    public void SamplesAtMostOncePerSecond_AndSkipsMissingIds()
    {
        var ring = new PcRing(PcRing.Ids.Where(i => i != "gpu.fan"));
        var v = new Dictionary<string, double?> { ["gpu.temp"] = 50 };
        Assert.True(ring.Sample(v, 1));
        Assert.False(ring.Sample(v, 500));
        Assert.True(ring.Sample(v, 1001));
        Assert.Equal(2, ring.Count);
        Assert.False(ring.Series().ContainsKey("gpu.fan"));
    }

    [Fact]
    public void File_RoundTrips()
    {
        var path = Path.Combine(Path.GetTempPath(), "pitwall-ring-" + Guid.NewGuid().ToString("N") + ".json");
        try
        {
            var saved = new DateTime(2026, 11, 18, 21, 14, 5, DateTimeKind.Local);
            PcRing.Write(path, new PcRingFile { SavedAt = saved, Series = new() { ["gpu.temp"] = [1, null] }, CleanExit = true });
            var back = PcRing.Load(path)!;
            Assert.Equal(saved, back.SavedAt);
            Assert.True(back.CleanExit);
            Assert.Equal([1, null], back.Series["gpu.temp"]);
            Assert.False(File.Exists(path + ".tmp"));
        }
        finally { File.Delete(path); }
    }
}

public class PcEventParseTests
{
    static readonly DateTime T = new(2026, 11, 18, 21, 16, 0, DateTimeKind.Local);
    static RawEvent Raw(string provider, int id, byte? level = 4, string? desc = null, params object?[] props) =>
        new(provider, id, level, T, desc, props);

    [Fact]
    public void KernelPower41_WithAndWithoutBugcheckCode()
    {
        var e = PcEvents.Parse(Raw("Microsoft-Windows-Kernel-Power", 41, 1,
            "The system has rebooted without cleanly shutting down first. This error could be caused if the system stopped responding.", 292L, 0L))!;
        Assert.Equal("kernelPower41", e.Kind);
        Assert.Equal("Microsoft-Windows-Kernel-Power 41", e.Source);
        Assert.Equal(41, e.EventId);
        Assert.Equal("0x00000124", e.Code);
        Assert.Equal(T, e.Time);
        Assert.Null(PcEvents.Parse(Raw("Microsoft-Windows-Kernel-Power", 41, 1, null, 0L))!.Code);
    }

    [Theory]
    [InlineData("Microsoft-Windows-WER-SystemErrorReporting", "The computer has rebooted from a bugcheck.  The bugcheck was: 0x00000124 (0x0000000000000000, 0xffffd00e1a2b3028, 0x00000000be000000, 0x0000000000800400). A dump was saved in: C:\\Windows\\MEMORY.DMP.")]
    [InlineData("BugCheck", "O computador foi reinicializado após uma verificação de erro. A verificação de erro foi: 0x00000124 (0x0000000000000000, 0x0000000000000001).")]
    public void Bugcheck_ExtractsCode(string provider, string desc)
    {
        var e = PcEvents.Parse(Raw(provider, 1001, 2, desc))!;
        Assert.Equal("bugcheck", e.Kind);
        Assert.Equal("0x00000124", e.Code);
    }

    [Fact]
    public void Bugcheck_CodeFromProperties_WhenNoDescription()
    {
        var e = PcEvents.Parse(Raw("Microsoft-Windows-WER-SystemErrorReporting", 1001, 2, null, "0x0000009f (0x3, 0x0)", "C:\\Windows\\MEMORY.DMP"))!;
        Assert.Equal("0x0000009F", e.Code);
        Assert.Null(e.Message);
    }

    [Fact]
    public void Whea_FatalAndComponent()
    {
        const string desc = "A fatal hardware error has occurred.\r\n\r\nReported by component: Processor Core\r\nError Source: Machine Check Exception\r\nError Type: Cache Hierarchy Error\r\nProcessor APIC ID: 0";
        var fatal = PcEvents.Parse(Raw("Microsoft-Windows-WHEA-Logger", 18, 2, desc))!;
        Assert.Equal("whea", fatal.Kind);
        Assert.True(fatal.Fatal);
        Assert.Equal("Processor Core", fatal.Code);
        Assert.Equal("Machine Check Exception", PcEvents.Parse(Raw("Microsoft-Windows-WHEA-Logger", 18, 2, "x\nError Source: Machine Check Exception"))!.Code);
        Assert.Equal("A fatal hardware error has occurred.", fatal.Message);

        var corrected = PcEvents.Parse(Raw("Microsoft-Windows-WHEA-Logger", 17, 3,
            "Ocorreu um erro de hardware corrigido.\n\nComponente: PCI Express Root Port\nOrigem do erro: Advanced Error Reporting (PCI Express)"))!;
        Assert.False(corrected.Fatal);
        Assert.Equal("PCI Express Root Port", corrected.Code);
        Assert.True(PcEvents.Parse(Raw("Microsoft-Windows-WHEA-Logger", 1, 1))!.Fatal);
    }

    [Theory]
    [InlineData("Display", 4101, "gpuReset")]
    [InlineData("nvlddmkm", 13, "gpuReset")]
    [InlineData("nvlddmkm", 14, "gpuReset")]
    [InlineData("nvlddmkm", 153, "gpuReset")]
    [InlineData("EventLog", 6008, "unexpectedShutdown")]
    [InlineData("nvlddmkm", 99, null)]
    [InlineData("Display", 4100, null)]
    [InlineData("Service Control Manager", 7036, null)]
    [InlineData("EventLog", 6005, null)]
    public void KindMapping(string provider, int id, string? kind) => Assert.Equal(kind, PcEvents.Parse(Raw(provider, id))?.Kind);

    [Fact]
    public void Message_FirstLine_NoUserData_Trimmed()
    {
        var e = PcEvents.Parse(Raw("Display", 4101, 3,
            "\r\n  Display driver nvlddmkm stopped responding (C:\\Users\\Fulano\\AppData\\x.dll) for fulano.  \r\nSecond line"), "Fulano")!;
        Assert.Equal("Display driver nvlddmkm stopped responding (C:\\Users\\…\\AppData\\x.dll) for ….", e.Message);
        var longMsg = PcEvents.Parse(Raw("EventLog", 6008, 2, new string('a', 500)))!.Message!;
        Assert.True(longMsg.Length <= 200);
        Assert.EndsWith("…", longMsg);
    }

    [Fact]
    public void XPath_CoversProviders()
    {
        foreach (var p in new[] { "Kernel-Power", "EventLog", "WER-SystemErrorReporting", "BugCheck", "WHEA-Logger", "Display", "nvlddmkm", "timediff" })
            Assert.Contains(p, PcEvents.XPath);
    }
}

public class PcJsonShapeTests
{
    static readonly DateTime Saved = new(2026, 11, 18, 21, 14, 5, DateTimeKind.Local);

    static PcIncident Sample() => new()
    {
        Id = "20261118-211405", Kind = "bugcheck", Time = Saved, BootTime = Saved.AddMinutes(2), Exe = "FC25.exe",
        SessionStart = Saved.AddMinutes(-40), UptimeSec = 10_800, Seen = false, IntervalMs = 1000,
        Events = [new PcEvent { Time = Saved.AddMinutes(3), Kind = "bugcheck", Source = "BugCheck 1001", EventId = 1001, Code = "0x00000124", Message = "m" },
                  new PcEvent { Time = Saved, Kind = "whea", Source = "Microsoft-Windows-WHEA-Logger 18", EventId = 18, Fatal = true, Code = "Processor Core" }],
        Series = new() { ["gpu.hotspot"] = [104, null] },
        Last = [new PcReading { Id = "gpu.temp", Name = "Núcleo", Group = "gpu", Value = 74, Unit = "°C" }],
        CsvFile = "a.csv",
    };

    static HashSet<string> Keys(JsonElement e) => e.EnumerateObject().Select(p => p.Name).ToHashSet();

    [Fact]
    public void Incident_MatchesModels()
    {
        using var doc = JsonDocument.Parse(PcHealth.IncidentJson(Sample()));
        var r = doc.RootElement;
        Assert.Equal("pcIncident", r.GetProperty("type").GetString());
        string[] expected = ["type", "id", "kind", "time", "bootTime", "exe", "sessionStart", "uptimeSec", "events", "seen", "intervalMs", "series", "last", "csvFile"];
        Assert.Equal(expected.Order(), Keys(r).Order());
        var ev = r.GetProperty("events")[1];
        Assert.Subset(new HashSet<string> { "time", "kind", "source", "eventId", "fatal", "code", "message" }, Keys(ev));
        Assert.True(ev.GetProperty("fatal").GetBoolean());
        Assert.Equal(new[] { "group", "id", "name", "unit", "value" }, Keys(r.GetProperty("last")[0]).Order());
        Assert.Equal(JsonValueKind.Null, r.GetProperty("series").GetProperty("gpu.hotspot")[1].ValueKind);
        Assert.StartsWith("2026-11-18T21:14:05", r.GetProperty("time").GetString());
    }

    [Fact]
    public void Summary_HasNoSeries()
    {
        using var doc = JsonDocument.Parse(JsonSerializer.Serialize(new { pcPending = (PcIncidentSummary)Sample().ToSummary() }, ConfigStore.Json));
        var keys = Keys(doc.RootElement.GetProperty("pcPending"));
        Assert.Equal(new[] { "bootTime", "events", "exe", "id", "kind", "seen", "sessionStart", "time", "uptimeSec" }, keys.Order());
    }
}
