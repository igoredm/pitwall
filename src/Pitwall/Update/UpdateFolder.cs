using System.Runtime.InteropServices;
using System.Security.AccessControl;
using System.Security.Principal;
using Microsoft.Win32.SafeHandles;

namespace Pitwall.Update;

/// <summary>
/// Pasta dos instaladores baixados: %LOCALAPPDATA%\Pitwall\updates.
/// O app roda elevado e executa o que estiver aqui, então a pasta tem ACL própria, sem herança: Administradores e
/// SYSTEM com controle total, o usuário só com leitura, e dono = Administradores. Um processo comum do usuário
/// (não elevado) não consegue criar, trocar nem apagar arquivos nela, nem mudar a ACL.
/// Se a pasta existir com qualquer outra configuração (ou for um link/junção), ela é apagada e recriada.
/// </summary>
internal static partial class UpdateFolder
{
    public static readonly string Root = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Pitwall");
    public static readonly string Dir = Path.Combine(Root, "updates");

    static readonly SecurityIdentifier Admins = new(WellKnownSidType.BuiltinAdministratorsSid, null);
    static readonly SecurityIdentifier SystemSid = new(WellKnownSidType.LocalSystemSid, null);

    /// <summary>Garante a pasta com a ACL restrita (cria/recria se preciso).</summary>
    public static void EnsureSecure()
    {
        Directory.CreateDirectory(Root);
        // Uma junção plantada em ...\Pitwall desviaria a escrita para outro lugar.
        if (IsReparsePoint(Root)) throw new IOException($"{Root} é um link/junção; atualização recusada");

        if (Directory.Exists(Dir) && !IsReparsePoint(Dir) && HasExpectedAcl()) return;

        if (Directory.Exists(Dir))
        {
            if (IsReparsePoint(Dir)) Directory.Delete(Dir); // remove só o link, sem seguir
            else Directory.Delete(Dir, recursive: true);
        }
        else if (File.Exists(Dir)) File.Delete(Dir);

        new DirectoryInfo(Dir).Create(BuildAcl());
    }

    /// <summary>Apaga instaladores antigos (o log fica). Falhas são ignoradas: o arquivo pode estar em uso.</summary>
    public static void DeleteInstallers()
    {
        try
        {
            if (!Directory.Exists(Dir) || IsReparsePoint(Dir)) return;
            foreach (var f in Directory.EnumerateFiles(Dir, "*.exe")) { try { File.Delete(f); } catch { } }
        }
        catch { }
    }

    static bool IsReparsePoint(string path) => File.GetAttributes(path).HasFlag(FileAttributes.ReparsePoint);

    static bool Elevated()
    {
        using var id = WindowsIdentity.GetCurrent();
        return new WindowsPrincipal(id).IsInRole(WindowsBuiltInRole.Administrator);
    }

    /// <summary>Dono = Administradores e ACL protegida: só um processo elevado pode ter deixado a pasta assim.</summary>
    static bool HasExpectedAcl()
    {
        if (!Elevated()) return false; // sem elevação não há o que proteger; recria sempre
        try
        {
            var sec = new DirectoryInfo(Dir).GetAccessControl(AccessControlSections.Owner | AccessControlSections.Access);
            if (!Admins.Equals(sec.GetOwner(typeof(SecurityIdentifier))) || !sec.AreAccessRulesProtected) return false;
            using var id = WindowsIdentity.GetCurrent();
            foreach (FileSystemAccessRule rule in sec.GetAccessRules(true, true, typeof(SecurityIdentifier)))
            {
                var sid = (SecurityIdentifier)rule.IdentityReference;
                if (sid.Equals(Admins) || sid.Equals(SystemSid)) continue;
                // Qualquer outra entrada só pode ser leitura do próprio usuário
                const FileSystemRights write = FileSystemRights.Write | FileSystemRights.Delete | FileSystemRights.DeleteSubdirectoriesAndFiles
                    | FileSystemRights.ChangePermissions | FileSystemRights.TakeOwnership | FileSystemRights.AppendData;
                if (rule.AccessControlType == AccessControlType.Allow && (id.User is null || !sid.Equals(id.User) || (rule.FileSystemRights & write) != 0)) return false;
            }
            return true;
        }
        catch
        {
            return false;
        }
    }

    static DirectorySecurity BuildAcl()
    {
        var sec = new DirectorySecurity();
        sec.SetAccessRuleProtection(isProtected: true, preserveInheritance: false);
        const InheritanceFlags inherit = InheritanceFlags.ContainerInherit | InheritanceFlags.ObjectInherit;
        using var identity = WindowsIdentity.GetCurrent();
        var elevated = new WindowsPrincipal(identity).IsInRole(WindowsBuiltInRole.Administrator);

        sec.AddAccessRule(new FileSystemAccessRule(Admins, FileSystemRights.FullControl, inherit, PropagationFlags.None, AccessControlType.Allow));
        sec.AddAccessRule(new FileSystemAccessRule(SystemSid, FileSystemRights.FullControl, inherit, PropagationFlags.None, AccessControlType.Allow));
        // Se por algum motivo o app não estiver elevado, o próprio usuário precisa escrever.
        sec.AddAccessRule(new FileSystemAccessRule(identity.User!, elevated ? FileSystemRights.ReadAndExecute : FileSystemRights.FullControl,
            inherit, PropagationFlags.None, AccessControlType.Allow));
        if (elevated) sec.SetOwner(Admins);
        return sec;
    }

    /// <summary>Caminho real do arquivo aberto (resolve links), para conferir que o handle travado é o arquivo esperado.</summary>
    public static unsafe string? FinalPath(SafeFileHandle handle)
    {
        const int max = 1024;
        var buf = stackalloc char[max];
        var n = GetFinalPathNameByHandle(handle, buf, max, 0);
        if (n == 0 || n >= max) return null;
        var s = new string(buf, 0, (int)n);
        return s.StartsWith(@"\\?\UNC\", StringComparison.Ordinal) ? null : s.StartsWith(@"\\?\", StringComparison.Ordinal) ? s[4..] : s;
    }

    [LibraryImport("kernel32.dll", EntryPoint = "GetFinalPathNameByHandleW", SetLastError = true)]
    private static unsafe partial uint GetFinalPathNameByHandle(SafeFileHandle hFile, char* lpszFilePath, uint cchFilePath, uint dwFlags);
}

/// <summary>Registro do atualizador em %LOCALAPPDATA%\Pitwall\updates\updater.log (diagnóstico local; nada é enviado).</summary>
internal static class UpdateLog
{
    static readonly string FilePath = Path.Combine(UpdateFolder.Dir, "updater.log");
    static readonly Lock Gate = new();

    public static void Write(string message)
    {
        System.Diagnostics.Debug.WriteLine("[update] " + message);
        lock (Gate)
        {
            try
            {
                // Mesma pasta protegida dos instaladores: o processo elevado não escreve onde um processo comum possa plantar um link.
                UpdateFolder.EnsureSecure();
                var info = new FileInfo(FilePath);
                if (info.Exists && info.Length > 256 * 1024) File.Move(FilePath, FilePath + ".old", overwrite: true);
                File.AppendAllText(FilePath, $"{DateTime.Now:yyyy-MM-dd HH:mm:ss} {message}{Environment.NewLine}");
            }
            catch { }
        }
    }
}
