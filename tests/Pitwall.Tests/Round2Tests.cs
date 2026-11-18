using System.Text.Json;
using Pitwall.Config;
using Pitwall.Games;
using Pitwall.Logging;
using Pitwall.Server;
using Pitwall.Ui;

namespace Pitwall.Tests;

/// <summary>Protocolo 1.0, rodada 2 (docs/protocol.md seção 8).</summary>
public class DeviceKindTests
{
    [Theory]
    // TV (vem antes: Android TV e Fire TV também dizem Android)
    [InlineData("Mozilla/5.0 (SMART-TV; LINUX; Tizen 6.0) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 TV Safari/537.36", "tv")]
    [InlineData("Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0 Safari/537.36 WebAppManager", "tv")]
    [InlineData("Mozilla/5.0 (Linux; Android 9; BRAVIA 4K UR2 Build/PTT1.190515.001.S52) AppleWebKit/537.36 Chrome/91.0 Safari/537.36", "tv")]
    [InlineData("Mozilla/5.0 (Linux; Android 9; AFTMM Build/PS7233) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0 Mobile Safari/537.36", "tv")]
    [InlineData("Mozilla/5.0 (Linux; Android 12; Google TV Streamer) AppleWebKit/537.36 Chrome/120.0 Safari/537.36", "tv")]
    [InlineData("Mozilla/5.0 (X11; Linux armv7l) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0 Safari/537.36 CrKey/1.56.500000", "tv")]
    [InlineData("Roku/DVP-9.10 (519.10E04111A)", "tv")]
    [InlineData("Opera/9.80 (Linux mips; U; HbbTV/1.1.1 (; Philips; ; ; ; ) CE-HTML/1.0 NETTV/3.2.1; en) Presto/2.6.33", "tv")]
    // Celular
    [InlineData("Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36", "phone")]
    [InlineData("Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1", "phone")]
    // PC
    [InlineData("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 Edg/130.0", "desktop")]
    [InlineData("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15", "desktop")]
    [InlineData("Mozilla/5.0 (X11; Linux x86_64; rv:132.0) Gecko/20100101 Firefox/132.0", "desktop")]
    [InlineData("Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36", "desktop")]
    // Sem pista
    [InlineData("Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36", "unknown")] // tablet
    [InlineData("curl/8.4.0", "unknown")]
    [InlineData("", "unknown")]
    [InlineData(null, "unknown")]
    public void FromUserAgent(string? ua, string expected) => Assert.Equal(expected, DeviceKind.FromUserAgent(ua));

    [Fact]
    public void AftMustStartAWord() =>
        Assert.Equal("desktop", DeviceKind.FromUserAgent("Mozilla/5.0 (Windows NT 10.0) DRAFTPad/1.0"));

    [Fact]
    public void PairingStoresKind()
    {
        var p = new PairingManager();
        var (code, _) = p.Start(DateTime.UtcNow);
        Assert.Equal(PairError.None, p.Redeem(code, "TV", DateTime.UtcNow, out var d, out _,
            "Mozilla/5.0 (Linux; Android 11; BRAVIA 4K VH2) AppleWebKit/537.36"));
        Assert.Equal("tv", d!.Kind);
    }

    [Fact]
    public void ExistingDevicesBecomeUnknown()
    {
        var c = ConfigStore.Parse("""
            { "version": 6, "remote": { "pairedDevices": [
              { "id": "a", "name": "Pixel", "tokenHash": "ab", "created": "2026-11-12T20:00:00-03:00" },
              { "id": "b", "name": "X", "tokenHash": "cd", "created": "2026-11-12T20:00:00-03:00", "kind": "toaster" } ] } }
            """);
        Assert.All(c.Remote.PairedDevices, d => Assert.Equal("unknown", d.Kind));
    }
}

public class PairingErrorTests
{
    static readonly DateTime Now = new(2026, 11, 18, 12, 0, 0, DateTimeKind.Utc);

