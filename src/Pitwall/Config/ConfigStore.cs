using System.Text.Json;
using System.Text.Json.Serialization;
using Pitwall.Metrics;

namespace Pitwall.Config;

public sealed class ConfigStore
{
    public static readonly string Dir = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "Pitwall");

    static readonly string FilePath = Path.Combine(Dir, "config.json");

    public static readonly JsonSerializerOptions Json = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = true,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    readonly Lock _gate = new();
    AppConfig _current;

    public event Action<AppConfig>? Changed;

    public ConfigStore()
    {
        _current = Load();
    }

    public AppConfig Current { get { lock (_gate) return _current; } }

    public void Update(Action<AppConfig> mutate)
    {
        AppConfig snapshot;
        lock (_gate)
        {
            mutate(_current);
            snapshot = _current;
            Save(snapshot);
        }
        Changed?.Invoke(snapshot);
    }

    public void Replace(AppConfig config)
    {
        Sanitize(config);
        MetricCatalog.Normalize(config);
        lock (_gate)
        {
            _current = config;
            Save(config);
        }
        Changed?.Invoke(config);
    }

    public void RestoreDefaults()
    {
        var fresh = new AppConfig { Version = CurrentVersion };
        // Mantém a posição do widget: restaurar padrão não deve jogar a janela para outro monitor.
        fresh.Widget = Current.Widget;
        Replace(fresh);
    }

    /// <summary>Versão atual do formato do config.json.</summary>
    public const int CurrentVersion = 4;

    static AppConfig Load()
    {
        string? json = null;
        try
        {
            if (File.Exists(FilePath)) json = File.ReadAllText(FilePath);
        }
        catch { }
        return Parse(json);
    }

    /// <summary>JSON do config.json → config migrada e normalizada. JSON ausente ou inválido = padrão de fábrica.</summary>
    internal static AppConfig Parse(string? json)
    {
        AppConfig config;
        try
        {
            config = json != null ? JsonSerializer.Deserialize<AppConfig>(json, Json) ?? new AppConfig() : new AppConfig();
        }
        catch
        {
            config = new AppConfig();
        }
        Migrate(config);
        MetricCatalog.Normalize(config);
        return config;
    }

    internal static void Migrate(AppConfig config)
    {
        Sanitize(config);
        if (config.Version < 2)
        {
            // v0.1.0 salvava o azul do Lumen como cor fixa; agora vazio = "padrão do tema".
            if (config.Accent.Equals("#4C8DFF", StringComparison.OrdinalIgnoreCase)) config.Accent = "";
            config.Version = 2;
        }
        if (config.Version < 3)
        {
            // v0.3: "compacto" antigo virou "médio"; a RAM mostra GB usados/total por padrão
            if (config.Widget.Layout == "compact") config.Widget.Layout = "mid";
            var used = config.Metrics.FirstOrDefault(m => m.Id == "ram.used");
            if (used != null) used.Enabled = true;
            config.Version = 3;
        }
        if (config.Version < 4)
        {
            // v0.7: alertas, retenção de logs, perfis por jogo, celular na rede local. Os padrões vêm dos
            // inicializadores; aqui só garante que nada ficou null (JSON antigo ou editado à mão).
            config.Version = 4;
        }
    }

    /// <summary>Seções nunca null e valores dentro da faixa (vale para o arquivo e para o setConfig da tela).</summary>
    internal static void Sanitize(AppConfig c)
    {
        c.Widget ??= new();
        c.GpuTuning ??= new();
        c.Battery ??= new();
        c.Log ??= new();
        c.Games ??= new();
        c.Alerts ??= new();
        c.Remote ??= new();
        c.Metrics ??= [];
        c.Metrics.RemoveAll(m => m == null || string.IsNullOrEmpty(m.Id));
        c.GroupLabels ??= [];
        c.Accent ??= "";
        c.Games.Include ??= [];
        c.Games.Ignore ??= [];
        c.Games.Profiles ??= [];
        c.Games.DismissedSuggestions ??= [];
        c.Remote.PairedDevices ??= [];
        c.Battery.Hidden ??= [];

        c.Log.KeepDays = Math.Clamp(c.Log.KeepDays, 0, 3650);
        c.Log.MaxTotalMb = Math.Clamp(c.Log.MaxTotalMb, 0, 1_000_000);
        c.Alerts.MinIntervalMin = Math.Clamp(c.Alerts.MinIntervalMin, 1, 24 * 60);
        if (c.Remote.Port is < 1024 or > 65535 || c.Remote.Port == c.WebSocketPort) c.Remote.Port = 48124;
        c.Remote.PairedDevices.RemoveAll(d => d == null || string.IsNullOrEmpty(d.TokenHash));

        string[] presets = ["off", "balanced", "cool", "custom"];
        string[] layouts = ["auto", "full", "mid", "compact"];
        foreach (var key in c.Games.Profiles.Where(p => p.Value == null).Select(p => p.Key).ToList()) c.Games.Profiles.Remove(key);
        foreach (var p in c.Games.Profiles.Values)
        {
            if (p.TuningPreset != null && !presets.Contains(p.TuningPreset)) p.TuningPreset = null;
            if (p.Layout != null && !layouts.Contains(p.Layout)) p.Layout = null;
        }
    }

    static void Save(AppConfig config)
    {
        Directory.CreateDirectory(Dir);
        var tmp = FilePath + ".tmp";
        File.WriteAllText(tmp, JsonSerializer.Serialize(config, Json));
        File.Move(tmp, FilePath, overwrite: true);
    }
}
