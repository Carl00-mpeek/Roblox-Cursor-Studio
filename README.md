<p align="center">
  <a href="README.md">🇬🇧 English</a> •
  <a href="README.tr.md">🇹🇷 Türkçe</a>
</p>

## ⚠️ Disclaimer

RBX Cursor Studio is an independent, community-made tool, **not affiliated with or endorsed by Roblox Corporation**. It doesn't read Roblox's memory or inject into its code — it replaces cursor image files in your local Roblox folder, and (for the Animated Cursor feature) draws a separate overlay window using standard Windows APIs. Roblox doesn't officially support modifying game files, so **use it at your own risk**.

# 🎨 RBX Cursor Studio

A lightweight Windows tool for customizing Roblox cursors.

<p align="center">
  <a href="https://www.youtube.com/watch?v=kKYbosdVFig" target="_blank">
    <img src="https://img.youtube.com/vi/kKYbosdVFig/maxresdefault.jpg" alt="RBX Cursor Studio Demo" width="800">
  </a>
</p>

<p align="center">
  <a href="https://www.youtube.com/watch?v=kKYbosdVFig" target="_blank">
    ▶️ <strong>Watch Demo Video</strong>
  </a>
</p>

**Current version: 4.0.0**

## 🆕 What's New in 4.0.0

- 🎨 **Brand-new design** — the whole interface has moved to a completely new look and layout
- ✨ A soft glow effect now highlights any cursor card once you've assigned a custom image to it
- 🖼️ Small polish pass on the In-Context Preview scene (Play button, chat box, Shift Lock)

## ✨ Features

### 🖱️ Cursor Customization
Customize every Roblox cursor type (arrow, far arrow, I-beam, mouse-locked...) and apply your selection instantly. Cursors are auto-fitted and centered on a 64×64 canvas, with smoothing off to keep pixel edges crisp.

### ✨ Animated Cursors (.ANI) — 🧪 Beta
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

- [🔍 Source](https://www.virustotal.com/gui/file/d6164ae95c241574d51e8ae521035cb12dbc00a99e30169d805f5ea60930262f?nocache=1)
- [🔍 Setup](https://www.virustotal.com/gui/file/931ff40b0d11505572b12e221d5063987da2312b91bbf7bde741a47b1fd42131?nocache=1)
- [🔍 Portable](https://virustotal.com/gui/file/0f88aa46f2d5400cc87f80cb897c2c1133e76265f2dbbc20ed9f7e9909974057?nocache=1)

## ☕ Support the Project

RBX Cursor Studio is free — your support keeps updates and new features coming.

[☕ Buy me a coffee](https://buymeacoffee.com/rbxcursor)

## 📄 License

Licensed under the [PolyForm Noncommercial License 1.0.0](LICENSE).
Required Notice: Copyright (c) 2026 Demhat Dayan

Free for personal, educational, and noncommercial use. **Commercial use, resale, or redistribution for profit is not permitted** without written permission.
