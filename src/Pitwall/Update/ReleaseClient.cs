using System.Net;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace Pitwall.Update;

/// <summary>Release candidata a atualização, já validada (tag SemVer, assets com o nome esperado, URLs do GitHub).</summary>
public sealed record ReleaseInfo(SemVer Version, string Tag, string NotesUrl, string Notes, Uri InstallerUrl, long InstallerSize, Uri ChecksumsUrl);

/// <summary>
/// Conversa com o GitHub. Só HTTPS, só hosts da lista, redirecionamentos seguidos à mão (cada salto é conferido),
/// sem cookies, sem credenciais, User-Agent genérico. Nada sobre o usuário ou a máquina é enviado.
/// </summary>
internal sealed partial class ReleaseClient : IDisposable
{
    public const string Owner = "igoredm";
    public const string Repo = "pitwall";
    const string ApiUrl = $"https://api.github.com/repos/{Owner}/{Repo}/releases?per_page=30";
    const string UserAgent = "Pitwall-Updater";

    /// <summary>Hosts de onde o instalador pode vir (github.com redireciona para o armazenamento de assets).</summary>
    static readonly string[] DownloadHosts = ["github.com", "objects.githubusercontent.com", "release-assets.githubusercontent.com"];
    const string ApiHost = "api.github.com";

    const int MaxApiBytes = 4 * 1024 * 1024;
    const int MaxChecksumsBytes = 64 * 1024;
    public const long MaxInstallerBytes = 400L * 1024 * 1024;
    public const int MaxNotesChars = 4000;

    readonly HttpClient _http;

    public ReleaseClient()
    {
        var handler = new SocketsHttpHandler
        {
            AllowAutoRedirect = false,     // cada redirecionamento passa pela lista de hosts
            UseCookies = false,
            Credentials = null,
            PreAuthenticate = false,
            AutomaticDecompression = DecompressionMethods.None,
            ConnectTimeout = TimeSpan.FromSeconds(20),
            PooledConnectionLifetime = TimeSpan.FromMinutes(5),
        };
        _http = new HttpClient(handler) { Timeout = Timeout.InfiniteTimeSpan };
        _http.DefaultRequestHeaders.UserAgent.Clear();
        _http.DefaultRequestHeaders.UserAgent.Add(new ProductInfoHeaderValue(UserAgent, null));
    }

    /// <summary>Release mais nova do canal que seja maior que <paramref name="current"/>, ou null.</summary>
    public async Task<ReleaseInfo?> FindNewerAsync(SemVer current, bool includePrerelease, CancellationToken ct)
    {
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
        timeout.CancelAfter(TimeSpan.FromSeconds(30));
        var bytes = await GetBytesAsync(new Uri(ApiUrl), [ApiHost], MaxApiBytes, accept: "application/vnd.github+json", timeout.Token);

        using var doc = JsonDocument.Parse(bytes);
        ReleaseInfo? best = null;
        foreach (var r in doc.RootElement.EnumerateArray())
        {
            if (Bool(r, "draft")) continue;
            if (Bool(r, "prerelease") && !includePrerelease) continue;
            if (!SemVer.TryParse(Str(r, "tag_name"), out var ver)) continue;
            // A tag e o flag "prerelease" do GitHub têm que concordar: "v1.0.0-beta.1" marcada como estável não entra no canal estável.
            if (ver.IsPrerelease && !includePrerelease) continue;
            if (ver <= current || (best != null && ver <= best.Version)) continue;
            var info = Parse(r, ver);
            if (info != null) best = info;
        }
        return best;
    }

    ReleaseInfo? Parse(JsonElement r, SemVer ver)
    {
        var verText = ver.ToString();
        var installerName = $"Pitwall-Setup-{verText}.exe";
        Uri? installer = null, sums = null;
        long size = 0;
        if (!r.TryGetProperty("assets", out var assets) || assets.ValueKind != JsonValueKind.Array) return null;
        foreach (var a in assets.EnumerateArray())
        {
            var name = Str(a, "name");
            if (!Uri.TryCreate(Str(a, "browser_download_url"), UriKind.Absolute, out var url) || !IsReleaseAssetUrl(url, Str(r, "tag_name")!, name)) continue;
            if (name == installerName) { installer = url; size = a.TryGetProperty("size", out var s) && s.TryGetInt64(out var n) ? n : 0; }
            else if (name == "SHA256SUMS.txt") sums = url;
        }
        if (installer == null || sums == null || size <= 0 || size > MaxInstallerBytes) return null;

        var notesUrl = Str(r, "html_url");
        if (!Uri.TryCreate(notesUrl, UriKind.Absolute, out var notes) || notes.Scheme != Uri.UriSchemeHttps || notes.Host != "github.com"
            || !notes.AbsolutePath.StartsWith($"/{Owner}/{Repo}/releases/", StringComparison.OrdinalIgnoreCase))
            notesUrl = $"https://github.com/{Owner}/{Repo}/releases";

        var body = Str(r, "body") ?? "";
        if (body.Length > MaxNotesChars) body = body[..MaxNotesChars].TrimEnd() + "\n\n…";
        return new ReleaseInfo(ver, Str(r, "tag_name")!, notesUrl!, body, installer, size, sums);
    }

    /// <summary>O asset tem que ser deste repositório e desta tag: https://github.com/igoredm/pitwall/releases/download/&lt;tag&gt;/&lt;nome&gt;.</summary>
    static bool IsReleaseAssetUrl(Uri url, string tag, string? name) =>
        url.Scheme == Uri.UriSchemeHttps && url.IsDefaultPort && url.Host == "github.com" && name != null
        && string.Equals(url.AbsolutePath, $"/{Owner}/{Repo}/releases/download/{tag}/{name}", StringComparison.OrdinalIgnoreCase)
        && string.IsNullOrEmpty(url.Query);

