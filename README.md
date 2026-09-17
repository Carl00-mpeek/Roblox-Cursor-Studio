<p align="center">
  <a href="README.md">🇬🇧 English</a> •
  <a href="README.tr.md">🇹🇷 Türkçe</a>
</p>

## ⚠️ Disclaimer

RBX Cursor Studio is an independent, community-made tool and is **not affiliated with, endorsed by, or associated with Roblox Corporation** in any way. "Roblox" is a trademark of Roblox Corporation. This tool only modifies local cursor files on your own device and does not interact with, modify, or inject into the Roblox game client itself.

# 🎨 RBX Cursor Studio

A lightweight Windows tool for customizing Roblox cursors.

![RBX Cursor Studio Screenshot](assets/screenshot.en.png)
*Shown with a custom background — backgrounds are fully customizable*

## ✨ Features

### 🖱️ Cursor Customization
- Customize every Roblox cursor type individually (arrow, far arrow, I-beam, mouse-locked, etc.)
- Apply your selection to Roblox instantly, with one click
- Cursors are automatically fitted and centered in a 64×64 canvas
- Smoothing is disabled to keep pixel edges crisp

### 🎯 Built-in Cursor Editor
- **Auto-Fit + Center** — snaps any imported image to the ideal size in one click
- **Center Only** and **Reset Size** shortcuts
- Manual zoom slider (0.4x – 3x) for fine control
- Drag-and-drop repositioning directly on the canvas
- **Colorize** — turn a black-and-white cursor into a colored one with a hue slider
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
- **Change Color** — recolor every currently active cursor (Normal, Click, Text, Shift Lock) at once with a single hue
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

### 💻 Platform & Distribution
- Available as both a **portable executable** and an **NSIS installer**
- Built on Electron — lightweight, with zero background bloat
- Ready-made `.bat` scripts for building from source (`install.bat` / `start.bat` / `exe_maker.bat`)
- 100% open-source, with releases scanned on VirusTotal
- Never touches the Roblox game client itself — only modifies local cursor files

## 📥 Download

### Setup
Download the installer to install RBX Cursor Studio on your PC.

### Portable
Use the portable version without installing the application.

> Download the latest version from the [Releases](../../releases) page.

## 🔧 Building from Source

### Portable
Download and extract the ZIP, then run `RBX Cursor Studio.exe` inside the extracted folder — no installation needed.

**Windows users: the ready-made scripts are enough — no terminal needed.**
The steps below are for manual setup or non-Windows systems.

> 🇬🇧 English users: `install.bat` / `start.bat` / `exe_maker.bat`

Requirements: Node.js 18+ and npm

```bash
git clone https://github.com/Carl00-mpeek/Roblox-Cursor-Studio.git
cd Roblox-Cursor-Studio
npm install
npm start        # run in development
npm run dist     # build the installer and portable exe
```

## 🛡️ VirusTotal

The latest release has been scanned with VirusTotal.

- [🔍 View VirusTotal scan results](https://www.virustotal.com/gui/file/1754a25acff19696e9c0a3533ae03a47a7ab21587bcb4fd3dcc570ef348d94e8?nocache=1)
- [🔍 View VirusTotal scan results for Setup](https://www.virustotal.com/gui/file/be9ee436b7a9a99e062b47f55d5e17690ec3a16ed35925c5633b96c46cc78edd?nocache=1)
- [🔍 View VirusTotal scan results for Portable](https://www.virustotal.com/gui/file/cfa3b29517a9660bfdd7dc92d99e0572c65bb8facd7a94d0ba2fa011afdb0dcf?nocache=1)


## ☕ Support the Project

If you enjoy RBX Cursor Studio, you can support the project with a small donation.

[☕ Support the Project](https://buymeacoffee.com/rbxcursor)

## 📄 License

This project is licensed under the [PolyForm Noncommercial License 1.0.0](LICENSE).
Required Notice: Copyright (c) 2026 Demhat Dayan

Free for personal, educational, and noncommercial use. **Commercial use, resale, or
redistribution for profit is not permitted** without written permission.
