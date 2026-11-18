using System.Text.RegularExpressions;

namespace Pitwall.Update;

/// <summary>
/// Versão semântica (SemVer 2.0): MAIOR.MENOR.CORREÇÃO[-pré-lançamento][+build].
/// A ordem segue a especificação: 0.7.0-beta.2 &lt; 0.7.0-beta.10 &lt; 0.7.0-rc.1 &lt; 0.7.0. O "+build" é ignorado.
/// </summary>
public sealed partial class SemVer : IComparable<SemVer>, IEquatable<SemVer>
{
    public int Major { get; }
    public int Minor { get; }
    public int Patch { get; }
    /// <summary>Identificadores do pré-lançamento ("beta", "2"). Vazio = versão estável.</summary>
    public IReadOnlyList<string> Pre { get; }
    public bool IsPrerelease => Pre.Count > 0;

    SemVer(int major, int minor, int patch, string[] pre) => (Major, Minor, Patch, Pre) = (major, minor, patch, pre);

    [GeneratedRegex(@"^v?(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$")]
    private static partial Regex Pattern();

    public static bool TryParse(string? text, out SemVer version)
    {
        version = null!;
        if (string.IsNullOrWhiteSpace(text) || text.Length > 64) return false;
        var m = Pattern().Match(text.Trim());
        if (!m.Success) return false;
        var pre = m.Groups[4].Success ? m.Groups[4].Value.Split('.') : [];
        // SemVer proíbe zero à esquerda em identificador numérico ("beta.01").
        if (pre.Any(p => p.Length > 1 && p[0] == '0' && p.All(char.IsAsciiDigit))) return false;
        version = new SemVer(int.Parse(m.Groups[1].Value), int.Parse(m.Groups[2].Value), int.Parse(m.Groups[3].Value), pre);
        return true;
    }

    public int CompareTo(SemVer? other)
    {
        if (other is null) return 1;
        var c = Major.CompareTo(other.Major);
        if (c == 0) c = Minor.CompareTo(other.Minor);
        if (c == 0) c = Patch.CompareTo(other.Patch);
        if (c != 0) return c;

        // Estável vence pré-lançamento da mesma versão
        if (!IsPrerelease || !other.IsPrerelease) return other.IsPrerelease.CompareTo(IsPrerelease);
        for (var i = 0; i < Math.Min(Pre.Count, other.Pre.Count); i++)
        {
            c = CompareIdentifier(Pre[i], other.Pre[i]);
            if (c != 0) return c;
        }
        return Pre.Count.CompareTo(other.Pre.Count);
    }

    static int CompareIdentifier(string a, string b)
    {
        var aNum = a.All(char.IsAsciiDigit);
        var bNum = b.All(char.IsAsciiDigit);
        if (aNum && bNum) return a.Length != b.Length ? a.Length.CompareTo(b.Length) : string.CompareOrdinal(a, b);
        if (aNum != bNum) return aNum ? -1 : 1; // numérico < alfanumérico
        return string.CompareOrdinal(a, b);
    }

    public bool Equals(SemVer? other) => CompareTo(other) == 0;
    public override bool Equals(object? obj) => obj is SemVer v && Equals(v);
    public override int GetHashCode() => HashCode.Combine(Major, Minor, Patch, string.Join('.', Pre));
    public override string ToString() => $"{Major}.{Minor}.{Patch}" + (IsPrerelease ? "-" + string.Join('.', Pre) : "");

    public static bool operator >(SemVer a, SemVer b) => a.CompareTo(b) > 0;
    public static bool operator <(SemVer a, SemVer b) => a.CompareTo(b) < 0;
    public static bool operator >=(SemVer a, SemVer b) => a.CompareTo(b) >= 0;
    public static bool operator <=(SemVer a, SemVer b) => a.CompareTo(b) <= 0;
}
