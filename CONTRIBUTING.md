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
- If it involves animated cursors (`.ANI`): the `error.log` file from `%APPDATA%\RBXCursorStudio\`

## 💡 Suggesting Features

Feature requests are welcome! Open an issue and describe:
- What problem the feature would solve
- How you imagine it working

## 🔧 Development Setup

Requirements: Node.js 18+ and npm.
Animated cursors additionally need a C++ compiler (MinGW `g++` or MSVC `cl.exe`) to build the native helper (see below).

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

### 🎞️ Native helper (animated cursors)

The animated cursor feature is powered by a small C++ program, `native/cursor_helper.exe` (source: `native/cursor_helper.cpp`).

- `npm install` builds it automatically (`postinstall` → `scripts/build-native.js` → `native/build.bat`).
- If no compiler is found, `build.bat` tries to install MinGW-w64 via `winget`. If that also fails, `npm install` still succeeds — only the animated cursor feature is disabled, the rest of the app works normally.
- To build it manually: `cd native && build.bat`
- `npm run dist` refuses to package without `cursor_helper.exe`, so a release can't ship without animated cursor support by accident. In the packaged app the helper is copied to `resources/native/` (see `extraResources` in `package.json`).
- If you change the marker values, keep `native/marker.h` and `MARKERS` in `main/anim-cursor.js` in sync.
- `.bat` files must keep Windows (CRLF) line endings. `.gitattributes` takes care of this, just don't override it.

## 📝 Pull Requests

1. Fork the repository
2. Create a new branch (`git checkout -b feature/my-feature`)
3. Make your changes
4. Test that the app still builds and runs correctly (`npm start`). If you touched anything in `native/`, also run `native\build.bat` and try an animated cursor
5. Commit with a clear message describing your change
6. Push to your fork and open a Pull Request

Please keep PRs focused — one feature or fix per PR makes review much easier.

### Code Style

- Keep code readable and consistent with the existing style in the file you're editing
- Comment non-obvious logic, especially anything related to detecting the Roblox client directory
- If you add a new UI string, please provide both English and Turkish translations (both live in `renderer/lang.js`)

## 🌍 Translations

The app currently supports English and Turkish. Contributions to add or improve translations are welcome — UI strings are in `renderer/lang.js`.

## 🚀 Releases (maintainers)

Releases are built by GitHub Actions (`.github/workflows/build.yml`) on a Windows runner, which produces the Setup and Portable exe.

1. Set `"version"` in `package.json` (e.g. `3.3.5`)
2. Push a matching tag: `git tag v3.3.5 && git push origin v3.3.5`
3. The workflow builds both files and attaches them to a GitHub Release

The tag must start with `v` + the `package.json` version. A suffix such as `_hotfix` or `-beta.1` is fine (`v3.3.5_hotfix`); a different version number (`v3.3.6` while `package.json` says `3.3.5`) makes the workflow fail on purpose.

To test a build without creating a release, run the workflow manually from the **Actions** tab (**Run workflow**). The exe files are then available as downloadable artifacts only.

## ❓ Questions

If anything is unclear, feel free to open an issue with the `question` label.
