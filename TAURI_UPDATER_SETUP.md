# Tauri Updater with GitHub Releases

This document describes the Tauri Updater implementation for the Mario Juicy POS system, using GitHub Releases as the update provider.

## Overview

The updater plugin enables automatic app updates through Tauri's built-in update mechanism. It checks for updates from GitHub Releases, downloads the signed update package, and installs it with user confirmation.

## Architecture

### Backend (Rust)

1. **Cargo.toml**: `tauri-plugin-updater = "2"` and `tauri-plugin-process = "2"` dependencies
2. **lib.rs**: Initialized with `.plugin(tauri_plugin_updater::Builder::new().build())` and `.plugin(tauri_plugin_process::init())`
3. **tauri.conf.json**: Configured with:
   - Public key for signature verification
   - Endpoint: `https://github.com/ntoric/mario_tauri/releases/latest/download/latest.json`
   - Dialog enabled for user prompts
   - Windows install mode: passive

### Frontend (TypeScript/React)

1. **package.json**: `@tauri-apps/plugin-updater` and `@tauri-apps/plugin-process` dependencies
2. **services/updater.ts**: Service class handling check, download, install, and relaunch
3. **hooks/useUpdater.ts**: React hook with auto-check on mount and periodic polling (1 hour)
4. **components/UpdateNotification.tsx**: Banner UI showing update availability, download progress, and install/relaunch actions
5. **App.tsx**: Renders `<UpdateNotification />` at the app root

### Capabilities

`frontend/src-tauri/capabilities/default.json` includes:
- `updater:default` — base updater permissions
- `updater:allow-download-and-install` — download and install updates
- `process:allow-restart` — relaunch the app after install

### GitHub Actions (CI/CD)

`.github/workflows/build.yml`:
- Build step uses `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` env vars to sign update packages
- Release job generates `latest.json` manifest with version, signature, and download URL
- Release includes: installer files, `.sig` signature files, and `latest.json`

## Setup

### 1. Signing Keys

A signing key pair was generated at `~/.tauri/mario.key` (private) and `~/.tauri/mario.key.pub` (public). The public key is embedded in `tauri.conf.json`.

Add these GitHub repository secrets:
- `TAURI_SIGNING_PRIVATE_KEY` — contents of `~/.tauri/mario.key`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` — password (empty string if no password)

### 2. Install Dependencies

```bash
cd frontend && npm install
```

### 3. Release Process

1. Bump version in `frontend/src-tauri/tauri.conf.json` and `frontend/src-tauri/Cargo.toml`
2. Commit and push to main
3. Create and push a tag: `git tag v1.2.1 && git push origin v1.2.1`
4. GitHub Actions builds, signs, and creates the release with `latest.json`
5. Existing apps auto-detect the update on next check (within 1 hour)

## Update Flow

1. App checks `https://github.com/ntoric/mario_tauri/releases/latest/download/latest.json`
2. If `latest.json` version > current version, update banner appears
3. User clicks "Download & Install"
4. Update package is downloaded and verified against the public key
5. App relaunches with the new version

## Downgrade / Rollback

The Software Updates page also offers a "Rollback" section to restore the previous release.

- **Backend**: `GET /api/update/manifest?rollback=1&version=<current>` lists GitHub releases, picks the newest release below `current`, and proxies that release's `latest.json` (404 when none exists).
- **Rust**: `check_for_downgrade` / `download_and_install_downgrade` reuse the signed update pipeline. The updater uses the same endpoint plus `rollback=1&version={{current_version}}` and a custom `version_comparator` that accepts older remote versions (the default comparator only allows newer).
- **Frontend**: `updaterService.checkForDowngrade()` / `downloadAndInstallDowngrade()`; the `SoftwareUpdates` page shows the previous version with a confirmation dialog before installing. Download/install progress and signature verification are identical to upgrades.
- **Context menu**: `AppContextMenu` (mounted at the app root, so it works on the login page too) adds a right-click menu showing the app version and a "Restore version X.Y.Z" action with the same confirm → download → restart flow. Desktop only; the browser keeps its native context menu.
- The hourly auto-check never rolls back — downgrades are always user-initiated from Software Updates or the context menu.

## latest.json Format

```json
{
  "version": "1.2.1",
  "notes": "Release 1.2.1",
  "pub_date": "2025-06-25T12:00:00Z",
  "platforms": {
    "windows-x86_64": {
      "signature": "...",
      "url": "https://github.com/ntoric/mario_tauri/releases/download/v1.2.1/Mario-Juicy_1.2.1_x64-setup.exe"
    }
  }
}
```

## Notes

- Windows only for now; macOS/Linux can be enabled by uncommenting matrix entries in `build.yml` and adding platform entries to `latest.json`
- The first release with the updater must be manually installed; subsequent updates are automatic
- The signing private key must be kept secret — if lost, updates cannot be signed and the public key in `tauri.conf.json` must be regenerated
- Auto-check runs every hour (3600000ms); users can dismiss updates and will be reminded on the next check
