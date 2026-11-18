using Pitwall.Localization;
using System.Runtime.InteropServices;
using System.Text;

namespace Pitwall.Gpu;

/// <summary>
/// NVML (nvml.dll, vem com o driver NVIDIA) — API oficial e documentada, a mesma do nvidia-smi.
/// Só fala com o driver da placa; não toca em nenhum processo (seguro para anti-cheat).
/// </summary>
internal static partial class Nvml
{
    public const int Success = 0, NotSupported = 3, NoPermission = 4;
    public const int ClockGraphics = 0;

    const string Dll = "nvml.dll";

    [LibraryImport(Dll, EntryPoint = "nvmlInit_v2")] public static partial int Init();
    [LibraryImport(Dll, EntryPoint = "nvmlShutdown")] public static partial int Shutdown();
    [LibraryImport(Dll, EntryPoint = "nvmlDeviceGetCount_v2")] public static partial int GetCount(out uint count);
    [LibraryImport(Dll, EntryPoint = "nvmlDeviceGetHandleByIndex_v2")] public static partial int GetHandle(uint index, out IntPtr device);
    [LibraryImport(Dll, EntryPoint = "nvmlDeviceGetName")] private static partial int GetNameRaw(IntPtr device, [Out] byte[] name, uint length);

    [LibraryImport(Dll, EntryPoint = "nvmlDeviceGetPowerManagementLimitConstraints")] public static partial int GetPowerConstraints(IntPtr device, out uint minMw, out uint maxMw);
    [LibraryImport(Dll, EntryPoint = "nvmlDeviceGetPowerManagementDefaultLimit")] public static partial int GetPowerDefault(IntPtr device, out uint mw);
    [LibraryImport(Dll, EntryPoint = "nvmlDeviceGetPowerManagementLimit")] public static partial int GetPowerLimit(IntPtr device, out uint mw);
    [LibraryImport(Dll, EntryPoint = "nvmlDeviceSetPowerManagementLimit")] public static partial int SetPowerLimit(IntPtr device, uint mw);

    [LibraryImport(Dll, EntryPoint = "nvmlDeviceGetMaxClockInfo")] public static partial int GetMaxClock(IntPtr device, int type, out uint mhz);
    [LibraryImport(Dll, EntryPoint = "nvmlDeviceSetGpuLockedClocks")] public static partial int SetLockedClocks(IntPtr device, uint minMhz, uint maxMhz);
    [LibraryImport(Dll, EntryPoint = "nvmlDeviceResetGpuLockedClocks")] public static partial int ResetLockedClocks(IntPtr device);

    // Motivo de limitação do clock. "ClocksEventReasons" é o nome novo (driver R535+); o antigo "ThrottleReasons" fica de reserva.
    [LibraryImport(Dll, EntryPoint = "nvmlDeviceGetCurrentClocksEventReasons")] public static partial int GetClocksEventReasons(IntPtr device, out ulong reasons);
    [LibraryImport(Dll, EntryPoint = "nvmlDeviceGetCurrentClocksThrottleReasons")] public static partial int GetClocksThrottleReasons(IntPtr device, out ulong reasons);

    public static string Name(IntPtr device)
    {
        var buf = new byte[96];
        return GetNameRaw(device, buf, (uint)buf.Length) == Success
            ? Encoding.ASCII.GetString(buf).TrimEnd('\0')
            : "";
    }

    public static string Describe(int code) => code switch
    {
        Success => "ok",
        NotSupported => L.T("não suportado por esta placa/driver", "not supported by this card/driver"),
        NoPermission => L.T("sem permissão (precisa de administrador)", "no permission (needs administrator)"),
        _ => $"erro NVML {code}",
    };
}
