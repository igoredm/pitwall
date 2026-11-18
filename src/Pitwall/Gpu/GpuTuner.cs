using System.Text.Json;
using Pitwall.Config;

namespace Pitwall.Gpu;

public sealed record TuningCaps(
    bool Supported,
    string? Gpu,
    int PowerMinW,
    int PowerMaxW,
    int PowerDefaultW,
    int PowerStartW,
    int MaxClockMhz,
    bool ClockLockSupported,
    string? Error);

public sealed record TuningStatus(bool Active, int? PowerLimitW, int? ClockMaxMhz, string? Error);

/// <summary>
/// "Undervolt" seguro pela API oficial (NVML): limite de consumo + teto de clock da GPU.
/// Com o clock travado mais baixo, o driver usa o ponto da curva de voltagem correspondente — menos voltagem e calor.
/// Nada disso persiste no reboot. O Pitwall desfaz ao desligar o recurso, ao sair do jogo (modo "só em jogos"),
/// ao fechar o app, e na próxima abertura se tiver crashado no meio (arquivo-marcador).
/// </summary>
public sealed class GpuTuner : IDisposable
{
    static readonly string MarkerPath = Path.Combine(ConfigStore.Dir, "gpu-tuning.applied.json");

    /// <summary>Presets relativos ao padrão da placa (servem para qualquer NVIDIA, não só a 3080).</summary>
    /// <remarks>
    /// Calibrado com os logs reais: em jogo a 3080 fica em ~200 W (62% do padrão) com picos de ~260 W, então
    /// limites acima disso não mudam nada. O teto de clock é o que corta voltagem/calor de forma consistente.
    /// </remarks>
    public static (int PowerPct, int ClockPct) Preset(string preset) => preset switch
    {
        "cool" => (62, 80),     // 3080: 198 W, ~1680 MHz
        "balanced" => (75, 86), // 3080: 240 W, ~1800 MHz
        _ => (100, 100),
    };

    readonly IntPtr _dev;
    readonly bool _initialized;
    readonly uint _originalMw;
    (uint Mw, uint ClockMax)? _applied;
    string? _lastError;

    public TuningCaps Caps { get; }

    public GpuTuner(string? gpuName)
    {
        try
        {
            if (Nvml.Init() != Nvml.Success)
            {
                Caps = Unsupported("Driver NVIDIA (NVML) não encontrado");
                return;
            }
            _initialized = true;
            Nvml.GetCount(out var count);
            for (uint i = 0; i < count; i++)
            {
                if (Nvml.GetHandle(i, out var d) != Nvml.Success) continue;
                var name = Nvml.Name(d);
                if (_dev == IntPtr.Zero || (gpuName != null && name.Equals(gpuName, StringComparison.OrdinalIgnoreCase))) _dev = d;
            }
            if (_dev == IntPtr.Zero)
            {
                Caps = Unsupported("Nenhuma GPU NVIDIA encontrada");
                return;
            }

            var rc = Nvml.GetPowerConstraints(_dev, out var minMw, out var maxMw);
            Nvml.GetPowerDefault(_dev, out var defMw);
            Nvml.GetPowerLimit(_dev, out var curMw);
            Nvml.GetMaxClock(_dev, Nvml.ClockGraphics, out var maxClock);

            // Se crashamos com ajuste aplicado, o limite "original" é o que estava antes daquele ajuste.
            _originalMw = ReadMarker() ?? curMw;
            Caps = new TuningCaps(
                Supported: rc == Nvml.Success,
                Gpu: Nvml.Name(_dev),
                PowerMinW: (int)(minMw / 1000),
                PowerMaxW: (int)(maxMw / 1000),
                PowerDefaultW: (int)(defMw / 1000),
                PowerStartW: (int)(_originalMw / 1000),
                MaxClockMhz: (int)maxClock,
                ClockLockSupported: true, // confirmado na primeira aplicação; erro vira status
                Error: rc == Nvml.Success ? null : Nvml.Describe(rc));

            // Crash anterior deixou ajuste aplicado: desfaz já (o hub reaplica se a config pedir)
            if (File.Exists(MarkerPath)) Restore();
        }
        catch (DllNotFoundException)
        {
            Caps = Unsupported("Driver NVIDIA (NVML) não encontrado");
        }
        catch (Exception ex)
        {
            Caps = Unsupported(ex.Message);
        }
    }