    [Fact]
    public void AttemptsLeftCountsDown()
    {
        var l = new AttemptLimiter();
        Assert.Equal(5, l.AttemptsLeft("ip", Now));
        l.Fail("ip", Now);
        Assert.Equal(4, l.AttemptsLeft("ip", Now));
        for (int i = 0; i < 3; i++) l.Fail("ip", Now);
        Assert.Equal(1, l.AttemptsLeft("ip", Now));
        Assert.Null(l.RetryAfterSec("ip", Now));
        l.Fail("ip", Now);
        Assert.Equal(0, l.AttemptsLeft("ip", Now));
        Assert.Equal(300, l.RetryAfterSec("ip", Now));
        Assert.Equal(60, l.RetryAfterSec("ip", Now.AddMinutes(4)));
        Assert.Null(l.RetryAfterSec("ip", Now.AddMinutes(5)));
        Assert.Equal(5, l.AttemptsLeft("ip", Now.AddMinutes(5)));
    }

    [Fact]
    public void OldFailuresLeaveTheWindow()
    {
        var l = new AttemptLimiter();
        l.Fail("ip", Now);
        l.Fail("ip", Now);
        Assert.Equal(3, l.AttemptsLeft("ip", Now.AddSeconds(30)));
        Assert.Equal(5, l.AttemptsLeft("ip", Now.AddSeconds(61)));
    }

    [Theory]
    [InlineData(PairError.Invalid, "invalidCode")]
    [InlineData(PairError.Expired, "expired")]
    [InlineData(PairError.NoPending, "noPending")]
    public void FailureCarriesAttemptsLeft(PairError err, string expected)
    {
        using var doc = JsonDocument.Parse(RemoteServer.PairFailure(err, 3, null));
        var r = doc.RootElement;
        Assert.Equal("paired", r.GetProperty("type").GetString());
        Assert.False(r.GetProperty("ok").GetBoolean());
        Assert.Equal(expected, r.GetProperty("error").GetString());
        Assert.Equal(3, r.GetProperty("attemptsLeft").GetInt32());
        Assert.False(r.TryGetProperty("retryAfterSec", out _));
    }

    [Fact]
    public void BlockedCarriesRetryAfter()
    {
        using var doc = JsonDocument.Parse(RemoteServer.PairFailure(PairError.Invalid, 0, 300));
        var r = doc.RootElement;
        Assert.Equal("blocked", r.GetProperty("error").GetString());
        Assert.Equal(300, r.GetProperty("retryAfterSec").GetInt32());
        Assert.False(r.TryGetProperty("attemptsLeft", out _));
    }
}

public class LogStatsTests
{
    static readonly DateTime Now = new(2026, 11, 18, 12, 0, 0, DateTimeKind.Utc);
    const long Mb = 1024 * 1024;

