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
    public void FirstRun_OnlyForNewInstalls()
    {
        Assert.False(ConfigStore.Parse(null).FirstRunDone);                 // instalação nova: mostra o assistente
        Assert.True(ConfigStore.Parse("""{ "version": 4 }""").FirstRunDone); // config existente: não mostra
        Assert.True(ConfigStore.Parse("{ not json").FirstRunDone);           // config quebrada também não
        Assert.False(ConfigStore.Parse("""{ "version": 5, "firstRunDone": false }""").FirstRunDone);
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
        Assert.Equal(ConfigStore.CurrentVersion, c.Version);
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

public class ConfigV6Tests
{
    [Fact]
    public void NewInstall_TutorialPendingAndFeaturesOn()
    {
        var c = ConfigStore.Parse(null);
        Assert.Equal(7, ConfigStore.CurrentVersion); // v7: tour e appearance (rodada 2)
        Assert.False(c.TutorialDone);
        Assert.False(c.FirstRunDone);
        Assert.True(c.Features.CrashReport);
        Assert.True(c.Features.GameSuggestions);
        Assert.True(c.Features.SessionPeaks);
        Assert.True(c.Features.ClockReason);
    }

    [Fact]
    public void V5_MigratesTutorialDoneAndKeepsFirstRun()
    {
        var c = ConfigStore.Parse("""{ "version": 5, "firstRunDone": false, "log": { "keepDays": 7 } }""");
        Assert.True(c.TutorialDone);       // quem já usa não vê o tutorial sozinho
        Assert.False(c.FirstRunDone);      // semântica do assistente não muda
        Assert.Equal(15, c.Log.KeepDays);  // 7 não é mais opção: sobe para 15
        Assert.True(c.Features.CrashReport);
        Assert.Equal(ConfigStore.CurrentVersion, c.Version);

        Assert.True(ConfigStore.Parse("""{ "version": 2 }""").TutorialDone);
        Assert.True(ConfigStore.Parse("{ not json").TutorialDone);
    }

    [Fact]
    public void V6_KeepsUserChoices()
    {
        var c = ConfigStore.Parse("""
            { "version": 6, "tutorialDone": false,
              "features": { "crashReport": false, "gameSuggestions": false, "sessionPeaks": false, "clockReason": false } }
            """);
        Assert.False(c.TutorialDone);
        Assert.False(c.Features.CrashReport);
        Assert.False(c.Features.GameSuggestions);
        Assert.False(c.Features.SessionPeaks);
        Assert.False(c.Features.ClockReason);
    }

    [Fact]
    public void FeaturesNullOrPartial_GetDefaults()
    {
        Assert.True(ConfigStore.Parse("""{ "version": 6, "features": null }""").Features.SessionPeaks);
        var c = ConfigStore.Parse("""{ "version": 6, "features": { "clockReason": false } }""");
        Assert.False(c.Features.ClockReason);
        Assert.True(c.Features.CrashReport);
    }

    [Theory]
    [InlineData(1, 1)]
    [InlineData(5, 5)]
    [InlineData(15, 15)]
    [InlineData(30, 30)]
    [InlineData(90, 90)]
    [InlineData(0, 0)]       // para sempre
    [InlineData(2, 5)]       // fora da lista: sobe para a próxima opção (nunca apaga antes)
    [InlineData(7, 15)]
    [InlineData(31, 90)]
    [InlineData(60, 90)]
    [InlineData(91, 0)]      // acima de 90: para sempre
    [InlineData(3650, 0)]
    [InlineData(-3, 0)]
    public void KeepDays_SnapsToChoices(int given, int expected)
    {
        Assert.Equal(expected, ConfigStore.SnapKeepDays(given));
        var c = ConfigStore.Parse($$"""{ "version": 6, "log": { "keepDays": {{given}}, "maxTotalMb": 0 } }""");
        Assert.Equal(expected, c.Log.KeepDays);
        Assert.Equal(0, c.Log.MaxTotalMb); // 0 = sem teto, continua valendo
        Assert.Contains(c.Log.KeepDays, LogConfig.KeepDaysChoices);
    }

    [Fact]
    public void PairedDeviceLastSeenRoundTrips()
    {
        var c = ConfigStore.Parse("""
            { "version": 6, "remote": { "pairedDevices": [ { "id": "a", "name": "TV", "tokenHash": "abc", "lastSeen": "2026-11-18T21:04:05-03:00" }, { "id": "b", "name": "old", "tokenHash": "def" } ] } }
            """);
        Assert.NotNull(c.Remote.PairedDevices[0].LastSeen);
        Assert.Null(c.Remote.PairedDevices[1].LastSeen);
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
