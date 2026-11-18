using System.Runtime.InteropServices;
using System.Security.Cryptography.X509Certificates;

namespace Pitwall.Update;

/// <summary>
/// Verificação Authenticode pelo próprio Windows (WinVerifyTrust): assinatura íntegra, cadeia confiável até uma raiz
/// do sistema e revogação checada em toda a cadeia. Devolve o "Subject" do certificado de quem assinou.
/// </summary>
internal static partial class Authenticode
{
    public enum Result { Valid, Unsigned, Invalid }

    public readonly record struct Signature(Result Result, string? Subject, string Detail);

    /// <param name="handle">Handle já aberto do arquivo (opcional): o Windows verifica exatamente esses bytes.</param>
    public static Signature Verify(string path, SafeHandle? handle = null)
    {
        var hr = WinVerify(path, handle);
        if (hr == TRUST_E_NOSIGNATURE || hr == TRUST_E_SUBJECT_FORM_UNKNOWN || hr == TRUST_E_PROVIDER_UNKNOWN)
            return new(Result.Unsigned, null, "sem assinatura");
        var subject = SignerSubject(path);
        if (hr != 0) return new(Result.Invalid, subject, $"WinVerifyTrust 0x{hr:X8}");
        return string.IsNullOrEmpty(subject) ? new(Result.Invalid, null, "certificado sem subject") : new(Result.Valid, subject, "ok");
    }

    /// <summary>Só extrai o certificado de quem assinou; a validação de verdade é o WinVerifyTrust.</summary>
    static string? SignerSubject(string path)
    {
        try
        {
#pragma warning disable SYSLIB0057
            using var cert = new X509Certificate2(X509Certificate.CreateFromSignedFile(path));
#pragma warning restore SYSLIB0057
            return cert.Subject;
        }
        catch
        {
            return null;
        }
    }

    static int WinVerify(string path, SafeHandle? handle)
    {
        var added = false;
        handle?.DangerousAddRef(ref added);
        var pathPtr = Marshal.StringToHGlobalUni(path);
        var filePtr = Marshal.AllocHGlobal(Marshal.SizeOf<WINTRUST_FILE_INFO>());
        try
        {
            var fileInfo = new WINTRUST_FILE_INFO
            {
                cbStruct = (uint)Marshal.SizeOf<WINTRUST_FILE_INFO>(),
                pcwszFilePath = pathPtr,
                hFile = added ? handle!.DangerousGetHandle() : IntPtr.Zero,
            };
            Marshal.StructureToPtr(fileInfo, filePtr, false);
            var data = new WINTRUST_DATA
            {
                cbStruct = (uint)Marshal.SizeOf<WINTRUST_DATA>(),
                dwUIChoice = WTD_UI_NONE,
                fdwRevocationChecks = WTD_REVOKE_WHOLECHAIN,
                dwUnionChoice = WTD_CHOICE_FILE,
                pFile = filePtr,
                dwStateAction = WTD_STATEACTION_VERIFY,
                dwProvFlags = WTD_REVOCATION_CHECK_CHAIN_EXCLUDE_ROOT | WTD_DISABLE_MD2_MD4,
            };
            var action = WINTRUST_ACTION_GENERIC_VERIFY_V2;
            var hr = WinVerifyTrust(INVALID_HANDLE_VALUE, ref action, ref data);
            data.dwStateAction = WTD_STATEACTION_CLOSE;
            WinVerifyTrust(INVALID_HANDLE_VALUE, ref action, ref data);
            return hr;
        }
        finally
        {
            Marshal.FreeHGlobal(filePtr);
            Marshal.FreeHGlobal(pathPtr);
            if (added) handle!.DangerousRelease();
        }
    }

    static readonly Guid WINTRUST_ACTION_GENERIC_VERIFY_V2 = new("00AAC56B-CD44-11d0-8CC2-00C04FC295EE");
    static readonly IntPtr INVALID_HANDLE_VALUE = new(-1); // sem janela: nunca mostra UI
    const uint WTD_UI_NONE = 2;
    const uint WTD_REVOKE_WHOLECHAIN = 1;
    const uint WTD_CHOICE_FILE = 1;
    const uint WTD_STATEACTION_VERIFY = 1;
    const uint WTD_STATEACTION_CLOSE = 2;
    const uint WTD_REVOCATION_CHECK_CHAIN_EXCLUDE_ROOT = 0x80;
    const uint WTD_DISABLE_MD2_MD4 = 0x2000;
    const int TRUST_E_NOSIGNATURE = unchecked((int)0x800B0100);
    const int TRUST_E_SUBJECT_FORM_UNKNOWN = unchecked((int)0x800B0003);
    const int TRUST_E_PROVIDER_UNKNOWN = unchecked((int)0x800B0001);

    [StructLayout(LayoutKind.Sequential)]
    struct WINTRUST_FILE_INFO
    {
        public uint cbStruct;
        public IntPtr pcwszFilePath;
        public IntPtr hFile;
        public IntPtr pgKnownSubject;
    }

    [StructLayout(LayoutKind.Sequential)]
    struct WINTRUST_DATA
    {
        public uint cbStruct;
        public IntPtr pPolicyCallbackData;
        public IntPtr pSIPClientData;
        public uint dwUIChoice;
        public uint fdwRevocationChecks;
        public uint dwUnionChoice;
        public IntPtr pFile;
        public uint dwStateAction;
        public IntPtr hWVTStateData;
        public IntPtr pwszURLReference;
        public uint dwProvFlags;
        public uint dwUIContext;
        public IntPtr pSignatureSettings;
    }

    [LibraryImport("wintrust.dll")]
    private static partial int WinVerifyTrust(IntPtr hwnd, ref Guid pgActionID, ref WINTRUST_DATA pWVTData);
}
