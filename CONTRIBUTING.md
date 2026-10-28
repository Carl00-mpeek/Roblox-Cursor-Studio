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

Requirements: [.NET SDK](https://dotnet.microsoft.com/download) 6+ (the app targets .NET Framework 4.8; it builds on Windows, Linux or macOS but runs on Windows). Visual Studio 2022 works too — open `RBXCursorStudio.sln`.

```bash
git clone https://github.com/Carl00-mpeek/Roblox-Cursor-Studio.git
cd Roblox-Cursor-Studio
dotnet build RBXCursorStudio/RBXCursorStudio.csproj -c Release
```

Windows users can also double-click `build.bat`. See [ARCHITECTURE.md](ARCHITECTURE.md) for the folder layout.

### 🧪 Tests

`CoreTests` checks the core logic (JSON, PNG/ZIP, `.rbxcursor` validation) and cross-checks pack compatibility against the previous version's JavaScript implementation (`CoreTests/reference-js`). Node.js 18+ is needed for that part only:

```bash
node CoreTests/fixtures-tools/make-fixtures.js . ./fx
dotnet run --project CoreTests -c Release -- ./fx
node CoreTests/fixtures-tools/verify-cs-output.js . ./fx
```

### 🎞️ Animated cursors

The animated cursor engine lives in `RBXCursorStudio/Animation/AnimEngine.cs` (no separate helper exe any more). If you change the invisible marker values, keep `Markers` in `AnimController.cs` and the `Marker*` constants in `AnimEngine.cs` in sync.

## 📝 Pull Requests

1. Fork the repository
2. Create a new branch (`git checkout -b feature/my-feature`)
3. Make your changes
4. Test that the app still builds and runs correctly, and that `CoreTests` passes. If you touched `Animation/`, try an animated cursor
5. Commit with a clear message describing your change
6. Push to your fork and open a Pull Request

Please keep PRs focused — one feature or fix per PR makes review much easier.

### Code Style

- Keep code readable and consistent with the existing style in the file you're editing
- Comment non-obvious logic, especially anything related to detecting the Roblox client directory
- If you add a new UI string, please provide both English and Turkish translations (both live in `RBXCursorStudio/Resources/lang.json`)

## 🌍 Translations

The app currently supports English and Turkish. Contributions to add or improve translations are welcome — UI strings are in `renderer/lang.js`.

## 🚀 Releases (maintainers)

Releases are built by GitHub Actions (`.github/workflows/build.yml`) on a Windows runner, which produces the Setup and Portable exe.

1. Set `"version"` in `package.json` (e.g. `3.3.5`)
2. Push a matching tag: `git tag v3.3.5 && git push origin v3.3.5`
3. The workflow builds both files and attaches them to a GitHub Release

The tag must start with `v` + the `package.json` version. A suffix such as `_hotfix` or `-beta.1` is fine (`v3.3.5_hotfix`); a different version number (`v3.3.6` while `package.json` says `3.3.5`) makes the workflow fail on purpose.

To test a build without creating a release, run the workflow manually from the **Actions** tab (**Run workflow**). The exe files are then available as downloadable artifacts only.

## 🌍 Adding a new language

1. Copy `renderer/locales/template.json` (e.g. to `de.json`) and translate every value under `"strings"` — keep the keys and `{placeholders}` as they are.
2. Create `renderer/lang-de.js` containing `LANG.de = { ...paste the translated strings... };` and add a `<script src="lang-de.js"></script>` line right after `lang-extras.js` in `renderer/index.html`.
3. Add `<option value="de">Deutsch</option>` to the `#language-select` dropdown in `renderer/index.html`.

Missing keys automatically fall back to Turkish, so a partial translation still works.

## ❓ Questions

If anything is unclear, feel free to open an issue with the `question` label.
