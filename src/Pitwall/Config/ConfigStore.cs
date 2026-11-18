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

    /// <summary>
    /// Grava sem disparar <see cref="Changed"/> (sem reenviar a config para as páginas). Só para dados de manutenção
    /// que a página recebe por outra mensagem, como o "visto por último" dos celulares (vai em "devices").
    /// </summary>
    public void UpdateQuiet(Action<AppConfig> mutate)
    {
        lock (_gate)
        {
            mutate(_current);
            Save(_current);
        }
    }

    public void Replace(AppConfig config)
    {
        Sanitize(config);
        config.TutorialDone = config.Tour.Done;
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
        // Nem reabrir o assistente de primeira execução.
        fresh.FirstRunDone = Current.FirstRunDone;
        fresh.Tour = new TourConfig { Step = Current.Tour.Step, Done = Current.Tour.Done, Dismissed = Current.Tour.Dismissed };
        Replace(fresh);
    }

    /// <summary>Versão atual do formato do config.json.</summary>
    public const int CurrentVersion = 7;

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
            // Sem arquivo = instalação nova: já nasce na versão atual (as migrações são para configs antigas)
            // e com FirstRunDone/TutorialDone = false, para o assistente e o tutorial aparecerem.
            config = json != null ? JsonSerializer.Deserialize<AppConfig>(json, Json) ?? new AppConfig() : new AppConfig { Version = CurrentVersion };
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
        if (config.Version < 5)
        {
            // v0.7: assistente de primeira execução. Quem já tinha config não precisa dele.
            config.FirstRunDone = true;
            config.Version = 5;
        }
        if (config.Version < 6)
        {
            // 1.0: tutorial das configurações (quem já usa não precisa) e recursos desligáveis (padrão: tudo ligado,
            // vem do inicializador). A retenção de logs passou a aceitar só 1/5/15/30/90/0 — o Sanitize ajusta.
            config.TutorialDone = true;
            config.Version = 6;
        }
        if (config.Version < 7)
        {
            // 1.0 (rodada 2): o tour ganhou estado próprio (passo/concluído/dispensado), que nasce do tutorialDone; e a
            // aparência das configurações saiu do themeMode (que fica só para o widget) — começa igual a ele.
            config.Tour = new TourConfig { Step = 0, Done = config.TutorialDone, Dismissed = false };
            config.Appearance = Appearances.Contains(config.ThemeMode) ? config.ThemeMode : "system";
            config.Version = 7;
        }
        // tutorialDone é apelido de tour.done
        config.TutorialDone = config.Tour.Done;
    }

    static readonly string[] Appearances = ["system", "light", "dark"];

    /// <summary>
    /// setConfig da página: decide quem manda no tour. Cliente antigo (sem "tour" no JSON, ou que só mexeu no tutorialDone)
    /// → o tour segue o tutorialDone; senão o tour manda e o tutorialDone vira cópia de tour.done.
    /// </summary>
    internal static void SyncTour(AppConfig incoming, AppConfig current, bool tourSent)
    {
        var cur = current.Tour ?? new TourConfig();
        if (!tourSent || incoming.Tour == null)
            incoming.Tour = new TourConfig { Step = cur.Step, Done = cur.Done, Dismissed = cur.Dismissed };
        if (incoming.TutorialDone != current.TutorialDone && incoming.Tour.Done == cur.Done)
        {
            // Só o campo antigo mudou: true = concluído; false = rever do começo (igual ao replayTutorial)
            incoming.Tour = incoming.TutorialDone
                ? new TourConfig { Step = incoming.Tour.Step, Done = true, Dismissed = incoming.Tour.Dismissed }
                : new TourConfig();
        }
        incoming.TutorialDone = incoming.Tour.Done;
    }

    /// <summary>"Rever tutorial" (bandeja ou replayTutorial): tour do começo.</summary>
    public static void ResetTour(AppConfig c)
    {
        c.Tour = new TourConfig { Step = 0, Done = false, Dismissed = false };
        c.TutorialDone = false;
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
        c.Features ??= new();
        c.Tour ??= new();
        c.Tour.Step = Math.Clamp(c.Tour.Step, 0, 1000);
        if (!Appearances.Contains(c.Appearance)) c.Appearance = "system";
        c.Update ??= new();
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

        c.Log.KeepDays = SnapKeepDays(c.Log.KeepDays);
        c.Log.MaxTotalMb = Math.Clamp(c.Log.MaxTotalMb, 0, 1_000_000);
        c.Alerts.MinIntervalMin = Math.Clamp(c.Alerts.MinIntervalMin, 1, 24 * 60);
        if (c.Remote.Port is < 1024 or > 65535 || c.Remote.Port == c.WebSocketPort) c.Remote.Port = 48124;
        c.Remote.PairedDevices.RemoveAll(d => d == null || string.IsNullOrEmpty(d.TokenHash));
        foreach (var d in c.Remote.PairedDevices)
            if (!Server.DeviceKind.IsValid(d.Kind)) d.Kind = Server.DeviceKind.Unknown;

        string[] presets = ["off", "balanced", "cool", "custom"];
        string[] layouts = ["auto", "full", "mid", "compact"];
        foreach (var key in c.Games.Profiles.Where(p => p.Value == null).Select(p => p.Key).ToList()) c.Games.Profiles.Remove(key);
        foreach (var p in c.Games.Profiles.Values)
        {
            if (p.TuningPreset != null && !presets.Contains(p.TuningPreset)) p.TuningPreset = null;
            if (p.Layout != null && !layouts.Contains(p.Layout)) p.Layout = null;
        }
    }

    /// <summary>
    /// Retenção por idade → um dos valores aceitos (1, 5, 15, 30, 90; 0 = para sempre). Valor fora da lista sobe para o
    /// próximo (nunca apaga antes do que o usuário escolheu); acima de 90 vira "para sempre"; negativo vira 0.
    /// </summary>
    internal static int SnapKeepDays(int days)
    {
        if (days <= 0) return 0;
        foreach (var choice in LogConfig.KeepDaysChoices.Where(d => d > 0).Order())
            if (days <= choice) return choice;
        return 0;
    }

    static void Save(AppConfig config)
    {
        Directory.CreateDirectory(Dir);
        var tmp = FilePath + ".tmp";
        File.WriteAllText(tmp, JsonSerializer.Serialize(config, Json));
        File.Move(tmp, FilePath, overwrite: true);
    }
}
