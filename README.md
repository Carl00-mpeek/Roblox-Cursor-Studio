<p align="center">
  <a href="README.md">🇬🇧 English</a> •
  <a href="README.tr.md">🇹🇷 Türkçe</a>
</p>

## ⚠️ Disclaimer

RBX Cursor Studio is an independent, community-made tool and is **not affiliated with, endorsed by, or associated with Roblox Corporation** in any way. "Roblox" is a trademark of Roblox Corporation.

This tool does not read Roblox's memory, hook into it, or inject into the Roblox game client's code or executables. It replaces cursor image files inside your local Roblox folder and, if you use the Animated Cursor feature, draws a separate overlay window on your desktop using standard Windows APIs. Roblox does not officially support modifying game files, so **use it at your own risk**.

# 🎨 RBX Cursor Studio

A lightweight Windows tool for customizing Roblox cursors.

**Current version: 3.3.5**

![RBX Cursor Studio Screenshot](assets/screenshot.en.png)
*Shown with a custom background — backgrounds are fully customizable*

## 🆕 What's New in 3.3.5

- ✨ **Animated Cursors (.ANI) — Beta** — assign an animated cursor to Normal, Click, Text and Shift Lock states, drawn by a native Windows overlay with smooth per-pixel transparency
- ⌨️ **Animation On/Off Hotkey** — hide or bring back the animated cursor instantly with `Ctrl+Alt+0` (customizable), even while Roblox is focused
- ☕ **Support button** — a new button at the bottom of the sidebar opens the project's donation page

## ✨ Features

### 🖱️ Cursor Customization
- Customize every Roblox cursor type individually (arrow, far arrow, I-beam, mouse-locked, etc.)
- Apply your selection to Roblox instantly, with one click
- Cursors are automatically fitted and centered in a 64×64 canvas
- Smoothing is disabled to keep pixel edges crisp

### ✨ Animated Cursors (.ANI) — 🧪 Beta
> 🧪 **This feature is in beta.** It works well in our tests, but automatic state detection (Click / Text / Shift Lock) relies on heuristics and may occasionally misjudge the state in some games or setups. If you run into a problem, please [open an issue](../../issues) — feedback helps us improve it faster.

- Pick a `.ani` file for each state: **Normal (arrow), Click (hover), Text and Shift Lock**
- Drawn by a small native helper as a click-through, always-on-top overlay with true per-pixel alpha — no black boxes or edge artifacts
- Per-state **size, speed and FPS** controls (up to 240 FPS), plus **auto-center** or a manual hotspot
- Adjustable **follow interval** for smoother or lighter mouse tracking
- **Automatic state detection** — the animation switches between Normal, Click, Text and Shift Lock on its own, and a live badge shows which state is active
- **Preview** any animation for 6 seconds on your desktop, even if Roblox isn't running
- Remove an animation at any time and the original static cursor comes back
- **Hotkey to turn the animation on/off** — `Ctrl+Alt+0` by default; assign any combination, or a bare `F1`–`F24` key, from the Animated tab. The animation always starts ON when the app launches
- Only states with an animation assigned are affected; other states keep their normal static cursor

> **Note:** When a state has an animation, Roblox's own static cursor for that state is replaced with an invisible image, so with the animation turned off that state shows no cursor. Restart Roblox after assigning an animation so it loads the updated cursor images.

