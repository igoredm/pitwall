using Pitwall.Config;

namespace Pitwall.Tests;

public class ConfigMigrationTests
{
    [Fact]
    public void NoFile_GivesCurrentDefaults()
    {
        var c = ConfigStore.Parse(null);
        Assert.Equal(ConfigStore.CurrentVersion, c.Version);
        Assert.False(c.Alerts.Enabled);
        Assert.False(c.Alerts.Sound);
        Assert.Equal(5, c.Alerts.MinIntervalMin);
        Assert.Equal(30, c.Log.KeepDays);
        Assert.Equal(500, c.Log.MaxTotalMb);
        Assert.False(c.Remote.Enabled);
        Assert.Equal(48124, c.Remote.Port);
        Assert.Empty(c.Remote.PairedDevices);
        Assert.Empty(c.Games.Profiles);
        Assert.Contains(c.Metrics, m => m.Id == "fps.displayed" && !m.Enabled);
        Assert.Contains(c.Metrics, m => m.Id == "gpu.perfcap");
    }

    [Fact]
    public void InvalidJson_GivesDefaults()
    {
        var c = ConfigStore.Parse("{ not json");
        Assert.Equal(ConfigStore.CurrentVersion, c.Version);
        Assert.Equal(500, c.RefreshMs);
    }

    [Fact]
    public void V0_RunsAllMigrations()
    {
        var c = ConfigStore.Parse("""
            { "accent": "#4c8dff", "widget": { "layout": "compact" }, "metrics": [ { "id": "ram.used", "enabled": false } ] }
            """);
        Assert.Equal("", c.Accent);
        Assert.Equal("mid", c.Widget.Layout);
        Assert.True(c.Metrics.Single(m => m.Id == "ram.used").Enabled);
        Assert.Equal(ConfigStore.CurrentVersion, c.Version);
    }

    [Fact]
    public void V3_KeepsUserChoices()
    {
        var c = ConfigStore.Parse("""
            { "version": 3, "accent": "#4C8DFF", "widget": { "layout": "compact" },
              "games": { "include": ["fc25.exe"] }, "log": { "folder": "D:\\Logs", "intervalMs": 2000 } }
            """);
        Assert.Equal("#4C8DFF", c.Accent);       // migração v2 não roda de novo
        Assert.Equal("compact", c.Widget.Layout); // nem a v3
        Assert.Equal(["fc25.exe"], c.Games.Include);
        Assert.Equal(@"D:\Logs", c.Log.Folder);
        Assert.Equal(30, c.Log.KeepDays);           // campos novos com padrão
        Assert.NotNull(c.Alerts);
        Assert.NotNull(c.Remote);
        Assert.Equal(4, c.Version);
    }

    [Fact]
    public void NullSectionsAndOutOfRangeValuesAreFixed()
    {
        var c = ConfigStore.Parse("""
            { "version": 4, "alerts": null, "remote": { "enabled": true, "port": 48123, "pairedDevices": null },
              "log": { "keepDays": -3, "maxTotalMb": -1 }, "games": { "include": null, "profiles": null },
              "metrics": null, "groupLabels": null, "accent": null }
            """);
        Assert.NotNull(c.Alerts);
        Assert.Equal(48124, c.Remote.Port); // não pode colidir com o socket local
        Assert.NotNull(c.Remote.PairedDevices);
        Assert.Equal(0, c.Log.KeepDays);
        Assert.Equal(0, c.Log.MaxTotalMb);
        Assert.NotNull(c.Games.Include);
        Assert.NotNull(c.Games.Profiles);
        Assert.NotEmpty(c.Metrics);
        Assert.Equal("", c.Accent);
    }

    [Fact]
    public void Profiles_InvalidValuesDropped()
    {
        var c = ConfigStore.Parse("""
            { "version": 4, "games": { "profiles": {
              "FC25.exe": { "tuningPreset": "cool", "layout": "compact" },
              "x.exe": { "tuningPreset": "turbo", "layout": "huge" } } } }
            """);
        var fc = c.Games.ProfileFor("fc25.exe")!; // sem diferenciar maiúsculas
        Assert.Equal("cool", fc.TuningPreset);
        Assert.Equal("compact", fc.Layout);
        var x = c.Games.ProfileFor("x.exe")!;
        Assert.Null(x.TuningPreset);
        Assert.Null(x.Layout);
        Assert.Null(c.Games.ProfileFor("other.exe"));
    }

    [Fact]
    public void Alerts_IntervalClamped()
    {
        var c = ConfigStore.Parse("""{ "version": 4, "alerts": { "enabled": true, "minIntervalMin": 0 } }""");
        Assert.True(c.Alerts.Enabled);
        Assert.Equal(1, c.Alerts.MinIntervalMin);
    }

    [Fact]
    public void PairedDevicesWithoutHashAreDropped()
    {
        var c = ConfigStore.Parse("""
            { "version": 4, "remote": { "pairedDevices": [ { "id": "a", "name": "ok", "tokenHash": "abc" }, { "id": "b", "name": "bad" } ] } }
            """);
        Assert.Equal("a", Assert.Single(c.Remote.PairedDevices).Id);
    }
}

public class LogFolderAllowedTests
{
    static string Local => Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("logs")]
    [InlineData(@"..\logs")]
    [InlineData(@"\\server\share\logs")]
    [InlineData(@"\\?\C:\logs")]
    public void RejectsRelativeEmptyAndNetwork(string? folder) => Assert.False(TelemetryHub.LogFolderAllowed(folder));

    [Fact]
    public void RejectsSystemFolders()
    {
        Assert.False(TelemetryHub.LogFolderAllowed(Environment.GetFolderPath(Environment.SpecialFolder.Windows)));
        Assert.False(TelemetryHub.LogFolderAllowed(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Windows), "System32")));
        Assert.False(TelemetryHub.LogFolderAllowed(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "Pitwall")));
        Assert.False(TelemetryHub.LogFolderAllowed(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "x")));
        // ".." não escapa da verificação
        Assert.False(TelemetryHub.LogFolderAllowed(Path.Combine(Local, "..", "..", "..", "..", "Windows", "Temp")));
    }

    [Fact]
    public void AcceptsUserFolders()
    {
        Assert.True(TelemetryHub.LogFolderAllowed(Path.Combine(Local, "Pitwall", "logs")));
        Assert.True(TelemetryHub.LogFolderAllowed(@"D:\Pitwall logs"));
        // Prefixo parecido não é a pasta do sistema
        var win = Environment.GetFolderPath(Environment.SpecialFolder.Windows);
        Assert.True(TelemetryHub.LogFolderAllowed(win + "Logs"));
    }
}
