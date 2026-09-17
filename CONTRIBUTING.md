# Contributing to RBX Cursor Studio

Thanks for your interest in contributing! 🎨

## 🐛 Reporting Bugs

Before opening an issue, please check if it has already been reported.

When reporting a bug, include:
- Your Windows version
- RBX Cursor Studio version (portable or setup)
- Steps to reproduce the issue
- Screenshots if applicable
- Any error messages from the console (if running from source)

## 💡 Suggesting Features

Feature requests are welcome! Open an issue and describe:
- What problem the feature would solve
- How you imagine it working

## 🔧 Development Setup

Requirements: Node.js 18+ and npm

```bash
git clone https://github.com/Carl00-mpeek/Roblox-Cursor-Studio.git
cd Roblox-Cursor-Studio
npm install
npm start        # run in development
```

To build the installer and portable exe:

```bash
npm run dist
```

Windows users can also use the ready-made scripts:
- 🇹🇷 `kur.bat` / `baslat.bat` / `exe_yap.bat`
- 🇬🇧 `install.bat` / `start.bat` / `exe_maker.bat`

## 📝 Pull Requests

1. Fork the repository
2. Create a new branch (`git checkout -b feature/my-feature`)
3. Make your changes
4. Test that the app still builds and runs correctly (`npm start`)
5. Commit with a clear message describing your change
6. Push to your fork and open a Pull Request

Please keep PRs focused — one feature or fix per PR makes review much easier.

### Code Style

- Keep code readable and consistent with the existing style in the file you're editing
- Comment non-obvious logic, especially anything related to detecting the Roblox client directory
- If you add a new UI string, please provide both English and Turkish translations

## 🌍 Translations

The app currently supports English and Turkish. Contributions to add or improve translations are welcome — check the `renderer` folder for UI strings.

## ❓ Questions

If anything is unclear, feel free to open an issue with the `question` label.
