namespace Pitwall.Gpu;

/// <summary>
/// Traduz a máscara de bits do NVML (nvmlClocksEventReason*) para o valor de texto da métrica gpu.perfcap:
/// thermal | power | voltage | idle | sync | none.
/// </summary>
public static class ClockReasons
{
    public const ulong GpuIdle = 0x1;
    public const ulong ApplicationsClocksSetting = 0x2;
    public const ulong SwPowerCap = 0x4;
    public const ulong HwSlowdown = 0x8;
    public const ulong SyncBoost = 0x10;
    public const ulong SwThermalSlowdown = 0x20;
    public const ulong HwThermalSlowdown = 0x40;
    public const ulong HwPowerBrakeSlowdown = 0x80;
    public const ulong DisplayClockSetting = 0x100;

    /// <param name="reasons">Máscara do NVML.</param>
    /// <param name="gpuLoad">Uso da GPU (%), para distinguir "sem limite" de "limitado pela voltagem".</param>
    /// <remarks>
    /// O NVML não tem bit de voltagem: com a GPU sob carga e nenhum bit ligado, ela está no topo da curva V-F
    /// (o "VRel/VOp" do GPU-Z). Por isso, sem bits e com carga ≥ 50%, o motivo vira "voltage".
    /// HW slowdown sem o bit térmico é tratado como energia (power brake / proteção de consumo).
    /// </remarks>
    public static string Map(ulong reasons, double? gpuLoad)
    {
        if ((reasons & (SwThermalSlowdown | HwThermalSlowdown)) != 0) return "thermal";
        if ((reasons & (SwPowerCap | HwPowerBrakeSlowdown | HwSlowdown)) != 0) return "power";
        if ((reasons & SyncBoost) != 0) return "sync";
        if ((reasons & GpuIdle) != 0) return "idle";
        // Clock fixado por aplicativo/usuário (inclui o teto de clock do próprio Pitwall): não é limite do hardware.
        if ((reasons & (ApplicationsClocksSetting | DisplayClockSetting)) != 0) return "none";
        return gpuLoad is >= 50 ? "voltage" : "none";
    }
}
