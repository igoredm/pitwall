using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace Pitwall.Ui;

/// <summary>Ambiente WebView2 único (widget + configurações compartilham processos e cache).</summary>
internal static class WebViewHost
{
    public const string Origin = "https://pitwall.local";

    static Task<CoreWebView2Environment>? _env;

    static Task<CoreWebView2Environment> Environment() => _env ??= CoreWebView2Environment.CreateAsync(null,
        Path.Combine(System.Environment.GetFolderPath(System.Environment.SpecialFolder.LocalApplicationData), "Pitwall", "WebView2"),
        // Enxuga o Chromium: sem rede de fundo, extensões, sync, SmartScreen etc.
        // --disable-gpu: renderização por software — metade da RAM e zero disputa de GPU com o jogo (medido: CPU igual).
        new CoreWebView2EnvironmentOptions(
            "--disable-background-networking --disable-component-update --disable-sync --disable-extensions " +
            "--disable-default-apps --no-first-run --disable-features=msSmartScreenProtection,msWebOOUI,msPdfOOUI,SpareRendererForSitePerProcess " +
            "--renderer-process-limit=1 --disable-gpu"));

    public static async Task<CoreWebView2> Init(WebView2 web, bool nonClientDrag)
    {
        await web.EnsureCoreWebView2Async(await Environment());
        var core = web.CoreWebView2;
        core.Settings.IsNonClientRegionSupportEnabled = nonClientDrag;
        core.Settings.AreDefaultContextMenusEnabled = false;
        core.Settings.IsStatusBarEnabled = false;
        core.Settings.IsZoomControlEnabled = false;
        core.Settings.IsPasswordAutosaveEnabled = false;
        core.Settings.IsGeneralAutofillEnabled = false;
#if !DEBUG
        core.Settings.AreBrowserAcceleratorKeysEnabled = false;
        core.Settings.AreDevToolsEnabled = false;
#endif
        core.SetVirtualHostNameToFolderMapping("pitwall.local",
            Path.Combine(AppContext.BaseDirectory, "wwwroot"), CoreWebView2HostResourceAccessKind.Deny);
        // Nada de navegar para fora do app
        core.NavigationStarting += (_, e) =>
        {
            if (!e.Uri.StartsWith(Origin, StringComparison.OrdinalIgnoreCase)) e.Cancel = true;
        };
        core.NewWindowRequested += (_, e) => e.Handled = true;
        return core;
    }

    public static string Url(int port, string route) => $"{Origin}/index.html?port={port}#/{route}";
}
