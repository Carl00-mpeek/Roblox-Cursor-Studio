<p align="center">
  <a href="README.md">🇬🇧 English</a> •
  <a href="README.tr.md">🇹🇷 Türkçe</a>
</p>

## ⚠️ Disclaimer

RBX Cursor Studio is an independent, community-made tool — **not affiliated with or endorsed by Roblox Corporation**. It doesn't read Roblox's memory or inject into its code. It simply replaces cursor image files in your local Roblox folder, and (for animated cursors) draws a separate overlay with standard Windows APIs. Roblox doesn't officially support modifying game files, so **use it at your own risk**.

---

# 🎨 RBX Cursor Studio

A lightweight Windows app for customizing Roblox cursors — make them yours, share them with friends, and switch packs in a second.

**Current version: 4.6.0**

![RBX Cursor Studio Screenshot]

---

## 🆕 What's New in 4.6.0

This release is more than a small patch — updates, packs, and animated cursors got a real polish pass.

### 🔄 Smarter updates
- Installers are clearly named **Setup**
- After an update, old download files are **cleaned up automatically** — no leftover clutter
- Hit **Check Now** → if an update exists, **Download & Install** shows up right away
- The update section sits **above History** in Settings so you never miss it

### 🎬 Animated cursors — no longer Beta
- The **Beta** label is gone; the feature is ready for everyday use
- Fixed the bug where turning animation **off** could make the cursor vanish
- Toggle on/off is more reliable; your cursor stays visible in Roblox

### 📦 Packs — sharing, upgraded
- **Double-click a `.rbxcursor` file** and choose: **Save to Packs** or **Apply Only**
- **Import multiple** packs at once · **Bulk export** selected packs to a folder
- Drag & drop supports **multiple files**
- Stronger safety checks: only real **PNG** cursors and valid **`.ani`** animations are accepted

### 🎨 Look & feel
- Update controls are easier to find in Settings
- Packs screen is more practical (import, bulk export, multi drag-and-drop)
- Animation page feels finished — less “experimental”, more polished product
- Cursor cards still get that soft **glow** when you’ve assigned a custom image
- In-Context Preview stays cozy: Play button, chat box, Shift Lock — test cursors at true size

---

## ✨ Features

### 🖱️ Cursor customization
Customize every Roblox cursor type (arrow, far arrow, I-beam, mouse-locked…) and apply instantly. Images are auto-fitted and centered on a 64×64 canvas, with smoothing off so pixel edges stay crisp.

### ✨ Animated cursors (.ANI)
> Automatic state detection uses heuristics and may occasionally misjudge in some games. [Open an issue](../../issues) if something feels off.

- Assign a `.ani` per state — **Normal, Click, Text, Shift Lock**
- Drawn by a small native helper: click-through, always-on-top, real per-pixel alpha
- Size, speed, and FPS (up to 240), auto-center or manual hotspot
- Adjustable mouse-follow interval · live status badges when a state is active
- **Preview** any animation on your desktop for 6 seconds — even without Roblox
- Toggle everything with a hotkey (`Ctrl+Alt+0` by default)

> Restart Roblox after assigning your first animation so it picks up the updated cursor files.

### 🎯 Built-in cursor editor
Auto-Fit + Center, Center Only, Reset Size · zoom 0.4x–3x · drag to position · Colorize with a hue slider · one-click Color Variations. Built for quick experiments without leaving the app.

### 📦 Cursor packs
Create and manage as many packs as you like. Export as `.rbxcursor` / `.zip`, import via button or drag-and-drop (one file or many). **Quick Pack Switching** (`Ctrl+Alt+1/2/3`) works even while Roblox is running.

### 🕓 History
Cursors you’ve saved stick around in History — reapply anytime with one click.

### 🖼️ In-Context Preview
Try cursors at true size on a mock Roblox-style scene: HUD, Play button, chat box, and Shift Lock included.

### 🔄 Roblox update handling
Detects the newest Roblox client folder. With Auto-Reinstall on, your saved cursors come back after Roblox updates. Back up and restore originals in one click.

### 🌈 Bulk color changer
Recolor every active cursor with a single hue — size and position stay put.

### 🎬 Personalization & ⚙️ Settings
Swap the app background, switch English / Turkish instantly, launch on Windows startup, and see the detected Roblox version — all from Settings.

### 💻 Platform
Portable exe or NSIS **Setup** installer. Built on Electron; animated cursors use a tiny native helper (`cursor_helper.exe`) that only starts when needed. Source is public under a noncommercial license; releases are scanned on VirusTotal.

---

## 📥 Download

- **Setup** — download the installer and go  
- **Portable** — extract the ZIP and run `RBX Cursor Studio.exe` — no install needed  

> Always grab the latest build from the [Releases](../../releases) page — only download from this repository.

### ❓ Windows says it “protected your PC”
The app isn’t code-signed yet, so SmartScreen may warn until enough people have run it — that alone doesn’t mean malware. Click **More info → Run anyway**. Full source and VirusTotal links are below.

### ❓ Animated cursor doesn’t show up
- Exclusive fullscreen blocks overlays (same as Discord/Steam) — use windowed or borderless  
- Restart Roblox after your first animation assignment  
- Use **Preview** on the Animated tab to confirm rendering works  
- Make sure animation isn’t toggled off (`Ctrl+Alt+0` by default)

---

## 🔧 Building from source

**Windows users:** ready-made scripts are enough — no terminal required (`install.bat` / `start.bat` / `exe_maker.bat`). Steps below are for manual setup or non-Windows systems.

**Requirements:** Node.js 18+ and npm. Animated cursors need a C++ compiler (MinGW `g++` or MSVC `cl.exe`). If missing, `install.bat` can download MinGW-w64 once (~260 MB). Without a compiler the app still runs; only animated cursors are disabled. Official Setup/Portable builds already include the helper.

```bash
git clone https://github.com/Carl00-mpeek/Roblox-Cursor-Studio.git
cd Roblox-Cursor-Studio
npm install
npm start        # development
npm run dist     # installer + portable exe
```

---

## 🛡️ VirusTotal

Latest release scanned on VirusTotal:

- [🔍 Source](https://www.virustotal.com/gui/file/d6164ae95c241574d51e8ae521035cb12dbc00a99e30169d805f5ea60930262f?nocache=1)
- [🔍 Setup](https://www.virustotal.com/gui/file/931ff40b0d11505572b12e221d5063987da2312b91bbf7bde741a47b1fd42131?nocache=1)
- [🔍 Portable](https://virustotal.com/gui/file/0f88aa46f2d5400cc87f80cb897c2c1133e76265f2dbbc20ed9f7e9909974057?nocache=1)

---

## ☕ Support the project

RBX Cursor Studio is free. Your support helps keep updates and new features coming.

[☕ Buy me a coffee](https://buymeacoffee.com/rbxcursor)

---

## 📄 License

Licensed under the [PolyForm Noncommercial License 1.0.0](LICENSE).  
Required Notice: Copyright (c) 2026 Demhat Dayan

Free for personal, educational, and noncommercial use. **Commercial use, resale, or redistribution for profit is not permitted** without written permission.

---

💬 Liked it? A star helps a lot. Bugs or ideas → open an issue.  
Have fun, and make those cursors yours! 🖱️✨