    static TuningCaps Unsupported(string why) => new(false, null, 0, 0, 0, 0, 0, false, why);

    public TuningStatus Status => new(
        _applied != null,
        _applied is { } a ? (int)(a.Mw / 1000) : null,
        _applied is { ClockMax: > 0 } b ? (int)b.ClockMax : null,
        _lastError);

    /// <summary>Chamado a cada tick: aplica/desfaz só quando o estado desejado muda.</summary>
    public void Update(GpuTuningConfig cfg, bool gameActive)
    {
        if (!Caps.Supported) return;
        var desired = cfg.Enabled && (!cfg.OnlyInGames || gameActive) ? Target(cfg) : ((uint, uint)?)null;
        if (desired == _applied) return;
        if (desired is { } d) Apply(d.Item1, d.Item2);
        else Restore();
    }

    (uint Mw, uint ClockMax) Target(GpuTuningConfig cfg)
    {
        int watts, clock;
        if (cfg.Preset == "custom")
        {
            watts = cfg.PowerLimitW;
            clock = cfg.MaxClockMhz;
        }
        else
        {
            var (pp, cp) = Preset(cfg.Preset);
            watts = Caps.PowerDefaultW * pp / 100;
            clock = cp >= 100 ? 0 : Caps.MaxClockMhz * cp / 100 / 15 * 15; // passos de 15 MHz, como a placa
        }
        watts = Math.Clamp(watts, Caps.PowerMinW, Caps.PowerMaxW);
        if (clock > 0) clock = Math.Clamp(clock, 600, Caps.MaxClockMhz);
        return ((uint)watts * 1000, (uint)clock);
    }

    void Apply(uint mw, uint clockMax)
    {
        WriteMarker();
        var errors = new List<string>();
        var rc = Nvml.SetPowerLimit(_dev, mw);
        if (rc != Nvml.Success) errors.Add("limite de consumo: " + Nvml.Describe(rc));
        rc = clockMax > 0 ? Nvml.SetLockedClocks(_dev, 210, clockMax) : Nvml.ResetLockedClocks(_dev);
        if (rc != Nvml.Success && clockMax > 0) errors.Add("teto de clock: " + Nvml.Describe(rc));
        _lastError = errors.Count > 0 ? string.Join("; ", errors) : null;
        _applied = (mw, clockMax);
    }

    void Restore()
    {
        if (_dev == IntPtr.Zero) return;
        var rc1 = Nvml.SetPowerLimit(_dev, _originalMw);
        var rc2 = Nvml.ResetLockedClocks(_dev);
        _lastError = rc1 == Nvml.Success ? null : "restaurar consumo: " + Nvml.Describe(rc1);
        _ = rc2;
        _applied = null;
        try { File.Delete(MarkerPath); } catch { }
    }

    void WriteMarker()
    {
        if (File.Exists(MarkerPath)) return;
        try
        {
            Directory.CreateDirectory(ConfigStore.Dir);
            File.WriteAllText(MarkerPath, JsonSerializer.Serialize(new { originalPowerMw = _originalMw }));
        }
        catch { }
    }

    static uint? ReadMarker()
    {
        try
        {
            if (!File.Exists(MarkerPath)) return null;
            using var doc = JsonDocument.Parse(File.ReadAllText(MarkerPath));
            return doc.RootElement.GetProperty("originalPowerMw").GetUInt32();
        }
        catch { return null; }
    }

    public void Dispose()
    {
        if (_applied != null) Restore();
        if (_initialized) try { Nvml.Shutdown(); } catch { }
    }
}
