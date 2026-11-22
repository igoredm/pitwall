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

    /// <summary>
    /// O assistente de primeira execução já foi concluído (ou pulado). Instalação nova = false;
    /// configs que já existiam viram true na migração v5, para quem já usa o app não ver o assistente.
    /// </summary>
    public bool FirstRunDone { get; set; }
    /// <summary>
    /// Tutorial das configurações já visto (ou pulado). Instalação nova = false; configs que já existiam viram true
    /// na migração v6. "Rever tutorial" (bandeja ou mensagem replayTutorial) volta para false.
    /// </summary>
    public bool TutorialDone { get; set; }
    /// <summary>
    /// 1.0 (config v7): estado do tour das configurações. Fonte da verdade; <see cref="TutorialDone"/> é só um apelido
    /// mantido igual a <c>Tour.Done</c> para quem ainda lê o campo antigo.
    /// </summary>
    public TourConfig Tour { get; set; } = new();
    /// <summary>
    /// 1.0 (config v7): aparência das configurações (e da barra de título nativa delas): system | light | dark.
    /// <see cref="ThemeMode"/> continua valendo só para o widget.
    /// </summary>
    public string Appearance { get; set; } = "system";
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
    public UpdateConfig Update { get; set; } = new();
    public AlertsConfig Alerts { get; set; } = new();
    public RemoteConfig Remote { get; set; } = new();
    public FeaturesConfig Features { get; set; } = new();
    /// <summary>1.2 (config v8): atalhos globais (RegisterHotKey).</summary>
    public HotkeysConfig Hotkeys { get; set; } = new();
    /// <summary>1.3 (config v9): benchmark por atalho.</summary>
    public BenchmarkConfig Benchmark { get; set; } = new();
    /// <summary>1.3 (config v9): energia e custo por sessão.</summary>
    public EnergyConfig Energy { get; set; } = new();
    public List<MetricSetting> Metrics { get; set; } = [];
}

/// <summary>Tour das configurações: passo atual, concluído e dispensado ("agora não").</summary>
public sealed class TourConfig
{
    public int Step { get; set; }
    public bool Done { get; set; }
    public bool Dismissed { get; set; }
}

/// <summary>Aviso do Windows quando uma métrica fica no vermelho por 5 s ou mais. Desligado por padrão.</summary>
public sealed class AlertsConfig
{
    public bool Enabled { get; set; }
    /// <summary>Toca o som de alerta do Windows junto com o aviso.</summary>
    public bool Sound { get; set; }
    /// <summary>Intervalo mínimo entre avisos da mesma métrica.</summary>
    public int MinIntervalMin { get; set; } = 5;
    /// <summary>Quanto tempo a métrica precisa ficar no vermelho antes do aviso (picos curtos não avisam).</summary>
    public int SustainSec { get; set; } = 10;
}

/// <summary>
/// Recursos que podem ser desligados como uma métrica. Desligado = nada roda (custo ~0): sem buffer, sem arquivo, sem consulta.
/// Os outros interruptores continuam nas seções deles (games.autoDetect, log.enabled, battery.enabled, gpuTuning.enabled,
/// alerts.enabled, remote.enabled, update.autoCheck).
/// </summary>
public sealed class FeaturesConfig
{
    /// <summary>Buffer de 60 s em disco durante o jogo + relatório/balão de crash ao abrir.</summary>
    public bool CrashReport { get; set; } = true;
    /// <summary>"Marcar como jogo?" (olha o processo em foco).</summary>
    public bool GameSuggestions { get; set; } = true;
    /// <summary>Mín/máx da sessão (extremes) no widget e no celular.</summary>
    public bool SessionPeaks { get; set; } = true;
    /// <summary>Motivo do limite de clock (NVML): texts["gpu.perfcap"] e segundos por motivo na sessão.</summary>
    public bool ClockReason { get; set; } = true;
    /// <summary>Ao terminar um jogo, abre as configurações direto no resumo da sessão.</summary>
    public bool OpenSummaryOnGameEnd { get; set; }
    /// <summary>1.2: conta engasgos (frames muito acima da mediana) na sessão.</summary>
    public bool Stutters { get; set; } = true;
}

