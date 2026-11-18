namespace Pitwall.Ui;

internal static class AppIcon
{
    static Icon? _small;
    static Icon? _large;

    /// <summary>Ícone da bandeja (tamanho pequeno do sistema, respeita DPI).</summary>
    public static Icon Small() => _small ??= Load(SystemInformation.SmallIconSize);

    public static Icon Large() => _large ??= Load(SystemInformation.IconSize);

    static Icon Load(Size size)
    {
        using var stream = typeof(AppIcon).Assembly.GetManifestResourceStream("pitwall.ico")!;
        return new Icon(stream, size);
    }
}
