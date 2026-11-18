namespace Pitwall.Config;

public sealed class AppConfig
{
    /// <summary>Versão do formato do arquivo, para migrações.</summary>
    public int Version { get; set; }

    public int RefreshMs { get; set; } = 500;
    public int WebSocketPort { get; set; } = 48123;

    public string AppTheme { get; set; } = "lumen";
    public string WidgetTheme { get; set; } = "lumen";
    /// <summary>dark | light | system</summary>
    public string ThemeMode { get; set; } = "dark";
    /// <summary>Cor de destaque. Vazio = padrão de cada tema.</summary>
    public string Accent { get; set; } = "";
    /// <summary>auto (idioma do Windows) | pt-BR | en</summary>
    public string Language { get; set; } = "auto";

    public bool StartWithWindows { get; set; }
    public bool AutoOpenWidgetOnGame { get; set; } = true;

    /// <summary>"auto" = GPU no slot PCIe principal (menor barramento); senão o identificador LHM.</summary>
    public string PrimaryGpu { get; set; } = "auto";

    /// <summary>Nome exibido no bloco (ex.: gpu → "3080", cpu → "12600K"). Vazio = derivado do hardware.</summary>
    public Dictionary<string, string> GroupLabels { get; set; } = [];

    public WidgetWindowConfig Widget { get; set; } = new();
    public GpuTuningConfig GpuTuning { get; set; } = new();
    public BatteryConfig Battery { get; set; } = new();
    public LogConfig Log { get; set; } = new();
    public GamesConfig Games { get; set; } = new();
    public AlertsConfig Alerts { get; set; } = new();
    public RemoteConfig Remote { get; set; } = new();
    public List<MetricSetting> Metrics { get; set; } = [];
}

/// <summary>Aviso do Windows quando uma métrica fica no vermelho por 5 s ou mais. Desligado por padrão.</summary>
public sealed class AlertsConfig
{
    public bool Enabled { get; set; }
    /// <summary>Toca o som de alerta do Windows junto com o aviso.</summary>
    public bool Sound { get; set; }
    /// <summary>Intervalo mínimo entre avisos da mesma métrica.</summary>
    public int MinIntervalMin { get; set; } = 5;
}

/// <summary>Visualização no celular pela rede local (somente leitura). Desligada por padrão.</summary>
public sealed class RemoteConfig
{
    public bool Enabled { get; set; }
    public int Port { get; set; } = 48124;
    /// <summary>Celulares pareados. Só o hash SHA-256 do token fica salvo; o token em si fica no celular.</summary>
    public List<PairedDevice> PairedDevices { get; set; } = [];
}

public sealed class PairedDevice
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    /// <summary>SHA-256 (hex minúsculo) do token do dispositivo.</summary>
    public string TokenHash { get; set; } = "";
    public DateTime Created { get; set; }
}

/// <summary>Perfil por jogo: aplicado quando o jogo começa e desfeito quando ele termina (nada fica salvo no meio).</summary>
public sealed class GameProfile
{
    /// <summary>off | balanced | cool | custom. null = usa a config geral.</summary>
    public string? TuningPreset { get; set; }
    /// <summary>auto | full | mid | compact. null = usa a config geral.</summary>
    public string? Layout { get; set; }
}

public sealed class WidgetWindowConfig
{
    public bool Visible { get; set; } = true;
    /// <summary>Nome do dispositivo do monitor (ex.: \\.\DISPLAY2). Vazio = primeiro monitor secundário.</summary>
    public string Monitor { get; set; } = "";
    /// <summary>Posição relativa ao canto do monitor, em pixels físicos.</summary>
    public int X { get; set; } = 40;
    public int Y { get; set; } = 40;
    public int Width { get; set; } = 1280;
    public int Height { get; set; } = 400;
    public bool AlwaysOnTop { get; set; }
    /// <summary>Travar posição: sem arrastar/redimensionar.</summary>
    public bool Locked { get; set; }
    /// <summary>auto | full | mid | compact. Automático = escolhe pelo tamanho da janela.</summary>
    public string Layout { get; set; } = "auto";
}

/// <summary>Limite de consumo + teto de clock da GPU NVIDIA (via NVML). Desligado por padrão.</summary>
public sealed class GpuTuningConfig
{
    public bool Enabled { get; set; }
    /// <summary>balanced | cool | custom</summary>
    public string Preset { get; set; } = "balanced";
    /// <summary>Só no "custom".</summary>
    public int PowerLimitW { get; set; } = 272;
    /// <summary>Só no "custom". 0 = sem teto de clock.</summary>
    public int MaxClockMhz { get; set; } = 1830;
    /// <summary>Aplica só enquanto um jogo é detectado; volta ao normal no desktop.</summary>
    public bool OnlyInGames { get; set; } = true;
}

/// <summary>Bateria de periféricos sem fio (WirelessBattery). Aparece discreta perto do FPS.</summary>
public sealed class BatteryConfig
{
    public bool Enabled { get; set; } = true;
    /// <summary>Chaves (key do --list) dos dispositivos escondidos no widget.</summary>
    public List<string> Hidden { get; set; } = [];
    /// <summary>Abaixo disso o número fica vermelho.</summary>
    public int LowPercent { get; set; } = 15;
}

public sealed class LogConfig
{
    public bool Enabled { get; set; } = true;
    // Fora de Documentos: lá costuma ser pasta do OneDrive, que re-sincronizaria o arquivo a cada segundo.
    public string Folder { get; set; } = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Pitwall", "logs");
    public int IntervalMs { get; set; } = 1000;
    /// <summary>Apaga logs mais velhos que isso (dias). 0 = não apaga por idade.</summary>
    public int KeepDays { get; set; } = 30;
    /// <summary>Teto do total da pasta (MB); apaga os mais antigos primeiro. 0 = sem teto.</summary>
    public int MaxTotalMb { get; set; } = 500;
}

public sealed class GamesConfig
{
    public bool AutoDetect { get; set; } = true;
    public List<string> Include { get; set; } = [];
    public List<string> Ignore { get; set; } =
    [
        "explorer.exe", "chrome.exe", "msedge.exe", "firefox.exe", "opera.exe", "brave.exe",
        "Discord.exe", "Pitwall.exe", "msedgewebview2.exe", "dwm.exe", "ApplicationFrameHost.exe",
        "TextInputHost.exe", "ShellExperienceHost.exe", "StartMenuExperienceHost.exe", "SearchHost.exe",
        "LockApp.exe", "Spotify.exe", "vlc.exe", "mpc-hc64.exe", "Code.exe", "devenv.exe", "Claude.exe",
    ];
    /// <summary>Perfis por exe (chave sem diferenciar maiúsculas).</summary>
    public Dictionary<string, GameProfile> Profiles { get; set; } = [];
    /// <summary>Exes para os quais o usuário recusou "Marcar como jogo?".</summary>
    public List<string> DismissedSuggestions { get; set; } = [];

    public GameProfile? ProfileFor(string? exe) =>
        exe == null ? null : Profiles.FirstOrDefault(p => string.Equals(p.Key, exe, StringComparison.OrdinalIgnoreCase)).Value;
}

public sealed class MetricSetting
{
    public string Id { get; set; } = "";
    public bool Enabled { get; set; }
    public string? Label { get; set; }
    public int Order { get; set; }
    /// <summary>"C" ou "F" para temperaturas.</summary>
    public string? Unit { get; set; }
    public double? Warn { get; set; }
    public double? Crit { get; set; }
    public bool Sparkline { get; set; }
}
