<p align="center">
  <a href="README.md">🇬🇧 English</a> •
  <a href="README.tr.md">🇹🇷 Türkçe</a>
</p>

## ⚠️ Disclaimer

RBX Cursor Studio is an independent, community-made tool — **not affiliated with or endorsed by Roblox Corporation**. It doesn't read Roblox's memory or inject into its code. It simply replaces cursor image files in your local Roblox folder, and (for animated cursors) draws a separate overlay with standard Windows APIs. Roblox doesn't officially support modifying game files, so **use it at your own risk**.

---

# 🎨 RBX Cursor Studio

A lightweight Windows app for customizing Roblox cursors — make them yours, share them with friends, and switch packs in a second.

**Current version: 5.0.0**

## 🎬 Demo video

<!-- 👇 Replace YOUR_VIDEO_ID with your video's ID (or paste the full link) -->
[▶️ Watch the demo video](https://www.youtube.com/watch?v=YOUR_VIDEO_ID)

---

## 🆕 What's New in 5.0.0

### 🖥️ Window
- **Close to tray** — new toggle in **Settings › General**: the ✕ button minimizes the app to the system tray instead of quitting. Shortcuts, the pack switcher and other automation keep running; click the tray icon to reopen, or use *Quit* in its menu.

### 🎨 Themes
- **Color themes** — pick the app's accent color from **Settings › General**: blue, purple, red, pink or yellow. The choice is remembered.

### 📦 Packs
- **Favorites, tags and search** — star your best packs (they float to the top), add tags, filter by name or tag
- **Share** button — exports the pack and opens a pre-filled GitHub Discussions post

### 🤖 Automation & Effects (new Settings tab)
- **Apply last pack when Roblox starts**
- **Timed / random pack switcher** — every N minutes, random or in order, optionally limited to chosen packs
- **Cursor trail** *(beta)* — effects behind your cursor: classic, stars, sparkles, smoke, fire, hearts, rainbow (color + length)
- **Click sound** *(beta)* — short sound on every left click while Roblox is focused; needs the native helper rebuilt (`native/build.bat`)
- **Discord Rich Presence** — shows “RBX Cursor Studio” on your Discord profile automatically while Discord is open (turn it off in Discord › Settings › Activity Privacy); needs `npm install` (adds `discord-rpc`)
- **Release notes viewer** and **settings backup / restore** (one JSON file)

### 🎯 Editor
- **Outline & shadow** tool, plus a one-click **accessibility preset** (bold, auto-contrast outline)

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
Swap the app background, pick a color theme (blue, purple, red, pink, yellow), switch English / Turkish instantly, launch on Windows startup, minimize to the tray on close, and see the detected Roblox version — all from Settings.

### 💻 Platform
Portable exe or NSIS **Setup** installer. Built on Electron; animated cursors use a tiny native helper (`cursor_helper.exe`) that only starts when needed. Source is public under a noncommercial license.

---

## 📥 Download

- **Setup** — download the installer and go  
- **Portable** — download the portable exe and run it — no install needed  

> Always grab the latest build from the [Releases](../../releases) page — only download from this repository.

### ❓ Windows says it “protected your PC”
The app isn’t code-signed yet, so SmartScreen may warn until enough people have run it — that alone doesn’t mean malware. Click **More info → Run anyway**. The full source code is public in this repository.

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

### ✍️ Code signing (optional)
The app isn't signed yet. Once you own a code-signing certificate, electron-builder signs automatically — no config change needed. Set these before `npm run dist`:

```bat
set CSC_LINK=C:\path\to\certificate.pfx
set CSC_KEY_PASSWORD=your-password
```

In GitHub Actions store them as repository secrets and pass them as `CSC_LINK` / `CSC_KEY_PASSWORD` env vars in the build step.

## ☕ Support the project

RBX Cursor Studio is free. Your support helps keep updates and new features coming.

[☕ Buy me a coffee](https://buymeacoffee.com/rbxcursor)

---

## 📄 License

Licensed under the [PolyForm Noncommercial License 1.0.0](LICENSE.md).  
Required Notice: Copyright (c) 2026 Demhat Dayan

Free for personal, educational, and noncommercial use. **Commercial use, resale, or redistribution for profit is not permitted** without written permission.

---

💬 Liked it? A star helps a lot. Bugs or ideas → open an issue.  
Have fun, and make those cursors yours! 🖱️✨
