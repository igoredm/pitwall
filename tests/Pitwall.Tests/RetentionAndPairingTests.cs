using Pitwall.Config;
using Pitwall.Logging;
using Pitwall.Server;

namespace Pitwall.Tests;

public class LogRetentionTests
{
    static readonly DateTime Now = new(2026, 11, 18, 12, 0, 0, DateTimeKind.Utc);
    const long Mb = 1024 * 1024;

    static LogFileInfo F(string name, int daysAgo, long mb = 1) => new(@"C:\logs\" + name, Now.AddDays(-daysAgo), mb * Mb);

    [Fact]
    public void DeletesOlderThanKeepDays()
    {
        var files = new[] { F("pitwall_a.csv", 40), F("pitwall_b.csv", 31), F("pitwall_c.csv", 29), F("pitwall_d.csv", 1) };
        var del = LogRetention.SelectForDeletion(files, Now, 30, 0, []);
        Assert.Equal([@"C:\logs\pitwall_a.csv", @"C:\logs\pitwall_b.csv"], del);
    }

    [Fact]
    public void NeverDeletesProtectedOrNewest()
    {
        // tudo velho: o atual e o da sessão mais recente ficam, e o mais novo da pasta também
        var files = new[] { F("pitwall_old.csv", 90), F("pitwall_session.csv", 80), F("pitwall_current.csv", 70), F("pitwall_newest.csv", 60) };
        var del = LogRetention.SelectForDeletion(files, Now, 30, 0, [@"D:\elsewhere\pitwall_current.csv", "pitwall_SESSION.csv", null]);
        Assert.Equal([@"C:\logs\pitwall_old.csv"], del);
    }

    [Fact]
    public void SizeCapDeletesOldestFirst()
    {
        var files = new[] { F("pitwall_1.csv", 5, 200), F("pitwall_2.csv", 4, 200), F("pitwall_3.csv", 3, 200), F("pitwall_4.csv", 2, 200) };
        var del = LogRetention.SelectForDeletion(files, Now, 30, 500 * Mb, []);
        Assert.Equal([@"C:\logs\pitwall_1.csv", @"C:\logs\pitwall_2.csv"], del); // 800 → 400 MB
    }

    [Fact]
    public void SizeCapSkipsProtected()
    {
        var files = new[] { F("pitwall_1.csv", 5, 300), F("pitwall_2.csv", 4, 300), F("pitwall_3.csv", 3, 300) };
        var del = LogRetention.SelectForDeletion(files, Now, 0, 100 * Mb, ["pitwall_1.csv"]);
        Assert.Equal([@"C:\logs\pitwall_2.csv"], del); // 1 protegido, 3 é o mais novo: não dá para ficar abaixo, mas não apaga eles
    }

    [Fact]
    public void DisabledDeletesNothing()
    {
        var files = new[] { F("pitwall_1.csv", 500, 900), F("pitwall_2.csv", 400, 900) };
        Assert.Empty(LogRetention.SelectForDeletion(files, Now, 0, 0, []));
        Assert.Empty(LogRetention.SelectForDeletion([], Now, 30, 500 * Mb, []));
    }

    [Fact]
    public void Run_OnlyTouchesPitwallCsvs()
    {
        var dir = Path.Combine(Path.GetTempPath(), "pitwall-tests-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(dir);
        try
        {
            string Make(string name, int daysAgo)
            {
                var p = Path.Combine(dir, name);
                File.WriteAllText(p, "x");
                File.SetLastWriteTimeUtc(p, DateTime.UtcNow.AddDays(-daysAgo));
                return p;
            }
            var old = Make("pitwall_2026-01-01_10-00-00.csv", 100);
            var other = Make("notes.csv", 100);
            var otherPitwall = Make("pitwall_notes.txt", 100);
            var recent = Make("pitwall_2026-11-17_10-00-00.csv", 1);

            var n = LogRetention.Run(new LogConfig { Folder = dir, KeepDays = 30, MaxTotalMb = 0 }, []);
            Assert.Equal(1, n);
            Assert.False(File.Exists(old));
            Assert.True(File.Exists(other));
            Assert.True(File.Exists(otherPitwall));
            Assert.True(File.Exists(recent));
        }
        finally
        {
            Directory.Delete(dir, true);
        }
    }
}

public class PairingTests
{
    static readonly DateTime Now = new(2026, 11, 18, 12, 0, 0, DateTimeKind.Utc);

    [Fact]
    public void CodeRedeemsOnceForDeviceToken()
    {
        var p = new PairingManager();
        var (code, expires) = p.Start(Now);
        Assert.Equal(PairingManager.CodeLength, code.Length);
        Assert.Equal(Now + PairingManager.CodeTtl, expires);

        Assert.Equal(PairError.None, p.Redeem(code.ToLowerInvariant(), "Pixel 8", Now.AddSeconds(30), out var device, out var token));
        Assert.NotNull(device);
        Assert.Equal("Pixel 8", device!.Name);
        Assert.Equal(43, token!.Length); // 256 bits em base64url
        Assert.Equal(PairingManager.Hash(token), device.TokenHash);
        Assert.DoesNotContain(token, device.TokenHash);

        Assert.Equal(PairError.NoPending, p.Redeem(code, "again", Now.AddSeconds(31), out _, out _)); // uso único
    }

    [Fact]
    public void CodeExpiresAfterTwoMinutes()
    {
        var p = new PairingManager();
        var (code, _) = p.Start(Now);
        Assert.Equal(PairError.Expired, p.Redeem(code, null, Now.AddMinutes(2).AddSeconds(1), out var d, out var t));
        Assert.Null(d);
        Assert.Null(t);
        Assert.Equal(PairError.NoPending, p.Redeem(code, null, Now.AddMinutes(2).AddSeconds(2), out _, out _));
    }

    [Fact]
    public void WrongCodesInvalidateTheCode()
    {
        var p = new PairingManager();
        var (code, _) = p.Start(Now);
        for (int i = 0; i < PairingManager.MaxFailuresPerCode; i++)
            Assert.Equal(PairError.Invalid, p.Redeem("WRONG123", null, Now, out _, out _));
        Assert.Equal(PairError.NoPending, p.Redeem(code, null, Now, out _, out _));
    }

    [Fact]
    public void NewStartReplacesOldCode()
    {
        var p = new PairingManager();
        var (old, _) = p.Start(Now);
        var (fresh, _) = p.Start(Now);
        if (old != fresh) Assert.Equal(PairError.Invalid, p.Redeem(old, null, Now, out _, out _));
        Assert.Equal(PairError.None, p.Redeem(fresh, null, Now, out _, out _));
    }

    [Fact]
    public void TokenValidation()
    {
        var t1 = PairingManager.NewToken();
        var t2 = PairingManager.NewToken();
        Assert.NotEqual(t1, t2);
        var devices = new List<PairedDevice>
        {
            new() { Id = "a", TokenHash = PairingManager.Hash(t1) },
            new() { Id = "b", TokenHash = PairingManager.Hash(t2) },
        };
        Assert.Equal("a", PairingManager.Validate(t1, devices)!.Id);
        Assert.Equal("b", PairingManager.Validate(t2, devices)!.Id);
        Assert.Null(PairingManager.Validate(PairingManager.NewToken(), devices));
        Assert.Null(PairingManager.Validate(null, devices));
        Assert.Null(PairingManager.Validate("", devices));
        Assert.Null(PairingManager.Validate("short", devices));
        Assert.Null(PairingManager.Validate(new string('a', 500), devices));
        Assert.Null(PairingManager.Validate(devices[0].TokenHash, devices)); // o hash não serve como token
        Assert.Null(PairingManager.Validate(t1, []));                       // revogado
    }

    [Fact]
    public void HashIsSha256Hex() =>
        Assert.Equal("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", PairingManager.Hash("abc"));

    [Fact]
    public void DeviceNameIsCleaned()
    {
        Assert.Equal("Phone\u00e9", PairingManager.CleanName(" Phone\u0007\u00e9\n "));
        Assert.Equal(40, PairingManager.CleanName(new string('x', 100)).Length);
        Assert.False(string.IsNullOrWhiteSpace(PairingManager.CleanName(null)));
    }

    [Fact]
    public void LimiterBlocksAfterFiveFailures()
    {
        var l = new AttemptLimiter();
        for (int i = 0; i < AttemptLimiter.MaxFailures - 1; i++) l.Fail("1.2.3.4", Now.AddSeconds(i));
        Assert.False(l.IsBlocked("1.2.3.4", Now.AddSeconds(5)));
        l.Fail("1.2.3.4", Now.AddSeconds(5));
        Assert.True(l.IsBlocked("1.2.3.4", Now.AddSeconds(6)));
        Assert.False(l.IsBlocked("5.6.7.8", Now.AddSeconds(6)));
        Assert.False(l.IsBlocked("1.2.3.4", Now.AddSeconds(5) + AttemptLimiter.Lockout + TimeSpan.FromSeconds(1)));
    }

    [Fact]
    public void LimiterWindowSlides()
    {
        var l = new AttemptLimiter();
        for (int i = 0; i < 10; i++) l.Fail("ip", Now.AddSeconds(i * 20)); // 1 erro a cada 20 s: nunca 5 em 1 min
        Assert.False(l.IsBlocked("ip", Now.AddSeconds(200)));
        l.Succeed("ip");
        Assert.False(l.IsBlocked("ip", Now.AddSeconds(201)));
    }
}

public class RemoteServerTests
{
    const string Root = @"C:\app\wwwroot";

    [Theory]
    [InlineData("/", @"C:\app\wwwroot\index.html")]
    [InlineData("/index.html", @"C:\app\wwwroot\index.html")]
    [InlineData("/main-HU73SELF.js", @"C:\app\wwwroot\main-HU73SELF.js")]
    [InlineData("/media/font%20x.woff2", @"C:\app\wwwroot\media\font x.woff2")]
    public void ResolvesInsideRoot(string url, string expected) => Assert.Equal(expected, RemoteServer.ResolveStatic(Root, url));

    [Theory]
    [InlineData("/../secret.txt")]
    [InlineData("/%2e%2e/%2e%2e/Windows/win.ini")]
    [InlineData("/..%5c..%5cconfig.json")]
    [InlineData("/C:/Windows/win.ini")]
    [InlineData("/.git/config")]
    [InlineData("/a/.hidden")]
    [InlineData("/x%00.js")]
    [InlineData("")]
    [InlineData(null)]
    public void RejectsTraversal(string? url) => Assert.Null(RemoteServer.ResolveStatic(Root, url));

    [Fact]
    public void HostHeaderMustBeIpOrThisPc()
    {
        Assert.True(RemoteServer.HostAllowed("192.168.0.20"));
        Assert.True(RemoteServer.HostAllowed("[fe80::1]"));
        Assert.True(RemoteServer.HostAllowed(Environment.MachineName.ToLowerInvariant()));
        Assert.True(RemoteServer.HostAllowed(Environment.MachineName + ".local"));
        Assert.False(RemoteServer.HostAllowed("evil.example.com"));
        Assert.False(RemoteServer.HostAllowed(""));
        Assert.False(RemoteServer.HostAllowed(null));
    }
}
