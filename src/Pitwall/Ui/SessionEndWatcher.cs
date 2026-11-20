namespace Pitwall.Ui;

/// <summary>
/// Janela oculta (de nível superior) que recebe WM_QUERYENDSESSION/WM_ENDSESSION: logoff ou desligamento pelo Windows
/// conta como saída normal; WM_ENDSESSION com wParam = 0 = o Windows cancelou.
/// </summary>
sealed class SessionEndWatcher : NativeWindow, IDisposable
{
    const int WM_QUERYENDSESSION = 0x0011, WM_ENDSESSION = 0x0016;
    readonly Action _ending, _cancelled;

    public SessionEndWatcher(Action ending, Action cancelled)
    {
        _ending = ending;
        _cancelled = cancelled;
        CreateHandle(new CreateParams { Caption = "Pitwall.SessionEnd" });
    }

    protected override void WndProc(ref Message m)
    {
        try
        {
            if (m.Msg == WM_QUERYENDSESSION) _ending();
            else if (m.Msg == WM_ENDSESSION) { if (m.WParam != 0) _ending(); else _cancelled(); }
        }
        catch { }
        base.WndProc(ref m);
    }

    public void Dispose() => DestroyHandle();
}
