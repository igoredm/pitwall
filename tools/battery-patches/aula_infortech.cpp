// AULA mice on the "AULA Receiver" (Infortech SDK): Kunlun X5 Ultra / MAX / mini, L9, L5 Ultra, SC880 Ultra / MAX,
// SC900 V2 Ultra / Master / Pro, V9 Ultra(+), X9 Ultra, V3 MAX. Receivers 38A6:28F9 and 38A6:2F1A.
//
// Protocol from the official AULA HUB web driver (hub.aulacn.com, bundled "InfortechDevice" SDK), verified on a
// Kunlun X5 Ultra (mouse PID 2F08) through the 38A6:28F9 receiver:
//  * vendor collection FF A8 / 0002, 64-byte reports. Requests go out as output report 0x0B:
//    [0B][cmd][len][args...], zero padded. Replies come back as input report 0x0A: [0A][cmd][len][status][data...],
//    status 0 = OK. Only read commands are used here:
//      D0      IsConnectMouse        data[0] = 1 when the mouse is linked to the receiver
//      A0 00   DevGetMouseConfigExt  data[0..1] mouse VID, data[2..3] mouse PID (LE) -> model name
//      81 00   DevGetInfo            data[13] charging, data[14] battery percent, data[15] full
//  * The receiver also pushes [0A][80][..][04][level][full][charging] on battery changes (not needed for polling).
// Write commands (0x84, 0x86, 0x88...) and the firmware ones (0xC1..0xC3) exist in the SDK and are never sent.
#include "drivers.h"

namespace {

const USHORT kVid = 0x38A6;

const wchar_t* ModelName(USHORT mousePid) {
    switch (mousePid) {
        case 0x28F7: return L"AULA L9";
        case 0x28FF: return L"AULA SC880 Ultra";
        case 0x28E7: return L"AULA SC880 MAX";
        case 0x28E8: return L"AULA X5 MAX";
        case 0x2EF4: return L"AULA SC900 V2 Ultra";
        case 0x2EF6: return L"AULA SC900 V2 Master";
        case 0x2EFE: return L"AULA SC900 V2 Pro";
        case 0x2F08: return L"AULA X5 Ultra";
        case 0x2F10: return L"AULA X5 mini";
        case 0x2F0C: return L"AULA L5 Ultra";
        case 0x2EEE: return L"AULA V9 Ultra+";
        case 0x2EF2: return L"AULA V9 Ultra";
        case 0x2F14: return L"AULA X9 Ultra";
        case 0x2F18: return L"AULA V3 MAX";
        default: return L"AULA wireless mouse";
    }
}

// Sends one read command and returns the reply payload starting at the command byte ([cmd][len][status][data...]).
bool Ask(HidDev& d, std::initializer_list<BYTE> req, std::vector<BYTE>& u) {
    BYTE cmd = *(req.begin() + 1);
    d.Flush();
    if (!d.Write(req)) return false;
    std::vector<BYTE> r;
    ULONGLONG end = GetTickCount64() + 800;
    for (;;) {
        int left = (int)((LONGLONG)end - (LONGLONG)GetTickCount64());
        if (left <= 0) return false;
        int n = d.Read(r, left);
        if (n < 5) continue;
        int o = r[0] == 0x0A ? 1 : 0;  // input report 0x0A
        if (r[o] != cmd) continue;      // also skips 0x80 state pushes
        u.assign(r.begin() + o, r.begin() + n);
        return u.size() > 3 && u[2] == 0;  // status OK
    }
}

}  // namespace

void PollAulaInfortech(PollContext& ctx) {
    for (USHORT pid : { (USHORT)0x28F9, (USHORT)0x2F1A }) {
        if (ctx.IsClaimed(kVid, pid)) continue;
        auto colls = ctx.Find(kVid, pid, [](const HidColl& c) { return c.page() == 0xFFA8 && c.usage() == 0x0002 && c.outLen() >= 4; });
        for (const HidColl* c : colls) {
            HidDev d;
            if (!d.Open(*c)) continue;
            std::vector<BYTE> u;
            DeviceStatus s;
            s.key = L"aula-infortech:" + Hex4(kVid) + L":" + Hex4(pid);
            s.kind = DeviceKind::Mouse;
            s.via = L"2.4 GHz receiver";
            s.graceSec = 1800;
            if (!Ask(d, { 0x0B, 0xD0 }, u)) continue;  // not this protocol
            if (u.size() > 3 && u[3] != 1) {          // receiver answers, mouse off / out of range
                ctx.Claim(kVid, pid);
                break;
            }
            USHORT mousePid = 0;
            if (Ask(d, { 0x0B, 0xA0, 0x00 }, u) && u.size() > 6) mousePid = (USHORT)(u[5] | (u[6] << 8));
            s.name = ModelName(mousePid);
            if (Ask(d, { 0x0B, 0x81, 0x00 }, u) && u.size() > 3 + 15) {
                int level = u[3 + 14];
                if (level <= 100) s.percent = level;
                s.charging = u[3 + 13] != 0 && !u[3 + 15];
            } else {
                s.asleep = true;  // linked but did not answer: keep the last value
            }
            ctx.Add(s, kVid, pid);
            break;
        }
    }
}
