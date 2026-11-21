// Pitwall build of BatteryHub: no self-updater.
//
// Pitwall runs BatteryHub elevated ("BatteryHub.exe --json" once a minute) and ships it inside its own installer,
// so BatteryHub must never download or launch anything. build-battery.ps1 leaves src\update_*.cpp out of the
// build and compiles this file instead: the same entry points main.cpp calls, all inert. Updates of BatteryHub
// arrive with Pitwall releases, after the new upstream commit is reviewed.
//
// GPL-3.0, like the rest of tools/battery-patches.
#include "update_win.h"
#include "update_apply.h"

namespace updates {
void Initialize() {}
void Tick(HWND) {}
void Shutdown() {}
std::wstring MenuLabel() { return L"Updates come with Pitwall"; }
bool Busy() { return false; }
bool AutomaticEnabled() { return false; }
bool Supported() { return false; }
void ToggleAutomatic() {}
void Activate(HWND) {}
int RunApplyMode(int, wchar_t**) { return -1; }
}
