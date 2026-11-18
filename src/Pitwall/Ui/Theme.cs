using Microsoft.Win32;
using Pitwall.Config;

namespace Pitwall.Ui;

/// <summary>Cor de fundo nativa de cada tema (evita "flash" antes da página carregar e pinta a borda de redimensionar).</summary>
internal static class Theme
{
    public static bool IsDark(AppConfig c, string theme)
    {
        if (theme is "neon" or "terminal") return true; // só existem no escuro
        return c.ThemeMode switch
        {
            "light" => false,
            "system" => !SystemUsesLightTheme(),
            _ => true,
        };
    }

    public static Color Background(AppConfig c, string theme)
    {
        var dark = IsDark(c, theme);
        return (theme, dark) switch
        {
            ("minimo", true) => Color.FromArgb(0x0F, 0x0F, 0x10),
            ("minimo", false) => Color.FromArgb(0xFA, 0xFA, 0xF9),
            ("neon", _) => Color.FromArgb(0x04, 0x05, 0x0B),
            ("terminal", _) => Color.FromArgb(0x0B, 0x0D, 0x0E),
            ("splash", true) => Color.FromArgb(0x14, 0x0A, 0x26),
            ("splash", false) => Color.FromArgb(0xFF, 0xF4, 0xE6),
            (_, false) => Color.FromArgb(0xE8, 0xEC, 0xF3),
            _ => Color.FromArgb(0x0A, 0x0D, 0x13),
        };
    }

    /// <summary>
    /// Configurações (visual único do app, 1.0): escuro conforme config.appearance; "system" segue o tema de apps do
    /// Windows (AppsUseLightTheme). Não depende do themeMode, que é só do widget.
    /// </summary>
    public static bool AppIsDark(AppConfig c) => c.Appearance switch
    {
        "light" => false,
        "dark" => true,
        _ => !SystemUsesLightTheme(),
    };

    /// <summary>--bg das configurações (docs/design-notes.md, "Tokens do app").</summary>
    public static Color AppBackground(bool dark) => dark ? Color.FromArgb(0x0E, 0x10, 0x14) : Color.FromArgb(0xF3, 0xF4, 0xF6);

    static bool SystemUsesLightTheme()
    {
        try
        {
            return Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize")
                ?.GetValue("AppsUseLightTheme") is int v && v == 1;
        }
        catch { return false; }
    }
}
