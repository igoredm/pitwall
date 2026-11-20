using Microsoft.Win32;

namespace Pitwall;

/// <summary>1.2: dados do PC — RAM e Windows para o card de compartilhar (lidos uma vez) e versão/driver para a lista de sensores (sob demanda).</summary>
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

    // ---- lista de sensores (sob demanda)

    /// <summary>"Windows 11 25H2 (10.0.26200.1234)".</summary>
    public static string WindowsVersion()
    {
        var v = Environment.OSVersion.Version;
        string? display = null;
        int? ubr = null;
        try
        {
            using var key = Registry.LocalMachine.OpenSubKey(@"SOFTWARE\Microsoft\Windows NT\CurrentVersion");
            display = key?.GetValue("DisplayVersion") as string;
            ubr = key?.GetValue("UBR") as int?;
        }
        catch { }
        var name = v.Major == 10 && v.Build >= 22000 ? "Windows 11" : v.Major == 10 ? "Windows 10" : "Windows";
        var build = ubr is { } u ? $"{v.Major}.{v.Minor}.{v.Build}.{u}" : $"{v.Major}.{v.Minor}.{v.Build}";
        return string.IsNullOrWhiteSpace(display) ? $"{name} ({build})" : $"{name} {display} ({build})";
    }

    const string DisplayClass = @"SYSTEM\CurrentControlSet\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}";

    /// <summary>Versão do driver da GPU pelo nome (ex.: "581.57 (32.0.15.8157)" na NVIDIA); null se não achar.</summary>
    public static string? GpuDriver(string? gpuName)
    {
        if (string.IsNullOrWhiteSpace(gpuName)) return null;
        try
        {
            using var cls = Registry.LocalMachine.OpenSubKey(DisplayClass);
            if (cls == null) return null;
            foreach (var sub in cls.GetSubKeyNames())
            {
                if (!int.TryParse(sub, out _)) continue;
                using var k = cls.OpenSubKey(sub);
                var desc = k?.GetValue("DriverDesc") as string;
                var ver = k?.GetValue("DriverVersion") as string;
                if (desc == null || ver == null) continue;
                if (!gpuName.Contains(desc, StringComparison.OrdinalIgnoreCase) && !desc.Contains(gpuName, StringComparison.OrdinalIgnoreCase)) continue;
                return FriendlyDriver(ver, desc);
            }
        }
        catch { }
        return null;
    }

    /// <summary>NVIDIA: 32.0.15.8157 → "581.57 (32.0.15.8157)" (os últimos 5 dígitos). Outras: a versão do Windows como está.</summary>
    public static string FriendlyDriver(string version, string? desc)
    {
        if (desc?.Contains("NVIDIA", StringComparison.OrdinalIgnoreCase) == true)
        {
            var digits = new string(version.Where(char.IsDigit).ToArray());
            if (digits.Length >= 5)
            {
                var last = digits[^5..];
                return $"{int.Parse(last[..3])}.{last[3..]} ({version})";
            }
        }
        return version;
    }
}
