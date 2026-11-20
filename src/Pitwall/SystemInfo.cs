using Microsoft.Win32;

namespace Pitwall;

/// <summary>1.2: dados fixos do PC para o card de compartilhar (catálogo › hardware.ramGb / hardware.os). Lidos uma vez.</summary>
public static class SystemInfo
{
    static readonly Lazy<int?> Ram = new(() =>
    {
        try
        {
            var bytes = GC.GetGCMemoryInfo().TotalAvailableMemoryBytes;
            return bytes > 0 ? RamGb(bytes) : null;
        }
        catch { return null; }
    });

    static readonly Lazy<string?> Os = new(() =>
    {
        try
        {
            using var key = Registry.LocalMachine.OpenSubKey(@"SOFTWARE\Microsoft\Windows NT\CurrentVersion");
            var build = int.TryParse(key?.GetValue("CurrentBuildNumber") as string, out var b) ? b : Environment.OSVersion.Version.Build;
            return OsName(build, key?.GetValue("DisplayVersion") as string ?? key?.GetValue("ReleaseId") as string);
        }
        catch { return null; }
    });

    /// <summary>RAM total em GB inteiros (31,9 GB visíveis → 32).</summary>
    public static int? RamGbTotal => Ram.Value;

    /// <summary>"Windows 11 24H2", "Windows 10 22H2".</summary>
    public static string? OsFriendly => Os.Value;

    /// <summary>Regra pura: arredonda para o GB mais próximo (o Windows reserva um pouco da RAM para o hardware).</summary>
    internal static int RamGb(long bytes) => (int)Math.Round(bytes / (1024.0 * 1024 * 1024));

    /// <summary>Regra pura: build ≥ 22000 = Windows 11 (o ProductName do registro continua dizendo "Windows 10").</summary>
    internal static string OsName(int build, string? displayVersion)
    {
        var name = build >= 22000 ? "Windows 11" : "Windows 10";
        return string.IsNullOrWhiteSpace(displayVersion) ? name : $"{name} {displayVersion.Trim()}";
    }
}
