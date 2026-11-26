using System.Diagnostics.Eventing.Reader;
using System.Globalization;
using System.Text.RegularExpressions;
using Microsoft.Win32;

namespace Pitwall.Health;

/// <summary>1.4: algo instalado no PC (programa, driver ou atualização do Windows). camelCase no JSON = models.ts › PcInstall.</summary>
public sealed class PcInstall
{
    public DateTime Time { get; set; }
    /// <summary>Só a data é conhecida (InstallDate do registro): a hora é meia-noite e a página mostra só o dia.</summary>
    public bool? DateOnly { get; set; }
    /// <summary>program | driver | update | store (app da Microsoft Store atualizado pelo Windows Update)</summary>
    public string Kind { get; set; } = "";
    public string Name { get; set; } = "";
    public string? Version { get; set; }
    /// <summary>Editor do programa / provedor do driver.</summary>
    public string? Publisher { get; set; }
    /// <summary>Driver: classe do dispositivo (net, bluetooth, display, media, hid, usb, storage, printer, system, other).</summary>
    public string? DeviceClass { get; set; }
}

/// <summary>
/// 1.4: o que foi instalado nos últimos 30 dias, para cruzar com as quedas do Relatório do PC. Fontes: chaves Uninstall
/// do registro (programas), log Kernel-PnP/Configuration 400 + System UserPnp 20003 (drivers) e System
/// WindowsUpdateClient 19 (atualizações). Leitura sob demanda, nunca na thread de telemetria.
/// </summary>
public static partial class PcInstalls
{
    public const int Days = PcEvents.Days;
    public const int Max = 150;
    const string PnpLog = "Microsoft-Windows-Kernel-PnP/Configuration";
    const string UserPnp = "Microsoft-Windows-UserPnp";
    const string WindowsUpdate = "Microsoft-Windows-WindowsUpdateClient";

    public static List<PcInstall> Read()
    {
        var since = DateTime.Now.AddDays(-Days);
        var list = new List<PcInstall>();
        try { list.AddRange(Programs(since)); } catch { }
        try { list.AddRange(Drivers(since)); } catch { }
        try { list.AddRange(Updates(since)); } catch { }
        return Finish(list);
    }

    /// <summary>Regra pura: mais novos primeiro, sem repetidos (mesmo tipo + nome + versão), até <see cref="Max"/>.</summary>
    internal static List<PcInstall> Finish(IEnumerable<PcInstall> items) =>
        items.GroupBy(i => (i.Kind, i.Name.ToLowerInvariant(), i.Version))
            .Select(g => g.OrderByDescending(i => i.Time).First())
            .OrderByDescending(i => i.Time)
            .Take(Max)
            .ToList();

    // ------------------------------------------------------------------ programas

    static IEnumerable<PcInstall> Programs(DateTime since)
    {
        const string Path = @"Software\Microsoft\Windows\CurrentVersion\Uninstall";
        (RegistryHive, RegistryView)[] roots =
        [
            (RegistryHive.LocalMachine, RegistryView.Registry64),
            (RegistryHive.LocalMachine, RegistryView.Registry32),
            (RegistryHive.CurrentUser, RegistryView.Default),
        ];
        foreach (var (hive, view) in roots)
        {
            using var root = RegistryKey.OpenBaseKey(hive, view).OpenSubKey(Path);
            if (root == null) continue;
            foreach (var name in root.GetSubKeyNames())
            {
                PcInstall? item = null;
                try
                {
                    using var k = root.OpenSubKey(name);
                    if (k == null) continue;
                    item = ProgramItem(
                        k.GetValue("DisplayName") as string,
                        k.GetValue("DisplayVersion") as string,
                        k.GetValue("Publisher") as string,
                        k.GetValue("InstallDate")?.ToString(),
                        k.GetValue("SystemComponent") is int sc && sc == 1,
                        k.GetValue("ParentKeyName") is string,
                        k.GetValue("ReleaseType") as string);
                }
                catch { }
                if (item != null && item.Time >= since.Date) yield return item;
            }
        }
    }

    /// <summary>Regra pura: uma entrada Uninstall vira programa (null = sem nome/data, componente do sistema ou atualização de outro).</summary>
    internal static PcInstall? ProgramItem(string? name, string? version, string? publisher, string? installDate,
        bool systemComponent, bool hasParent, string? releaseType)
    {
        if (string.IsNullOrWhiteSpace(name) || systemComponent || hasParent) return null;
        if (releaseType is { } rt && (rt.Contains("Update", StringComparison.OrdinalIgnoreCase) || rt.Contains("Hotfix", StringComparison.OrdinalIgnoreCase))) return null;
        if (ParseInstallDate(installDate) is not { } parsed) return null;
        var (time, dateOnly) = parsed;
        return new PcInstall
        {
            Time = time, DateOnly = dateOnly ? true : null, Kind = "program", Name = name.Trim(),
            Version = Blank(version), Publisher = Blank(publisher),
        };
    }

