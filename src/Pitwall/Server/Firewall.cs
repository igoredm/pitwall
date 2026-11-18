using System.Diagnostics;

namespace Pitwall.Server;

/// <summary>
/// Regra de entrada do Firewall do Windows para a visualização no celular: só a porta configurada e só a sub-rede
/// local (remoteip=localsubnet). Criada ao ligar, removida ao desligar e na desinstalação (installer/Pitwall.iss).
/// Sem program=: quem escuta é o http.sys (processo System), não o Pitwall.exe.
/// </summary>
internal static class Firewall
{
    public const string RuleName = "Pitwall-PhoneView";

    /// <summary>Marca que o Pitwall criou a regra (para remover mesmo se o app fechou com o recurso ligado).</summary>
    static readonly string Marker = Path.Combine(Games.CrashRing.Dir, "firewall-rule.txt");

    public static bool Add(int port)
    {
        Netsh("advfirewall", "firewall", "delete", "rule", $"name={RuleName}");
        var ok = Netsh("advfirewall", "firewall", "add", "rule", $"name={RuleName}", "dir=in", "action=allow",
            "protocol=TCP", $"localport={port}", "remoteip=localsubnet", "profile=any", "enable=yes") == 0;
        if (ok)
        {
            try
            {
                Directory.CreateDirectory(Path.GetDirectoryName(Marker)!);
                File.WriteAllText(Marker, port.ToString());
            }
            catch { }
        }
        return ok;
    }

    /// <summary>Remove a regra, se o Pitwall a criou.</summary>
    public static void Remove()
    {
        if (!File.Exists(Marker)) return;
        Netsh("advfirewall", "firewall", "delete", "rule", $"name={RuleName}");
        try { File.Delete(Marker); } catch { }
    }

    static int Netsh(params string[] args)
    {
        try
        {
            var psi = new ProcessStartInfo(Path.Combine(Environment.SystemDirectory, "netsh.exe"))
            {
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
            };
            foreach (var a in args) psi.ArgumentList.Add(a);
            using var p = Process.Start(psi);
            if (p == null) return -1;
            p.StandardOutput.ReadToEnd();
            p.StandardError.ReadToEnd();
            if (!p.WaitForExit(10_000)) { try { p.Kill(); } catch { } return -1; }
            return p.ExitCode;
        }
        catch { return -1; }
    }
}
