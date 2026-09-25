<p align="center">
  <a href="README.md">🇬🇧 English</a> •
  <a href="README.tr.md">🇹🇷 Türkçe</a>
</p>

## ⚠️ Disclaimer

RBX Cursor Studio is an independent, community-made tool, **not affiliated with or endorsed by Roblox Corporation**. It doesn't read Roblox's memory or inject into its code — it replaces cursor image files in your local Roblox folder, and (for the Animated Cursor feature) draws a separate overlay window using standard Windows APIs. Roblox doesn't officially support modifying game files, so **use it at your own risk**.

# 🎨 RBX Cursor Studio

A lightweight Windows tool for customizing Roblox cursors.

**Current version: 4.5.5**

## 🎬 Demo

[![RBX Cursor Studio Live Preview](https://img.youtube.com/vi/kKYbosdVFig/0.jpg)](https://www.youtube.com/watch?v=kKYbosdVFig)

## 🆕 What's New in 4.5.5

This update makes the app more stable, secure, and capable while keeping the overall experience familiar:

* 📜 Fixed the license/copyright text shown in the app so it no longer contradicts itself.
* ⚡ Fixed short freezes that could happen while the app checked Roblox's status — smoother overall experience.
* 🔒 Added extra safety checks around imported packs and game-matching, protecting against bad or malicious input.
* 🛡️ Restoring default cursors is now safer: if anything goes wrong, nothing is left half-done.
* ⌨️ Quick Switch shortcuts now properly confirm they registered instead of silently failing.
* 🧹 Cleaned up unused files and code, and the error log file no longer grows without limit.
* 🛠️ Fixed an incorrect message in the installer-building scripts.

### 🧪 BETA — 1024×1024 High-Resolution Support

New **high-resolution support** allows cursor packs to be used at resolutions of up to **1024×1024 pixels**.

> ⚠️ **This feature is currently in Beta.** Some older or incompatible cursor packs may produce unexpected results.

This update mainly focuses on improving reliability and security. The new high-resolution feature is currently available as a **Beta feature**.

## ✨ Features

### 🖱️ Cursor Customization
Customize every Roblox cursor type (arrow, far arrow, I-beam, mouse-locked...) and apply your selection instantly. Cursors are auto-fitted and centered on a 64×64 canvas, with smoothing off to keep pixel edges crisp.

### ✨ Animated Cursors (.ANI)
> Automatic state detection relies on heuristics and may occasionally misjudge in some games. [Open an issue](../../issues) if you hit a problem.

- Assign a `.ani` file per state — **Normal, Click, Text, Shift Lock**
- Drawn by a native helper as a click-through, always-on-top overlay with true per-pixel alpha
- Per-state size, speed and FPS controls (up to 240 FPS), auto-center or a manual hotspot
- Adjustable mouse-follow interval; automatic state switching with a live status badge
- **Preview** any animation on your desktop for 6 seconds, even without Roblox running
- Toggle the whole feature on/off with a hotkey (`Ctrl+Alt+0` by default)

> Restart Roblox after assigning your first animation so it picks up the updated cursor files.

### 🎯 Built-in Cursor Editor
Auto-Fit + Center, Center Only, and Reset Size shortcuts; a manual zoom slider (0.4x–3x); drag-and-drop positioning; Colorize with a hue slider; and one-click Color Variations.

### 📦 Cursor Packs
Create, save and manage as many packs as you like. Export as `.rbxcursor` / `.zip` to share, or import one via drag-and-drop. **Quick Pack Switching** jumps between saved packs with `Ctrl+Alt+1/2/3`, even while Roblox is running.

### 🕹️ Automatic Pack by Game — 🧪 Experimental, opt-in (off by default)
Map a Roblox game to one of your packs, and the app switches to it automatically when you open that game. This works by **reading Roblox's own local log files** (`%LOCALAPPDATA%\Roblox\logs`), **read-only** — nothing else. The app never reads Roblox's memory, never injects into its process, and makes no network requests for this feature. If you ever pick a pack yourself (menu, hotkey, or tray), automatic switching stays out of the way for the rest of that session.

### 🕓 History
Every cursor you've selected is saved in a History tab you can reapply anytime.

### 🖼️ In-Context Preview
Test your cursors at true size on a mock Roblox screen — HUD, Play button, chat box, and a Shift Lock toggle included.

### 🔄 Automatic Update Handling
Detects the newest Roblox client folder automatically. With Auto-Reinstall on, your saved cursors are reapplied every time Roblox updates. Back up and restore your original cursors with one click.

### 🌈 Bulk Color Changer
Recolor every currently active cursor with a single hue, without touching size or position.

### 🎬 Personalization & ⚙️ Settings
Swap the app's background image, switch between English and Turkish instantly, launch on Windows startup, and check the detected Roblox version — all from Settings.

### 🔔 Updates
On launch it sends **one** version query to GitHub's public "latest release" endpoint (no identifying/account data); if a newer version exists it tells you in Settings and on the version tag at the top left.
When an update is available, the app opens the [Releases](../../releases) page so you can download the latest Setup or Portable build yourself.
The launch check can be turned off in Settings > Updates.

### 💻 Platform & Distribution
Available as a portable executable or an NSIS installer. Built on Electron; animated cursors run in a small native helper (`cursor_helper.exe`) that only starts when needed. Source is public under a noncommercial license, with releases scanned on VirusTotal.

## 📥 Download

**Setup** — download the installer.
**Portable** — download and extract the ZIP, then run `RBX Cursor Studio.exe` inside — no installation needed.

> Get the latest version from the [Releases](../../releases) page — only download from this repository.

### ❓ Windows shows a "protected your PC" warning
The app isn't code-signed yet, so SmartScreen may warn until enough people have downloaded it — this alone isn't a sign of malware. Click **More info → Run anyway**. Full source and VirusTotal scans are linked below.

### ❓ The animated cursor doesn't show up
- Exclusive fullscreen blocks all overlays (same as Discord/Steam) — switch Roblox to windowed or borderless.
- Restart Roblox after assigning your first animation.
- Try **Preview** in the Animated tab to confirm rendering works.
- Check the animation hasn't been turned off via its hotkey (`Ctrl+Alt+0` by default).

## 🔧 Building from Source

**Windows users: the ready-made scripts are enough — no terminal needed** (`install.bat` / `start.bat` / `exe_maker.bat`). The steps below are for manual setup or non-Windows systems.

Requirements: Node.js 18+ and npm. Animated cursors additionally need a C++ compiler (MinGW `g++` or MSVC `cl.exe`) to build the native helper — if missing, `install.bat` downloads MinGW-w64 automatically (~260 MB, once). Without a compiler the app still works; only animated cursors are disabled. The Setup and Portable downloads already include the compiled helper, so this only matters when building from source.

```bash
git clone https://github.com/Carl00-mpeek/Roblox-Cursor-Studio.git
cd Roblox-Cursor-Studio
npm install
npm start        # run in development
npm run dist     # build the installer and portable exe
```

## 🛡️ VirusTotal

The latest release has been scanned with VirusTotal:
> **About antivirus warnings:** Some engines (especially heuristic ones like ESET) may flag the Setup build as suspicious. This is a **false positive**. The app does not inject into Roblox, does not read process memory, and does not download or run hidden executables — updates simply open the GitHub Releases page. Full source is public; you can build it yourself. If your antivirus quarantines the file, add an exclusion or use the Portable build.


- [🔍 Source](https://www.virustotal.com/gui/file/18de35dfb09f294ccacd16675df801a962db85983a5aa07a1f9fde2e8dbd9807?nocache=1)
- [🔍 Setup](https://www.virustotal.com/gui/file/1ce2f2fb6961dc0990ace7980c012f69425d5c6be598801760cb8ed79ff75552?nocache=1)
- [🔍 Portable](https://www.virustotal.com/gui/file/d4ef7e022d26cbb8ed8044d3bd458b4cb40c52043b7580c226bfd8de9a2981e3?nocache=1)

## ☕ Support the Project

RBX Cursor Studio is free — your support keeps updates and new features coming.

[☕ Buy me a coffee](https://buymeacoffee.com/rbxcursor)

## 📄 License

Licensed under the [PolyForm Noncommercial License 1.0.0](LICENSE).
Required Notice: Copyright (c) 2026 Demhat Dayan

Free for personal, educational, and noncommercial use. **Commercial use, resale, or redistribution for profit is not permitted** without written permission.