### 🎯 Built-in Cursor Editor
- **Auto-Fit + Center** — snaps any imported image to the ideal size in one click
- **Center Only** and **Reset Size** shortcuts
- Manual zoom slider (0.4x – 3x) for fine control
- Drag-and-drop repositioning directly on the canvas
- **Colorize** — shift the hue of a colored cursor with a slider (pure black or white has no hue, so it can't be recolored)
- **Generate Color Variations** — create multiple color options from the same cursor in one click

### 📦 Cursor Packs
- Create, save, and manage as many cursor packs as you like
- Export packs as `.rbxcursor` / `.zip` files to share with friends
- Import a pack someone sent you with drag-and-drop
- **Quick Pack Switching** — jump between saved packs instantly with `Ctrl+Alt+1` / `Ctrl+Alt+2` / `Ctrl+Alt+3`, even while Roblox is running

### 🕓 History
- Browse every cursor you've previously selected in a dedicated History tab and reapply it anytime

### 🖼️ In-Context Preview
- Test your cursors at true size on a mock Roblox screen (HUD, health/coin counters, PLAY button, chat box, and a Shift Lock toggle included)
- Simulate Shift Lock mode to preview how the cursor behaves in that state

### 🔄 Automatic Update Handling
- Automatically detects the newest Roblox client directory
- With Auto-Reinstall enabled, your saved cursors are **automatically reapplied every time Roblox updates**
- Back up your original Roblox cursors and restore them with one click
- A small, draggable live status badge shows whether Roblox is currently running

### 🌈 Bulk Color Changer
- **Change Color** — recolor every currently active cursor (Normal, Click, Text, Shift Lock) at once with a single hue (pure black or white cursors stay unchanged)
- Only changes color, never size or position — no re-centering needed
- Live preview slider plus a quick-pick color strip
- Applying instantly saves and installs all cursors to Roblox

### 🎬 Personalization
- Swap the app's own background for your own image, or reset to default
- Clean, modern dark-themed interface throughout

### ⚙️ Settings
- **English & Turkish** interface with instant language switching
- Option to **launch automatically on Windows startup**
- View the currently detected Roblox version from the Settings screen
- **☕ Support button** at the bottom of the sidebar opens the donation page

### 💻 Platform & Distribution
- Available as both a **portable executable** and an **NSIS installer**
- Built on Electron — lightweight; animated cursors run in a small native helper (`cursor_helper.exe`) that only starts when an animation is assigned
- Ready-made `.bat` scripts for building from source (`install.bat` / `start.bat` / `exe_maker.bat`)
- Source code is publicly available (noncommercial license, see below), with releases scanned on VirusTotal
- Doesn't read Roblox's memory or touch its code or executables — it replaces cursor images in the Roblox folder and, for animated cursors, draws a separate overlay window

## 📥 Download

### Setup
Download the installer to install RBX Cursor Studio on your PC.

### Portable
Download and extract the ZIP, then run `RBX Cursor Studio.exe` inside the extracted folder — no installation needed.

> Download the latest version from the [Releases](../../releases) page. Only download from this repository's Releases page.

### ❓ Windows shows a "protected your PC" warning. Why?

The app is new and not code-signed, so Windows SmartScreen may show a warning until enough people have downloaded it. This alone is not a sign of malware.

To run it: **More info → Run anyway**

The full source code is available on this page, and VirusTotal scan results for every file are linked in the section below.

### ❓ The animated cursor doesn't show up. Why?

- If Roblox runs in **exclusive fullscreen**, Windows can't draw any overlay on top of it (this also applies to Discord, Steam and similar overlays). Switch Roblox to windowed or borderless fullscreen.
- Restart Roblox after assigning your first animation.
- Use the **Preview** button in the Animated tab: it shows the animation on your desktop for 6 seconds, which tells you whether the rendering itself works.
- Check that the animation hasn't been turned off with the hotkey (`Ctrl+Alt+0` by default).

## 🔧 Building from Source

**Windows users: the ready-made scripts are enough — no terminal needed.**
The steps below are for manual setup or non-Windows systems.

> 🇬🇧 English users: `install.bat` / `start.bat` / `exe_maker.bat`

Requirements: Node.js 18+ and npm. Animated cursors additionally need a C++ compiler (MinGW `g++` or MSVC `cl.exe`) to build the native helper.

> ⚠️ **Heads-up: about a 260 MB download.** If no C++ compiler is found, `install.bat` automatically downloads and installs one (MinGW-w64 / WinLibs) through `winget` — roughly **260 MB**, only once, so the first install can take a few minutes depending on your connection. If you already have `g++` or MSVC, nothing extra is downloaded. Without a compiler the app still works, only animated cursors are disabled.
>
> This only applies to building from source. The **Setup** and **Portable** downloads already include the animated cursor helper and need no compiler.

```bash
git clone https://github.com/Carl00-mpeek/Roblox-Cursor-Studio.git
cd Roblox-Cursor-Studio
npm install
npm start        # run in development
npm run dist     # build the installer and portable exe
```

## 🛡️ VirusTotal

The latest release has been scanned with VirusTotal.

- [🔍 View VirusTotal scan results for Source](https://www.virustotal.com/gui/file/1754a25acff19696e9c0a3533ae03a47a7ab21587bcb4fd3dcc570ef348d94e8?nocache=1)
- [🔍 View VirusTotal scan results for Setup](https://www.virustotal.com/gui/file/be9ee436b7a9a99e062b47f55d5e17690ec3a16ed35925c5633b96c46cc78edd?nocache=1)
- [🔍 View VirusTotal scan results for Portable](https://www.virustotal.com/gui/file/cfa3b29517a9660bfdd7dc92d99e0572c65bb8facd7a94d0ba2fa011afdb0dcf?nocache=1)

## ☕ Support the Project

RBX Cursor Studio is free to use — and your support is what keeps it moving. If it made your Roblox a little more fun, a small donation helps us:

- ⚡ Ship updates faster whenever Roblox changes something
- 🛠️ Fix bugs quicker
- ✨ Build new features (like the animated cursors!)

Every coffee makes a real difference — thank you! 💛

[☕ Buy me a coffee](https://buymeacoffee.com/rbxcursor)

## 📄 License

This project is licensed under the [PolyForm Noncommercial License 1.0.0](LICENSE).
Required Notice: Copyright (c) 2026 Demhat Dayan

Free for personal, educational, and noncommercial use. **Commercial use, resale, or
redistribution for profit is not permitted** without written permission.