    static LogFileInfo F(string name, int daysAgo, long mb = 1) => new(@"C:\logs\" + name, Now.AddDays(-daysAgo), mb * Mb);

    [Fact]
    public void TotalsAndPreview()
    {
        var files = new[] { F("pitwall_a.csv", 40, 2), F("pitwall_b.csv", 20, 3), F("pitwall_c.csv", 1, 4) };
        var s = LogRetention.Stats(files, Now, 30, 0, []);
        Assert.Equal(9 * Mb, s.TotalBytes);
        Assert.Equal(3, s.Files);
        Assert.Equal(Now.AddDays(-40), s.OldestUtc);
        Assert.Equal(1, s.WouldDeleteFiles);
        Assert.Equal(2 * Mb, s.WouldDeleteBytes);

        // Mesma pasta, outra escolha: 15 dias apaga também o de 20
        var s15 = LogRetention.Stats(files, Now, 15, 0, []);
        Assert.Equal(2, s15.WouldDeleteFiles);
        Assert.Equal(5 * Mb, s15.WouldDeleteBytes);
    }

    [Fact]
    public void PreviewMatchesSelectionWithProtectionAndCap()
    {
        var files = new[] { F("pitwall_a.csv", 10, 5), F("pitwall_b.csv", 5, 5), F("pitwall_c.csv", 2, 5), F("pitwall_d.csv", 1, 5) };
        var protectedNames = new[] { @"C:\logs\pitwall_a.csv" };
        var selected = LogRetention.SelectForDeletion(files, Now, 0, 10 * Mb, protectedNames);
        var s = LogRetention.Stats(files, Now, 0, 10 * Mb, protectedNames);
        Assert.Equal(selected.Count, s.WouldDeleteFiles);
        Assert.Equal(2, s.WouldDeleteFiles); // a protegido; d é o mais novo; apaga b e c
        Assert.Equal(10 * Mb, s.WouldDeleteBytes);
    }

    [Fact]
    public void ForeverDeletesNothing()
    {
        var s = LogRetention.Stats([F("pitwall_a.csv", 400)], Now, 0, 0, []);
        Assert.Equal(0, s.WouldDeleteFiles);
        Assert.Equal(0, s.WouldDeleteBytes);
    }

    [Fact]
    public void EmptyFolder()
    {
        var s = LogRetention.Stats([], Now, 30, 500 * Mb, []);
        Assert.Equal(0, s.Files);
        Assert.Null(s.OldestUtc);
        Assert.Empty(LogRetention.ListFiles(Path.Combine(Path.GetTempPath(), "pitwall-nao-existe-" + Guid.NewGuid())));
    }

    [Fact]
    public void StatsNeverDeletes()
    {
        var dir = Directory.CreateTempSubdirectory("pitwall-stats-").FullName;
        try
        {
            var old = Path.Combine(dir, "pitwall_old.csv");
            File.WriteAllText(old, "x");
            File.SetLastWriteTimeUtc(old, DateTime.UtcNow.AddDays(-100));
            File.WriteAllText(Path.Combine(dir, "pitwall_new.csv"), "y");
            File.WriteAllText(Path.Combine(dir, "other.csv"), "z");
            var files = LogRetention.ListFiles(dir);
            Assert.Equal(2, files.Count);
            var s = LogRetention.Stats(files, DateTime.UtcNow, 30, 0, []);
            Assert.Equal(1, s.WouldDeleteFiles);
            Assert.True(File.Exists(old));
        }
        finally { Directory.Delete(dir, true); }
    }
}

public class SessionPagingTests
{
    static List<GameSession> Sample()
    {
        // Mais recente primeiro, como no sessions.json
        var start = new DateTime(2026, 11, 18, 20, 0, 0);
        return Enumerable.Range(0, 250)
            .Select(i => new GameSession { Exe = i % 3 == 0 ? "FC25.exe" : "Cyberpunk2077.exe", Start = start.AddHours(-i) })
            .ToList();
    }

    [Fact]
    public void PagesNewestFirst()
    {
        var all = Sample();
        var (total, page) = SessionStore.Page(all, 0, 50, null);
        Assert.Equal(250, total);
        Assert.Equal(50, page.Count);
        Assert.Same(all[0], page[0]);
        var (_, next) = SessionStore.Page(all, 50, 50, null);
        Assert.Same(all[50], next[0]);
        Assert.True(page[^1].Start > next[0].Start);
    }

    [Fact]
    public void LimitIsCappedAt100AndAtLeast1()
    {
        var all = Sample();
        Assert.Equal(100, SessionStore.Page(all, 0, 1000, null).Sessions.Count);
        Assert.Single(SessionStore.Page(all, 0, 0, null).Sessions);
        Assert.Single(SessionStore.Page(all, -5, -1, null).Sessions);
    }

    [Fact]
    public void OffsetPastTheEndIsEmpty()
    {
        var (total, page) = SessionStore.Page(Sample(), 300, 20, null);
        Assert.Equal(250, total);
        Assert.Empty(page);
    }

    [Fact]
    public void ExeFilterIgnoresCase()
    {
        var all = Sample();
        var (total, page) = SessionStore.Page(all, 0, 100, "fc25.EXE");
        Assert.Equal(84, total); // 0, 3, ..., 249
        Assert.All(page, s => Assert.Equal("FC25.exe", s.Exe));
        Assert.Equal(all.Where(s => s.Exe == "FC25.exe").Take(100), page);
        Assert.Equal(0, SessionStore.Page(all, 0, 10, "FC2").Total); // nome inteiro, não pedaço
        Assert.Equal(250, SessionStore.Page(all, 0, 10, "  ").Total); // vazio = todos
    }

