using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Text;
using Microsoft.Win32.SafeHandles;

namespace Pitwall.Sensors;

/// <summary>
/// 1.3.1: quais discos físicos têm um volume montado (letra ou pasta). Em disco sem volume que o Windows leia (partição
/// Linux, por exemplo), o "Used Space" do LibreHardwareMonitor vem perto de 100% sem refletir o uso real.
/// Só consulta metadados do volume, uma vez, ao montar a lista de sensores.
/// </summary>
public static class DiskVolumes
{
    const uint IoctlVolumeGetDiskExtents = 0x00560000;
    const uint FileShareReadWrite = 3, OpenExisting = 3;
    const int ExtentsHeader = 8, ExtentSize = 24, MaxExtents = 32;

    /// <summary>
    /// O "espaço usado" deste disco é confiável? <paramref name="identifier"/> = id do LHM ("/nvme/3", "/ssd/1"), cujo fim é
    /// o número do disco físico. Sem informação (lista vazia ou id fora do padrão) mantém a métrica.
    /// </summary>
    public static bool HasReadableSpace(string identifier, IReadOnlySet<int> disksWithVolumes)
    {
        if (disksWithVolumes.Count == 0) return true;
        var last = identifier.TrimEnd('/').Split('/')[^1];
        return !int.TryParse(last, out var disk) || disksWithVolumes.Contains(disk);
    }

    /// <summary>Números dos discos físicos com pelo menos um volume montado. Falha = conjunto vazio.</summary>
    public static HashSet<int> PhysicalDisksWithVolumes()
    {
        var disks = new HashSet<int>();
        var name = new StringBuilder(64);
        try
        {
            using var find = FindFirstVolumeW(name, name.Capacity);
            if (find.IsInvalid) return disks;
            do
            {
                var volume = name.ToString();
                if (IsMounted(volume)) AddExtents(volume, disks);
            }
            while (FindNextVolumeW(find, name, name.Capacity));
        }
        catch (Exception e) when (e is Win32Exception or DllNotFoundException or EntryPointNotFoundException) { }
        return disks;
    }

    static bool IsMounted(string volume)
    {
        var paths = new char[512];
        return GetVolumePathNamesForVolumeNameW(volume, paths, paths.Length, out var length) && length > 1 && paths[0] != '\0';
    }

    static void AddExtents(string volume, HashSet<int> disks)
    {
        using var handle = CreateFileW(volume.TrimEnd('\\'), 0, FileShareReadWrite, IntPtr.Zero, OpenExisting, 0, IntPtr.Zero);
        if (handle.IsInvalid) return;
        var buffer = new byte[ExtentsHeader + ExtentSize * MaxExtents];
        if (!DeviceIoControl(handle, IoctlVolumeGetDiskExtents, IntPtr.Zero, 0, buffer, buffer.Length, out _, IntPtr.Zero)) return;
        var count = Math.Min(BitConverter.ToInt32(buffer, 0), MaxExtents);
        for (var i = 0; i < count; i++) disks.Add(BitConverter.ToInt32(buffer, ExtentsHeader + ExtentSize * i));
    }

    sealed class VolumeFindHandle() : SafeHandleZeroOrMinusOneIsInvalid(true)
    {
        protected override bool ReleaseHandle() => FindVolumeClose(handle);
    }

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    static extern VolumeFindHandle FindFirstVolumeW(StringBuilder name, int length);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    static extern bool FindNextVolumeW(VolumeFindHandle find, StringBuilder name, int length);
    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool FindVolumeClose(IntPtr find);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    static extern bool GetVolumePathNamesForVolumeNameW(string volume, [Out] char[] names, int length, out int returned);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    static extern SafeFileHandle CreateFileW(string name, uint access, uint share, IntPtr security, uint disposition, uint flags, IntPtr template);
    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool DeviceIoControl(SafeFileHandle device, uint code, IntPtr input, int inputSize, [Out] byte[] output, int outputSize, out int returned, IntPtr overlapped);
}