    /// <summary>Hash SHA-256 (hex minúsculo) do arquivo no SHA256SUMS.txt da release.</summary>
    public async Task<string> GetChecksumAsync(ReleaseInfo release, string fileName, CancellationToken ct)
    {
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
        timeout.CancelAfter(TimeSpan.FromSeconds(30));
        var bytes = await GetBytesAsync(release.ChecksumsUrl, DownloadHosts, MaxChecksumsBytes, null, timeout.Token);
        foreach (var line in System.Text.Encoding.UTF8.GetString(bytes).Split('\n'))
        {
            var m = SumLine().Match(line.Trim());
            if (m.Success && m.Groups[2].Value == fileName) return m.Groups[1].Value.ToLowerInvariant();
        }
        throw new InvalidDataException($"{fileName} não está no SHA256SUMS.txt");
    }

    [GeneratedRegex(@"^([0-9a-fA-F]{64})\s+\*?(\S.*)$")]
    private static partial Regex SumLine();

    /// <summary>Baixa o instalador para <paramref name="target"/> (que já deve estar aberto para escrita) e devolve o SHA-256.</summary>
    public async Task<byte[]> DownloadAsync(ReleaseInfo release, FileStream target, Action<int> progress, CancellationToken ct)
    {
        using var resp = await SendAsync(release.InstallerUrl, DownloadHosts, null, ct);
        if (resp.Content.Headers.ContentLength is { } len && len != release.InstallerSize)
            throw new InvalidDataException($"tamanho inesperado: {len} bytes (a release diz {release.InstallerSize})");

        using var sha = IncrementalHash.CreateHash(HashAlgorithmName.SHA256);
        await using var src = await resp.Content.ReadAsStreamAsync(ct);
        var buf = new byte[81920];
        long total = 0;
        var lastPct = -1;
        int read;
        while ((read = await ReadWithTimeoutAsync(src, buf, ct)) > 0)
        {
            total += read;
            if (total > release.InstallerSize) throw new InvalidDataException("download maior que o tamanho anunciado");
            sha.AppendData(buf, 0, read);
            await target.WriteAsync(buf.AsMemory(0, read), ct);
            var pct = (int)(total * 100 / release.InstallerSize);
            if (pct != lastPct) progress(lastPct = pct);
        }
        if (total != release.InstallerSize) throw new InvalidDataException("download incompleto");
        await target.FlushAsync(ct);
        return sha.GetHashAndReset();
    }

    /// <summary>Sem bytes por 60 s = conexão travada.</summary>
    static async Task<int> ReadWithTimeoutAsync(Stream s, byte[] buf, CancellationToken ct)
    {
        using var idle = CancellationTokenSource.CreateLinkedTokenSource(ct);
        idle.CancelAfter(TimeSpan.FromSeconds(60));
        return await s.ReadAsync(buf, idle.Token);
    }

    async Task<byte[]> GetBytesAsync(Uri url, string[] hosts, int max, string? accept, CancellationToken ct)
    {
        using var resp = await SendAsync(url, hosts, accept, ct);
        if (resp.Content.Headers.ContentLength > max) throw new InvalidDataException("resposta grande demais");
        await using var s = await resp.Content.ReadAsStreamAsync(ct);
        using var ms = new MemoryStream();
        var buf = new byte[16384];
        int read;
        while ((read = await s.ReadAsync(buf, ct)) > 0)
        {
            if (ms.Length + read > max) throw new InvalidDataException("resposta grande demais");
            ms.Write(buf, 0, read);
        }
        return ms.ToArray();
    }

    async Task<HttpResponseMessage> SendAsync(Uri url, string[] hosts, string? accept, CancellationToken ct)
    {
        for (var hop = 0; hop < 5; hop++)
        {
            EnsureAllowed(url, hosts);
            using var req = new HttpRequestMessage(HttpMethod.Get, url);
            if (accept != null) req.Headers.Accept.ParseAdd(accept);
            var resp = await _http.SendAsync(req, HttpCompletionOption.ResponseHeadersRead, ct);
            if ((int)resp.StatusCode is >= 300 and < 400 && resp.Headers.Location is { } loc)
            {
                resp.Dispose();
                url = loc.IsAbsoluteUri ? loc : new Uri(url, loc);
                continue;
            }
            if (resp.StatusCode is HttpStatusCode.Forbidden or HttpStatusCode.TooManyRequests)
            {
                resp.Dispose();
                throw new HttpRequestException("limite de consultas do GitHub atingido; tenta de novo mais tarde");
            }
            if (!resp.IsSuccessStatusCode)
            {
                var code = (int)resp.StatusCode;
                resp.Dispose();
                throw new HttpRequestException($"HTTP {code} em {url.Host}");
            }
            return resp;
        }
        throw new HttpRequestException("redirecionamentos demais");
    }

    static void EnsureAllowed(Uri url, string[] hosts)
    {
        if (url.Scheme != Uri.UriSchemeHttps || !url.IsDefaultPort || !string.IsNullOrEmpty(url.UserInfo)
            || !hosts.Contains(url.IdnHost, StringComparer.OrdinalIgnoreCase))
            throw new HttpRequestException($"host não permitido: {url.Scheme}://{url.Host}");
    }

    static string? Str(JsonElement e, string name) => e.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;
    static bool Bool(JsonElement e, string name) => e.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.True;

    public void Dispose() => _http.Dispose();
}