    [Fact]
    public void Limits()
    {
        Assert.Equal(500, SessionStore.Max);
        Assert.Equal(20, SessionStore.RecentCount);
        Assert.Equal(100, SessionStore.MaxPageSize);
    }
}

public class TourAndAppearanceTests
{
    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public void TourMigratesFromTutorialDone(bool done)
    {
        var c = ConfigStore.Parse($$"""{ "version": 6, "tutorialDone": {{(done ? "true" : "false")}} }""");
        Assert.Equal(7, c.Version);
        Assert.Equal(done, c.Tour.Done);
        Assert.Equal(0, c.Tour.Step);
        Assert.False(c.Tour.Dismissed);
        Assert.Equal(done, c.TutorialDone);
    }

    [Fact]
    public void OlderConfigsGetTourDone()
    {
        var c = ConfigStore.Parse("""{ "version": 4 }""");
        Assert.True(c.Tour.Done);
        Assert.True(c.TutorialDone);
    }

    [Fact]
    public void NewInstallShowsTour()
    {
        var c = ConfigStore.Parse(null);
        Assert.False(c.Tour.Done);
        Assert.False(c.TutorialDone);
        Assert.Equal("system", c.Appearance);
    }

    [Fact]
    public void V7KeepsTourAndAliasFollowsIt()
    {
        var c = ConfigStore.Parse("""{ "version": 7, "tutorialDone": false, "tour": { "step": 3, "done": true, "dismissed": true } }""");
        Assert.Equal(3, c.Tour.Step);
        Assert.True(c.Tour.Dismissed);
        Assert.True(c.TutorialDone);
    }

    [Fact]
    public void ResetTour()
    {
        var c = new AppConfig { Tour = new TourConfig { Step = 5, Done = true, Dismissed = true }, TutorialDone = true };
        ConfigStore.ResetTour(c);
        Assert.Equal(0, c.Tour.Step);
        Assert.False(c.Tour.Done);
        Assert.False(c.Tour.Dismissed);
        Assert.False(c.TutorialDone);
    }

    static AppConfig Current(bool done) => new() { Tour = new TourConfig { Step = 2, Done = done }, TutorialDone = done };

    [Fact]
    public void SetConfig_TourWins()
    {
        var incoming = new AppConfig { Tour = new TourConfig { Step = 4, Done = true, Dismissed = false }, TutorialDone = false };
        ConfigStore.SyncTour(incoming, Current(false), tourSent: true);
        Assert.True(incoming.Tour.Done);
        Assert.Equal(4, incoming.Tour.Step);
        Assert.True(incoming.TutorialDone);
    }

    [Fact]
    public void SetConfig_OldClientWithoutTour()
    {
        // Cliente antigo marca o tutorial como visto: o tour acompanha e não volta para o passo 0
        var incoming = new AppConfig { TutorialDone = true }; // "tour" ausente no JSON → padrão do inicializador
        ConfigStore.SyncTour(incoming, Current(false), tourSent: false);
        Assert.True(incoming.Tour.Done);
        Assert.Equal(2, incoming.Tour.Step);
        Assert.True(incoming.TutorialDone);

        // E sem mexer no tutorialDone, não desfaz um tour concluído
        var same = new AppConfig { TutorialDone = true };
        ConfigStore.SyncTour(same, Current(true), tourSent: false);
        Assert.True(same.Tour.Done);
    }

    [Fact]
    public void SetConfig_OldClientReplays()
    {
        var incoming = new AppConfig { TutorialDone = false, Tour = new TourConfig { Step = 2, Done = true } };
        ConfigStore.SyncTour(incoming, Current(true), tourSent: true);
        Assert.False(incoming.Tour.Done);
        Assert.Equal(0, incoming.Tour.Step);
        Assert.False(incoming.TutorialDone);
    }