/// <summary>1.2: atalhos globais. Formato "Ctrl+Alt+Shift+Win+Tecla" (A–Z, 0–9, F1–F24); vazio = desligado.</summary>
public sealed class HotkeysConfig
{
    public bool Enabled { get; set; } = true;
    /// <summary>Mostra/esconde o widget.</summary>
    public string ToggleWidget { get; set; } = "Ctrl+Alt+P";
    /// <summary>Grava um marcador no CSV e na sessão ("travou aqui").</summary>
    public string Marker { get; set; } = "Ctrl+Alt+M";
    /// <summary>1.3: começa um benchmark (ou cancela o que está rodando).</summary>
    public string Benchmark { get; set; } = "Ctrl+Alt+B";
}

/// <summary>1.3: benchmark por atalho.</summary>
public sealed class BenchmarkConfig
{
    /// <summary>Durações aceitas (s); outro valor vira <see cref="DefaultDuration"/>.</summary>
    public static readonly int[] Durations = [30, 60, 120, 300];
    public const int DefaultDuration = 60;
    public int DurationSec { get; set; } = DefaultDuration;

    public static int Snap(int? sec) => sec is { } s && Durations.Contains(s) ? s : DefaultDuration;
}

/// <summary>1.3: estimativa de energia (GPU + CPU) e custo por sessão.</summary>
public sealed class EnergyConfig
{
    /// <summary>Preço do kWh; null = só mostra kWh.</summary>
    public double? Tariff { get; set; }
    public string Currency { get; set; } = "R$";
}

/// <summary>Visualização no celular pela rede local (somente leitura). Desligada por padrão.</summary>
public sealed class RemoteConfig
{
    public bool Enabled { get; set; }
    public int Port { get; set; } = 48124;
    /// <summary>Celulares pareados. Só o hash SHA-256 do token fica salvo; o token em si fica no celular.</summary>
    public List<PairedDevice> PairedDevices { get; set; } = [];
    /// <summary>1.2: endpoint de leitura GET /api/v1/state (Home Assistant), com token. Precisa de Enabled.</summary>
    public bool ApiEnabled { get; set; }
}

public sealed class PairedDevice
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    /// <summary>SHA-256 (hex minúsculo) do token do dispositivo.</summary>
    public string TokenHash { get; set; } = "";
    public DateTime Created { get; set; }
    /// <summary>Última vez que o dispositivo autenticou ou esteve conectado (atualizado no máximo 1x/min). null = nunca.</summary>
    public DateTime? LastSeen { get; set; }
    /// <summary>phone | tv | desktop | integration (1.2, token de API) | unknown — deduzido do user agent ao parear. Pareados antes da 1.0 = unknown.</summary>
    public string Kind { get; set; } = "unknown";
}

/// <summary>Perfil por jogo: aplicado quando o jogo começa e desfeito quando ele termina (nada fica salvo no meio).</summary>
public sealed class GameProfile
{
    /// <summary>off | balanced | cool | custom. null = usa a config geral.</summary>
    public string? TuningPreset { get; set; }
    /// <summary>auto | full | mid | compact | strip | mini. null = usa a config geral.</summary>
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
    /// <summary>auto | full | mid | compact | strip | mini (1.2). Automático = escolhe pelo tamanho da janela.</summary>
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

/// <summary>Bateria de periféricos sem fio (Battery Hub). Aparece discreta perto do FPS.</summary>
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
    /// <summary>Apaga logs mais velhos que isso (dias): 1, 5, 15, 30 ou 90. 0 = para sempre (não apaga por idade).</summary>
    public int KeepDays { get; set; } = 30;

    /// <summary>Valores aceitos em <see cref="KeepDays"/> (0 = para sempre).</summary>
    public static readonly int[] KeepDaysChoices = [1, 5, 15, 30, 90, 0];
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
