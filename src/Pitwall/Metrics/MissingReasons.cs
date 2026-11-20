using System.Text.RegularExpressions;
using Pitwall.Localization;

namespace Pitwall.Metrics;

/// <summary>Valores de MetricDef.missing (models.ts › MissingReason).</summary>
public static class MissingReason
{
    public const string NotExposed = "notExposed";
    public const string NeedsNvidia = "needsNvidia";
    public const string NeedsPawnIO = "needsPawnIO";
    public const string NeedsAdmin = "needsAdmin";
    public const string NoDevice = "noDevice";
    public const string NeedsPresentMon = "needsPresentMon";
    public const string Off = "off";
}

/// <summary>O que se sabe do PC para explicar um sensor sem leitura.</summary>
/// <param name="GpuVendor">nvidia | amd | intel | null (sem GPU).</param>
/// <param name="Gpu2Vendor">Idem, da segunda GPU (null = não há).</param>
/// <param name="HasDevice">Há algum aparelho sem fio com bateria (só para battery.*).</param>
/// <param name="BatteryOn">features/battery ligado (só para battery.*).</param>
public sealed record MissingContext(
    string? GpuVendor,
    string? GpuName,
    bool PawnIO,
    bool Admin,
    bool PresentMon,
    bool HasDevice = false,
    string? Gpu2Vendor = null,
    string? Gpu2Name = null,
    bool BatteryOn = true);

/// <summary>
/// Por que uma métrica está sem leitura (available = false), com um texto que um jogador entende.
/// Regra pura: entra o id e o que se sabe do PC, sai o motivo. Testada em MissingReasonTests e nos fixtures de dump.
/// </summary>
public static partial class MissingReasons
{
    public sealed record Result(string Reason, string Text);

    /// <summary>Sensores que só existem com o driver PawnIO (MSR/SMBus/SuperIO).</summary>
    static bool NeedsDriver(string id) =>
        id is "cpu.temp" or "cpu.power" or "cpu.clockAvg"
        || (id.StartsWith("cpu.") && (id.EndsWith(".temp") || id.EndsWith(".clock")))
        || id.StartsWith("ram.dimm") || id.StartsWith("mb.");

    public static Result For(string id, MissingContext c)
    {
        // FPS: PresentMon (vem no instalador) + ETW, que precisa de administrador
        if (id.StartsWith("fps."))
        {
            if (!c.PresentMon)
                return new(MissingReason.NeedsPresentMon, L.T(
                    "O FPS vem do PresentMon, que não foi encontrado. Reinstale o Pitwall para trazê-lo de volta.",
                    "FPS comes from PresentMon, which wasn't found. Reinstall Pitwall to bring it back."));
            if (!c.Admin)
                return new(MissingReason.NeedsAdmin, L.T(
                    "Para ler o FPS o Pitwall precisa rodar como administrador.",
                    "Pitwall needs to run as administrator to read FPS."));
            return new(MissingReason.NotExposed, L.T("Sem leitura de FPS neste PC.", "No FPS reading on this PC."));
        }

        if (id.StartsWith("battery."))
        {
            if (!c.BatteryOn)
                return new(MissingReason.Off, L.T("A leitura de bateria está desligada.", "Battery reading is turned off."));
            return new(MissingReason.NoDevice, L.T(
                "Nenhum mouse, headset ou controle sem fio com bateria foi encontrado.",
                "No wireless mouse, headset or controller with a battery was found."));
        }

        if (id == "gpu.perfcap")
        {
            if (c.GpuVendor != "nvidia")
                return new(MissingReason.NeedsNvidia, L.T(
                    "Só placas NVIDIA dizem por que o clock caiu (calor, consumo, voltagem).",
                    "Only NVIDIA cards report why the clock dropped (heat, power, voltage)."));
            return new(MissingReason.NotExposed, L.T(
                "O driver da NVIDIA não respondeu. Atualizar o driver costuma resolver.",
                "The NVIDIA driver didn't answer. Updating the driver usually fixes it."));
        }

        if (id.StartsWith("gpu2."))
        {
            if (c.Gpu2Vendor == null && c.Gpu2Name == null)
                return new(MissingReason.NoDevice, L.T("Este PC não tem uma segunda placa de vídeo.", "This PC has no second graphics card."));
            return GpuNotExposed(c.Gpu2Vendor, c.Gpu2Name, id);
        }

        if (id.StartsWith("gpu."))
        {
            if (c.GpuVendor == null && c.GpuName == null)
                return new(MissingReason.NoDevice, L.T("Nenhuma placa de vídeo foi encontrada.", "No graphics card was found."));
            return GpuNotExposed(c.GpuVendor, c.GpuName, id);
        }

        if (id.StartsWith("disk") || id.StartsWith("net."))
            return new(MissingReason.NoDevice, L.T("O dispositivo não foi encontrado.", "The device wasn't found."));

        if (NeedsDriver(id))
        {
            if (!c.PawnIO)
                return new(MissingReason.NeedsPawnIO, L.T(
                    "Falta o driver PawnIO, que lê temperatura e consumo da CPU. Reinstale o Pitwall para instalá-lo.",
                    "The PawnIO driver, which reads CPU temperature and power, is missing. Reinstall Pitwall to install it."));
            if (!c.Admin)
                return new(MissingReason.NeedsAdmin, L.T(
                    "A temperatura da CPU só aparece com o Pitwall rodando como administrador.",
                    "CPU temperature only shows up with Pitwall running as administrator."));
            return new(MissingReason.NotExposed, L.T(
                "O LibreHardwareMonitor não reconhece esse sensor nesta CPU ou placa-mãe.",
                "LibreHardwareMonitor doesn't recognize this sensor on this CPU or motherboard."));
        }

        return new(MissingReason.NotExposed, L.T("Este PC não informa esse sensor.", "This PC doesn't report this sensor."));
    }

    static Result GpuNotExposed(string? vendor, string? name, string id)
    {
        var hotspot = id.EndsWith(".hotspot") || id.EndsWith(".hotspotDelta");
        if (vendor == "nvidia" && hotspot && IsRtx50(name))
            return new(MissingReason.NotExposed, L.T(
                "A NVIDIA tirou o sensor de hot spot nas RTX 50: nenhum programa consegue ler.",
                "NVIDIA removed the hot spot sensor on RTX 50 cards: no app can read it."));
        if (vendor == "nvidia" && id.EndsWith(".memjunction"))
            return new(MissingReason.NotExposed, L.T(
                "Esta placa não informa a temperatura da memória (é comum fora das GDDR6X).",
                "This card doesn't report memory temperature (common on cards without GDDR6X)."));
        if (vendor == "nvidia")
            return new(MissingReason.NotExposed, L.T(
                "O driver da NVIDIA não informa esse sensor nesta placa.",
                "The NVIDIA driver doesn't report this sensor on this card."));
        var brand = vendor switch { "amd" => "AMD", "intel" => "Intel", _ => L.T("desta marca", "from this brand") };
        return new(MissingReason.NotExposed, L.T(
            $"O LibreHardwareMonitor não tem esse sensor para placas {brand} como a sua.",
            $"LibreHardwareMonitor doesn't have this sensor for {brand} cards like yours."));
    }

    /// <summary>GeForce RTX 5050/5060/5070/5080/5090 (Ti/SUPER, notebook incluídos).</summary>
    public static bool IsRtx50(string? gpuName) => gpuName != null && Rtx50Regex().IsMatch(gpuName);

    [GeneratedRegex(@"RTX\s*50[5-9]0", RegexOptions.IgnoreCase)]
    private static partial Regex Rtx50Regex();
}
