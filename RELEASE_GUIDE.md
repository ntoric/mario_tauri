# Release Guide — How to Publish a New App Update

This guide covers the complete process for releasing a new version of the Mario Juicy POS app with automatic updates via Tauri Updater and GitHub Releases.

## Prerequisites

- You have push access to the `ntoric/mario_tauri` repository
- GitHub secrets are configured:
  - `TAURI_SIGNING_PRIVATE_KEY` — contents of `~/.tauri/mario.key`
  - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` — password (empty string if none)
- The signing public key in `tauri.conf.json` matches the private key in GitHub secrets

## Step-by-Step Release Process

### Step 1: Bump the Version

Update the version number in **two** files:

**File 1:** `frontend/src-tauri/tauri.conf.json`
```json
{
  "version": "1.2.1"
}
```

**File 2:** `frontend/src-tauri/Cargo.toml`
```toml
[package]
name = "mario-juicy"
version = "1.2.1"
```

Both files must have the **same** version number.

### Step 2: Commit the Version Bump

```bash
git add frontend/src-tauri/tauri.conf.json frontend/src-tauri/Cargo.toml
git commit -m "Bump version to 1.2.1"
```

### Step 3: Push to Main

```bash
git push origin main
```

This triggers the **build** job in GitHub Actions (runs on every main branch push). The build will compile and verify the app builds successfully, but **no release is created**.

### Step 4: Create and Push a Git Tag

```bash
git tag v1.2.1
git push origin v1.2.1
```

The tag name **must** start with `v` followed by the version number (e.g., `v1.2.1`).

This triggers the full workflow:
1. **Build job** — compiles and signs the app for Windows
2. **Release job** — runs only on tag pushes, generates `latest.json`, and creates the GitHub Release

### Step 5: Monitor the GitHub Actions Run

1. Go to https://github.com/ntoric/mario_tauri/actions
2. Watch the workflow for the tag you just pushed
3. Wait for both the **build** and **release** jobs to complete successfully

If the build fails, fix the issue, delete the tag, and re-push:
```bash
git tag -d v1.2.1
git push origin :refs/tags/v1.2.1
# Fix the issue, commit, then re-tag and push
```

### Step 6: Verify the GitHub Release

1. Go to https://github.com/ntoric/mario_tauri/releases
2. Confirm the release for your tag exists
3. Verify the release assets include:
   - `Mario-Juicy_<version>_x64-setup.exe` — the Windows installer
   - `Mario-Juicy_<version>_x64-setup.exe.sig` — the signature file
   - `latest.json` — the update manifest

### Step 7: Verify latest.json

Open the `latest.json` file from the release assets and confirm:
- `version` matches your new version
- `platforms.windows-x86_64.url` points to the correct release download URL
- `platforms.windows-x86_64.signature` is not empty

### Step 8: Test the Update (Optional but Recommended)

1. Install the **previous** version of the app on a Windows machine
2. Launch the app
3. Within 1 hour, the update banner should appear showing the new version
4. Click "Download & Install"
5. The app should download, install, and relaunch with the new version

To force an immediate check, restart the app (the updater checks on mount).

## Quick Reference (Copy-Paste)

```bash
# 1. Bump version in tauri.conf.json and Cargo.toml (e.g. to 1.2.1)
# 2. Commit and push
git add frontend/src-tauri/tauri.conf.json frontend/src-tauri/Cargo.toml
git commit -m "Bump version to 1.2.1"
git push origin main

# 3. Tag and push
git tag v1.2.1
git push origin v1.2.1

# 4. Monitor: https://github.com/ntoric/mario_tauri/actions
# 5. Verify: https://github.com/ntoric/mario_tauri/releases
```

## Troubleshooting

### Build fails with signing error
- Verify `TAURI_SIGNING_PRIVATE_KEY` secret is set and contains the full key contents
- Verify `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` matches the password used when generating the key

### Release job doesn't run
- Confirm the tag starts with `v` (e.g., `v1.2.1`, not `1.2.1`)
- Confirm you pushed the tag: `git push origin v1.2.1`

### `latest.json` not generated
- Check that the build job produced a `-setup.exe` file
- Look at the "Generate latest.json manifest" step logs in the release job

### App doesn't detect the update
- Verify `latest.json` is attached to the latest GitHub release
- Verify the version in `latest.json` is higher than the installed version
- Check that the endpoint URL in `tauri.conf.json` is `https://github.com/ntoric/mario_tauri/releases/latest/download/latest.json`
- The updater checks on app startup and every 1 hour — restart the app to trigger an immediate check

### Need to delete a bad release
```bash
# Delete remote tag
git push origin :refs/tags/v1.2.1
# Delete local tag
git tag -d v1.2.1
# Delete the release on GitHub: https://github.com/ntoric/mario_tauri/releases
```