    [Theory]
    [InlineData("dark", "dark")]
    [InlineData("light", "light")]
    [InlineData("system", "system")]
    [InlineData("weird", "system")]
    public void AppearanceMigratesFromThemeMode(string themeMode, string expected)
    {
        var c = ConfigStore.Parse($$"""{ "version": 6, "themeMode": "{{themeMode}}" }""");
        Assert.Equal(expected, c.Appearance);
        Assert.Equal(themeMode, c.ThemeMode); // o widget continua com o dele
    }

    [Fact]
    public void AppearanceIsSanitized()
    {
        Assert.Equal("light", ConfigStore.Parse("""{ "version": 7, "themeMode": "dark", "appearance": "light" }""").Appearance);
        Assert.Equal("system", ConfigStore.Parse("""{ "version": 7, "appearance": "neon" }""").Appearance);
    }
}

public class DeepLinkAndAboutTests
{
    [Theory]
    [InlineData("crash", "crash")]
    [InlineData("updates", "updates")]
    [InlineData("csv-recording", "csv-recording")]
    [InlineData("Crash", null)]
    [InlineData("a/b", null)]
    [InlineData("x?tutorial=1", null)]
    [InlineData("", null)]
    [InlineData(null, null)]
    public void AnchorIsCleaned(string? anchor, string? expected) => Assert.Equal(expected, SettingsForm.CleanAnchor(anchor));

    [Fact]
    public void PagesMatchTheContract() =>
        // Ids do contrato + os nomes de página do frontend (widget = appearance, devices = phone)
        Assert.Equal(["overview", "widget", "appearance", "metrics", "alerts", "games", "sessions", "gpu", "devices", "phone", "features", "app"], SettingsForm.Pages);

    [Theory]
    [InlineData("2.3.0.0", "2.3.0.0")]
    [InlineData(" 1.0.3 (build 7) ", "1.0.3")]
    [InlineData("", null)]
    [InlineData(null, null)]
    public void VersionIsCleaned(string? raw, string? expected) => Assert.Equal(expected, Pitwall.AboutInfo.Clean(raw));

    [Fact]
    public void PresentMonPinnedByFetchDepsIsKnown()
    {
        // O PresentMon.exe oficial não tem recurso de versão: o "Sobre" depende da tabela de hashes
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir != null && !File.Exists(Path.Combine(dir.FullName, "Pitwall.slnx"))) dir = dir.Parent;
        Assert.NotNull(dir);
        var script = File.ReadAllText(Path.Combine(dir!.FullName, "installer", "fetch-deps.ps1"));
        var m = System.Text.RegularExpressions.Regex.Match(script,
            @"PresentMon/releases/download/v(?<ver>[\d.]+)/[^""]+""\s*\r?\n\s*Out\s*=\s*""tools\\PresentMon\.exe"";\s*Sha256\s*=\s*""(?<sha>[0-9a-fA-F]{64})""");
        Assert.True(m.Success, "formato do fetch-deps.ps1 mudou");
        Assert.Equal(m.Groups["ver"].Value, Pitwall.AboutInfo.KnownPresentMon[m.Groups["sha"].Value]);
    }

    [Fact]
    public void AboutKeepsExplicitNullsInTheCatalog()
    {
        // Mesmo caminho do CatalogMessage: nó camelCase dentro do catálogo serializado com ConfigStore.Json (que omite nulls de objetos)
        var about = JsonSerializer.SerializeToNode(new Pitwall.AboutInfo("0.9.0", "10.0.0", null, null, null),
            new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase });
        var json = new System.Text.Json.Nodes.JsonObject { ["about"] = about }.ToJsonString(ConfigStore.Json);
        using var doc = JsonDocument.Parse(json);
        var a = doc.RootElement.GetProperty("about");
        Assert.Equal("0.9.0", a.GetProperty("app").GetString());
        Assert.Equal(JsonValueKind.Null, a.GetProperty("webView2").ValueKind);
        Assert.Equal(JsonValueKind.Null, a.GetProperty("presentMon").ValueKind);
        Assert.Equal(JsonValueKind.Null, a.GetProperty("pawnIO").ValueKind);
        Assert.True(a.TryGetProperty("dotnet", out _));
    }
}