    /// <summary>"yyyyMMdd" (o normal) ou segundos Unix (alguns instaladores, ex.: Riot Vanguard).</summary>
    internal static (DateTime Time, bool DateOnly)? ParseInstallDate(string? s)
    {
        s = s?.Trim();
        if (string.IsNullOrEmpty(s)) return null;
        if (s.Length == 8 && DateTime.TryParseExact(s, "yyyyMMdd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var d)) return (d, true);
        if (s.Length is 9 or 10 && long.TryParse(s, out var unix) && unix > 946_684_800)
            return (DateTimeOffset.FromUnixTimeSeconds(unix).LocalDateTime, false);
        return null;
    }

    // ------------------------------------------------------------------ drivers

    static List<PcInstall> Drivers(DateTime since)
    {
        // Kernel-PnP 400 se repete a cada boot para alguns dispositivos: vale a 1ª vez de cada (inf, versão) no log inteiro.
        var pnp = new List<PnpConfigured>();
        Scan(PnpLog, "*[System[EventID=400]]", 20_000, p =>
        {
            if (Pnp(p.Time, p.Props) is { } x) pnp.Add(x);
        });
        var services = new List<(DateTime Time, string Service, string Device)>();
        Scan("System", $"*[System[Provider[@Name='{UserPnp}'] and EventID=20003 and TimeCreated[timediff(@SystemTime) <= {Days * 86_400_000L}]]]", 500, p =>
        {
            if (p.Props.Count >= 3 && p.Props[0]?.ToString() is { Length: > 0 } svc)
                services.Add((p.Time, svc, p.Props[2]?.ToString() ?? ""));
        });
        return DriverItems(pnp, services, since);
    }

    internal sealed record PnpConfigured(DateTime Time, string Device, string Inf, string? Version, string? Provider, string? ClassGuid);

    /// <summary>Kernel-PnP 400: 0 = instância do dispositivo, 1 = inf (oemNN.inf), 2 = classe, 4 = versão, 5 = provedor, 14 = pasta no DriverStore.</summary>
    internal static PnpConfigured? Pnp(DateTime time, IReadOnlyList<object?> p)
    {
        if (p.Count < 6 || p[1]?.ToString() is not { Length: > 0 } inf) return null;
        // oemNN.inf não diz nada; a pasta do DriverStore traz o nome original (bcmwl63a.inf_amd64_…)
        if (p.Count > 14 && p[14]?.ToString() is { Length: > 0 } store)
        {
            var cut = store.IndexOf(".inf", StringComparison.OrdinalIgnoreCase);
            if (cut > 0) inf = store[..(cut + 4)];
        }
        return new PnpConfigured(time, p[0]?.ToString() ?? "", inf, Blank(p[4]?.ToString()), Blank(p[5]?.ToString()), p[2]?.ToString());
    }

    /// <summary>
    /// Regra pura: cada (inf, versão) cuja 1ª configuração caiu na janela vira um driver; UserPnp 20003 (serviço novo de
    /// driver) entra quando nenhum driver da lista caiu no mesmo dispositivo em ±2 min.
    /// </summary>
    internal static List<PcInstall> DriverItems(IEnumerable<PnpConfigured> pnp, IEnumerable<(DateTime Time, string Service, string Device)> services, DateTime since)
    {
        var list = pnp.GroupBy(x => (x.Inf.ToLowerInvariant(), x.Version))
            .Select(g => g.MinBy(x => x.Time)!)
            .Where(x => x.Time >= since)
            .ToList();
        var items = list.Select(x => new PcInstall
        {
            Time = x.Time, Kind = "driver", Name = x.Inf, Version = x.Version, Publisher = x.Provider,
            DeviceClass = ClassOf(x.ClassGuid, x.Device),
        }).ToList();
        foreach (var s in services)
        {
            if (s.Time < since) continue;
            var covered = list.Any(x => string.Equals(x.Device, s.Device, StringComparison.OrdinalIgnoreCase) && (x.Time - s.Time).Duration() <= TimeSpan.FromMinutes(2));
            if (!covered)
                items.Add(new PcInstall { Time = s.Time, Kind = "driver", Name = s.Service, Publisher = VendorOf(s.Device), DeviceClass = ClassOf(null, s.Device) });
        }
        return items;
    }

    static readonly Dictionary<string, string> Classes = new(StringComparer.OrdinalIgnoreCase)
    {
        ["4d36e972-e325-11ce-bfc1-08002be10318"] = "net",
        ["e0cbf06c-cd8b-4647-bb8a-263b43f0f974"] = "bluetooth",
        ["4d36e968-e325-11ce-bfc1-08002be10318"] = "display",
        ["4d36e96c-e325-11ce-bfc1-08002be10318"] = "media",
        ["c166523c-fe0c-4a94-a586-f1a80cfbbf3e"] = "media",
        ["745a17a0-74d3-11d0-b6fe-00a0c90f57da"] = "hid",
        ["4d36e96b-e325-11ce-bfc1-08002be10318"] = "hid",
        ["4d36e96f-e325-11ce-bfc1-08002be10318"] = "hid",
        ["36fc9e60-c465-11cf-8056-444553540000"] = "usb",
        ["88bae032-5a81-49f0-bc3d-a4ff138216d6"] = "usb",
        ["4d36e97b-e325-11ce-bfc1-08002be10318"] = "storage",
        ["4d36e967-e325-11ce-bfc1-08002be10318"] = "storage",
        ["4d36e96a-e325-11ce-bfc1-08002be10318"] = "storage",
        ["4d36e979-e325-11ce-bfc1-08002be10318"] = "printer",
        ["1ed2bbf9-11f0-4084-b21f-ad83a8e6dcdc"] = "printer",
        ["4d36e97d-e325-11ce-bfc1-08002be10318"] = "system",
        ["50127dc3-0f36-415e-a6cc-4cb3be910b65"] = "system",
    };

    static readonly Dictionary<string, string> Vendors = new(StringComparer.OrdinalIgnoreCase)
    {
        ["14E4"] = "Broadcom", ["10DE"] = "NVIDIA", ["8086"] = "Intel", ["1002"] = "AMD", ["1022"] = "AMD",
        ["10EC"] = "Realtek", ["05AC"] = "Apple", ["168C"] = "Qualcomm Atheros", ["17CB"] = "Qualcomm", ["14C3"] = "MediaTek",
        ["1B21"] = "ASMedia", ["144D"] = "Samsung", ["0BDA"] = "Realtek", ["8087"] = "Intel",
    };

    /// <summary>Fabricante pelo VEN_/VID_ da instância (só quando o evento não traz o provedor).</summary>
    internal static string? VendorOf(string device)
    {
        var m = VendorRx().Match(device);
        return m.Success && Vendors.TryGetValue(m.Groups[1].Value, out var v) ? v : null;
    }

    [GeneratedRegex(@"(?:VEN|VID)_([0-9A-F]{4})", RegexOptions.IgnoreCase)]
    private static partial Regex VendorRx();

    internal static string ClassOf(string? classGuid, string device)
    {
        if (classGuid != null && Classes.TryGetValue(classGuid.Trim('{', '}'), out var c)) return c;
        if (device.StartsWith("BTH", StringComparison.OrdinalIgnoreCase)) return "bluetooth";
        if (device.StartsWith("USB", StringComparison.OrdinalIgnoreCase)) return "usb";
        if (device.StartsWith("HID", StringComparison.OrdinalIgnoreCase)) return "hid";
        return "other";
    }

    // ------------------------------------------------------------------ Windows Update

    static List<PcInstall> Updates(DateTime since)
    {
        var list = new List<PcInstall>();
        Scan("System", $"*[System[Provider[@Name='{WindowsUpdate}'] and EventID=19 and TimeCreated[timediff(@SystemTime) <= {Days * 86_400_000L}]]]", 1_000, p =>
        {
            if (Update(p.Time, p.Props.Count > 0 ? p.Props[0]?.ToString() : null) is { } u && u.Time >= since) list.Add(u);
        });
        return list;
    }

    /// <summary>
    /// Regra pura: WindowsUpdateClient 19 (instalou). Definições do Defender (várias por dia) ficam de fora; app da Store
    /// ("9NMPJ99VJBWV-Microsoft.YourPhone") vira store com o nome do pacote.
    /// </summary>
    internal static PcInstall? Update(DateTime time, string? title)
    {
        if (string.IsNullOrWhiteSpace(title) || title.Contains("KB2267602", StringComparison.OrdinalIgnoreCase)) return null;
        title = title.Trim();
        if (StoreRx().Match(title) is { Success: true } m)
            return new PcInstall { Time = time, Kind = "store", Name = m.Groups[1].Value };
        return new PcInstall { Time = time, Kind = "update", Name = title };
    }

    [GeneratedRegex(@"^[0-9A-Z]{12}-(\S.*)$")]
    private static partial Regex StoreRx();

    // ------------------------------------------------------------------ util

    readonly record struct Raw(DateTime Time, IReadOnlyList<object?> Props);

    static void Scan(string log, string xpath, int max, Action<Raw> each)
    {
        try
        {
            var query = new EventLogQuery(log, PathType.LogName, xpath) { ReverseDirection = true };
            using var reader = new EventLogReader(query);
            for (int i = 0; i < max; i++)
            {
                using var rec = reader.ReadEvent();
                if (rec == null) break;
                IReadOnlyList<object?> props = [];
                try { props = rec.Properties.Select(p => p.Value).ToList(); } catch { }
                each(new Raw(rec.TimeCreated ?? DateTime.MinValue, props));
            }
        }
        catch { }
    }

    static string? Blank(string? s) => string.IsNullOrWhiteSpace(s) ? null : s.Trim();
}
