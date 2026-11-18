using System.Text.RegularExpressions;

namespace Pitwall.Server;

/// <summary>
/// Tipo do aparelho pareado (ícone e nome na lista), deduzido do User-Agent no momento do pareamento.
/// Só serve para exibição: nada de segurança depende disso (o User-Agent vem do cliente).
/// </summary>
public static partial class DeviceKind
{
    public const string Phone = "phone";
    public const string Tv = "tv";
    public const string Desktop = "desktop";
    public const string Unknown = "unknown";

    public static bool IsValid(string? kind) => kind is Phone or Tv or Desktop or Unknown;

    // TV primeiro: Android TV, Fire TV e afins também dizem "Android" (e às vezes "Mobile").
    // "AFT" (Fire TV: AFTMM, AFTKA...) diferencia maiúsculas e precisa começar palavra, para não pegar texto qualquer.
    [GeneratedRegex(@"SmartTV|SMART-TV|Tizen|Web0S|webOS|BRAVIA|Android TV|GoogleTV|Google TV|CrKey|HbbTV|Roku", RegexOptions.IgnoreCase)]
    private static partial Regex TvRegex();

    [GeneratedRegex(@"\bAFT[A-Z]")]
    private static partial Regex FireTvRegex();

    /// <summary>User-Agent → phone | tv | desktop | unknown.</summary>
    public static string FromUserAgent(string? ua)
    {
        if (string.IsNullOrWhiteSpace(ua)) return Unknown;
        if (ua.Length > 512) ua = ua[..512];
        if (TvRegex().IsMatch(ua) || FireTvRegex().IsMatch(ua)) return Tv;
        var mobile = ua.Contains("Mobi", StringComparison.OrdinalIgnoreCase);
        if (mobile || ua.Contains("iPhone", StringComparison.OrdinalIgnoreCase)) return Phone;
        // Android sem "Mobile" = tablet (ou caixinha sem marca conhecida): não é celular nem PC
        if (ua.Contains("Android", StringComparison.OrdinalIgnoreCase)) return Unknown;
        if (ua.Contains("Windows", StringComparison.OrdinalIgnoreCase) || ua.Contains("Macintosh", StringComparison.OrdinalIgnoreCase)
            || ua.Contains("X11", StringComparison.OrdinalIgnoreCase) || ua.Contains("CrOS", StringComparison.OrdinalIgnoreCase))
            return Desktop;
        return Unknown;
    }
}
