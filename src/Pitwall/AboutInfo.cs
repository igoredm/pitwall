using System.Diagnostics;
using Microsoft.Web.WebView2.Core;
using Microsoft.Win32;

namespace Pitwall;

/// <summary>
/// Versões dos componentes para a página "Sobre" (catalog.about). Nada disso muda com o app aberto: é lido uma vez,
/// na primeira vez que o catálogo é montado, e fica em cache. Componente ausente ou ilegível = null.
/// </summary>
public sealed record AboutInfo(string? App, string? Dotnet, string? WebView2, string? PresentMon, string? PawnIO)
{
    static readonly Lazy<AboutInfo> _current = new(Read);

    public static AboutInfo Current => _current.Value;

    static AboutInfo Read() => new(
        typeof(AboutInfo).Assembly.GetName().Version?.ToString(3),
        Environment.Version.ToString(),
        Try(() => CoreWebView2Environment.GetAvailableBrowserVersionString()),
        Try(() => PresentMonVersion(Path.Combine(AppContext.BaseDirectory, "tools", "PresentMon.exe"))),
        Try(PawnIOVersion));

    /// <summary>
    /// SHA-256 → versão dos PresentMon.exe que o installer/fetch-deps.ps1 baixa. O executável oficial não tem recurso de
    /// versão (ProductVersion/FileVersion vazios), então sem esta tabela "Sobre" não teria o que mostrar.
    /// Ao trocar a versão no fetch-deps.ps1, acrescentar aqui (um teste confere).
    /// </summary>
    internal static readonly Dictionary<string, string> KnownPresentMon = new(StringComparer.OrdinalIgnoreCase)
    {
        ["b2a706bc6ad475749e3b7e3409263aa1e6906d45bdcf993f6dbc0f660188f1af"] = "2.6.0",
    };

    /// <summary>Versão do arquivo; sem ela, pelo hash conhecido (lê ~1 MB uma vez só).</summary>
    static string? PresentMonVersion(string path)
    {
        if (!File.Exists(path)) return null;
        if (FileVersion(path) is { } v) return v;
        using var fs = File.OpenRead(path);
        var hash = Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(fs));
        return KnownPresentMon.GetValueOrDefault(hash);
    }

    /// <summary>Versão do arquivo (ex.: "2.3.0"), sem o sufixo de build que alguns executáveis põem depois de um espaço.</summary>
    static string? FileVersion(string path)
    {
        var info = FileVersionInfo.GetVersionInfo(path);
        var v = Clean(info.ProductVersion) ?? Clean(info.FileVersion);
        return v ?? (info.FileMajorPart + info.FileMinorPart + info.FileBuildPart > 0
            ? $"{info.FileMajorPart}.{info.FileMinorPart}.{info.FileBuildPart}" : null);
    }

    /// <summary>DisplayVersion da entrada de desinstalação do PawnIO (a mesma chave que o instalador do Pitwall procura).</summary>
    static string? PawnIOVersion()
    {
        foreach (var view in new[] { RegistryView.Registry64, RegistryView.Registry32 })
        {
            using var hklm = RegistryKey.OpenBaseKey(RegistryHive.LocalMachine, view);
            using var key = hklm.OpenSubKey(@"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\PawnIO");
            if (Clean(key?.GetValue("DisplayVersion") as string) is { } v) return v;
        }
        return null;
    }

    internal static string? Clean(string? v)
    {
        v = v?.Trim();
        if (string.IsNullOrEmpty(v)) return null;
        var space = v.IndexOf(' ');
        if (space > 0) v = v[..space];
        return v.Length > 64 ? v[..64] : v;
    }

    static string? Try(Func<string?> read)
    {
        try { return Clean(read()); }
        catch { return null; }
    }
}
