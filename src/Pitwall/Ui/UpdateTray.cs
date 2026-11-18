using Pitwall.Localization;
using Pitwall.Update;

namespace Pitwall.Ui;

/// <summary>Parte do atualizador na bandeja: item de menu e balões. Separado do TrayApp para manter o merge simples.</summary>
internal static class UpdateTray
{
    /// <summary>Liga os eventos do atualizador ao ícone da bandeja. <paramref name="exit"/> fecha o app (o instalador espera).</summary>
    public static void Attach(NotifyIcon tray, SynchronizationContext ui, UpdateService? updater, Action exit, Action openSettings)
    {
        if (updater == null) return;
        var balloonIsUpdate = false;
        tray.BalloonTipClicked += (_, _) => { if (balloonIsUpdate) openSettings(); };
        tray.BalloonTipClosed += (_, _) => balloonIsUpdate = false;

        updater.UpdateAvailable += ver => ui.Post(_ =>
        {
            balloonIsUpdate = true;
            tray.ShowBalloonTip(8000, "Pitwall",
                L.T($"Pitwall {ver} está disponível. Use \"Atualização\" no menu da bandeja para instalar.",
                    $"Pitwall {ver} is available. Use \"Update\" in the tray menu to install it."), ToolTipIcon.Info);
        }, null);
        updater.Notice += (text, error) => ui.Post(_ =>
        {
            balloonIsUpdate = false;
            tray.ShowBalloonTip(5000, "Pitwall", text, error ? ToolTipIcon.Warning : ToolTipIcon.Info);
        }, null);
        updater.ExitRequested += () => ui.Post(_ => exit(), null);
    }

    /// <summary>"Verificar atualizações" ou, com versão disponível, o submenu com as ações.</summary>
    public static ToolStripItem MenuItem(UpdateService? updater)
    {
        if (updater == null) return new ToolStripMenuItem(L.T("Verificar atualizações", "Check for updates")) { Enabled = false };
        var s = updater.State;
        switch (s.Status)
        {
            case "checking":
                return new ToolStripMenuItem(L.T("Verificando atualizações…", "Checking for updates…")) { Enabled = false };
            case "downloading":
                return new ToolStripMenuItem(L.T($"Baixando Pitwall {s.Version}… {s.Progress ?? 0}%", $"Downloading Pitwall {s.Version}… {s.Progress ?? 0}%")) { Enabled = false };
            case "available":
            case "ready":
                var menu = new ToolStripMenuItem(L.T($"Atualização: Pitwall {s.Version}", $"Update: Pitwall {s.Version}"));
                if (s.WaitingForGame)
                    menu.DropDownItems.Add(new ToolStripMenuItem(L.T("Aguardando o jogo fechar…", "Waiting for the game to close…")) { Enabled = false });
                else
                    menu.DropDownItems.Add(L.T("Atualizar agora", "Update now"), null, (_, _) => updater.RequestInstall(now: true));
                menu.DropDownItems.Add(new ToolStripMenuItem(L.T("Atualizar ao sair", "Update on exit"), null, (_, _) => updater.RequestInstall(now: false))
                {
                    Checked = s.InstallOnExit,
                    Enabled = !s.InstallOnExit,
                });
                menu.DropDownItems.Add(L.T("Pular esta versão", "Skip this version"), null, (_, _) => updater.Skip());
                return menu;
            default:
                return new ToolStripMenuItem(L.T("Verificar atualizações", "Check for updates"), null, (_, _) => _ = updater.CheckAsync(manual: true));
        }
    }
}
