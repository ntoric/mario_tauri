use serde::Serialize;
use std::path::Path;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Runtime};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
use tauri_plugin_updater::{Update, UpdaterExt};

pub const UPDATE_PROGRESS_EVENT: &str = "desktop-update-progress";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCheckResult {
    pub available: bool,
    pub current_version: String,
    pub version: Option<String>,
    pub notes: Option<String>,
    pub date: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateProgress {
    /// "downloading" | "installing"
    pub status: String,
    pub downloaded: u64,
    pub content_length: Option<u64>,
    pub percent: Option<f64>,
}

fn emit_progress<R: Runtime>(app: &AppHandle<R>, progress: UpdateProgress) {
    if let Err(err) = app.emit(UPDATE_PROGRESS_EVENT, &progress) {
        eprintln!("update progress emit failed: {err}");
    }
}

fn current_version<R: Runtime>(app: &AppHandle<R>) -> String {
    app.package_info().version.to_string()
}

/// Path of the bundled mario-printer sidecar (externalBin lands next to the exe).
fn bundled_printer_binary() -> Option<std::path::PathBuf> {
    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.to_path_buf()))?;
    let name = if cfg!(target_os = "windows") {
        "mario-printer.exe"
    } else {
        "mario-printer"
    };
    let path = exe_dir.join(name);
    path.exists().then_some(path)
}

/// Stop any orphaned mario-printer sidecar so NSIS can overwrite it.
/// Only matches our bundled binary path — never a random process.
pub fn kill_bundled_printer_processes() {
    let Some(exe) = bundled_printer_binary() else {
        return;
    };
    kill_processes_at_path(&exe);
}

#[cfg(windows)]
fn kill_processes_at_path(exe: &Path) {
    use std::process::Command;
    use std::time::Duration;

    // Strip \\?\ prefix so the path matches Win32_Process.ExecutablePath.
    let raw = exe.canonicalize().unwrap_or_else(|_| exe.to_path_buf());
    let path_str = raw
        .to_string_lossy()
        .trim_start_matches(r"\\?\")
        .replace('\'', "''");
    if path_str.is_empty() {
        return;
    }
    let script = format!(
        "$ErrorActionPreference='SilentlyContinue'; \
         function Normalize([string]$p) {{ if ($p.StartsWith('\\\\?\\')) {{ $p.Substring(4) }} else {{ $p }} }}; \
         $target = Normalize '{path_str}'; \
         Get-CimInstance Win32_Process | \
         Where-Object {{ $_.ExecutablePath -and ((Normalize $_.ExecutablePath) -ieq $target) }} | \
         ForEach-Object {{ Stop-Process -Id $_.ProcessId -Force }}"
    );
    let mut cmd = Command::new("powershell");
    cmd.args([
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        &script,
    ]);
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    let _ = cmd.status();
    std::thread::sleep(Duration::from_millis(400));
}

#[cfg(not(windows))]
fn kill_processes_at_path(exe: &Path) {
    let _ = exe;
}

fn build_updater<R: Runtime>(
    app: &AppHandle<R>,
) -> Result<tauri_plugin_updater::Updater, String> {
    let mut builder = app.updater_builder().on_before_exit(move || {
        // Windows NSIS cannot overwrite mario-printer.exe while it is locked.
        eprintln!("stopping bundled mario-printer before Windows update install");
        kill_bundled_printer_processes();
    });

    if let Ok(raw) = std::env::var("MARIO_UPDATE_ENDPOINT") {
        let trimmed = raw.trim();
        if !trimmed.is_empty() {
            let endpoint = trimmed
                .parse()
                .map_err(|e| format!("invalid MARIO_UPDATE_ENDPOINT: {e}"))?;
            builder = builder
                .endpoints(vec![endpoint])
                .map_err(|e| e.to_string())?;
        }
    }

    builder.build().map_err(|e| e.to_string())
}

/// Unwrap the error source chain so the real transport cause (DNS, connect
/// refused, TLS, timeout) reaches the UI instead of bare "error sending
/// request for url (...)".
fn describe_update_error(err: tauri_plugin_updater::Error) -> String {
    use std::error::Error as _;
    let mut msg = err.to_string();
    let mut source = err.source();
    while let Some(src) = source {
        let text = src.to_string();
        if !text.is_empty() && !msg.contains(&text) {
            msg.push_str(": ");
            msg.push_str(&text);
        }
        source = src.source();
    }
    msg
}

const UPDATE_CHECK_TIMEOUT_SECS: u64 = 45;
const UPDATE_CHECK_ATTEMPTS: u32 = 2;
const UPDATE_CHECK_RETRY_DELAY_SECS: u64 = 4;

async fn fetch_update<R: Runtime>(app: &AppHandle<R>) -> Result<Option<Update>, String> {
    let updater = build_updater(app)?;
    let mut last_error: Option<tauri_plugin_updater::Error> = None;
    let mut timed_out = false;

    for attempt in 1..=UPDATE_CHECK_ATTEMPTS {
        let check = tokio::time::timeout(
            std::time::Duration::from_secs(UPDATE_CHECK_TIMEOUT_SECS),
            updater.check(),
        );
        match check.await {
            Ok(Ok(update)) => return Ok(update),
            Ok(Err(err)) => {
                eprintln!("update check attempt {attempt}/{UPDATE_CHECK_ATTEMPTS} failed: {err}");
                last_error = Some(err);
            }
            Err(_) => {
                eprintln!("update check attempt {attempt}/{UPDATE_CHECK_ATTEMPTS} timed out");
                timed_out = true;
            }
        }
        if attempt < UPDATE_CHECK_ATTEMPTS {
            tokio::time::sleep(std::time::Duration::from_secs(UPDATE_CHECK_RETRY_DELAY_SECS)).await;
        }
    }

    Err(match last_error {
        Some(err) => describe_update_error(err),
        None if timed_out => {
            format!("update check timed out after {UPDATE_CHECK_TIMEOUT_SECS}s")
        }
        None => "update check failed".to_string(),
    })
}

#[tauri::command]
pub fn app_version(app: AppHandle) -> String {
    current_version(&app)
}

#[tauri::command]
pub async fn check_for_updates(app: AppHandle) -> Result<UpdateCheckResult, String> {
    let current = current_version(&app);
    match fetch_update(&app).await? {
        Some(update) => Ok(UpdateCheckResult {
            available: true,
            current_version: current,
            version: Some(update.version.clone()),
            notes: update.body.clone(),
            date: update.date.map(|d| d.to_string()),
        }),
        None => Ok(UpdateCheckResult {
            available: false,
            current_version: current,
            version: None,
            notes: None,
            date: None,
        }),
    }
}

#[tauri::command]
pub async fn download_and_install_update(app: AppHandle) -> Result<(), String> {
    let Some(update) = fetch_update(&app).await? else {
        return Err("No update available".into());
    };

    println!(
        "downloading Mario Juicy update {} -> {}",
        current_version(&app),
        update.version
    );

    let progress_app = app.clone();
    let downloaded = Arc::new(AtomicU64::new(0));
    let downloaded_for_chunks = Arc::clone(&downloaded);

    update
        .download_and_install(
            move |chunk_len, content_len| {
                let total_downloaded =
                    downloaded_for_chunks.fetch_add(chunk_len as u64, Ordering::Relaxed) + chunk_len as u64;
                let percent = content_len.map(|total| {
                    if total == 0 {
                        0.0
                    } else {
                        ((total_downloaded as f64) / (total as f64) * 100.0).min(100.0)
                    }
                });
                emit_progress(
                    &progress_app,
                    UpdateProgress {
                        status: "downloading".into(),
                        downloaded: total_downloaded,
                        content_length: content_len,
                        percent,
                    },
                );
            },
            {
                let progress_app = app.clone();
                let downloaded = Arc::clone(&downloaded);
                move || {
                    let total_downloaded = downloaded.load(Ordering::Relaxed);
                    println!("update download finished; installing");
                    emit_progress(
                        &progress_app,
                        UpdateProgress {
                            status: "installing".into(),
                            downloaded: total_downloaded,
                            content_length: if total_downloaded > 0 {
                                Some(total_downloaded)
                            } else {
                                None
                            },
                            percent: Some(100.0),
                        },
                    );
                }
            },
        )
        .await
        .map_err(|e| e.to_string())?;

    println!("update installed; restarting");
    app.restart();
}

/// Quiet startup check: prompts only when an update exists.
pub fn spawn_startup_check(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        // Let the window and renderer come up before network checks.
        tokio::time::sleep(std::time::Duration::from_secs(8)).await;

        let update = match fetch_update(&app).await {
            Ok(update) => update,
            Err(err) => {
                eprintln!("startup update check skipped: {err}");
                return;
            }
        };

        let Some(update) = update else {
            println!("no Mario Juicy update available");
            return;
        };

        let version = update.version.clone();
        let notes = update
            .body
            .clone()
            .unwrap_or_else(|| "A newer version of Mario Juicy is ready to install.".into());
        let prompt = format!(
            "Mario Juicy {version} is available (you have {}).\n\n{notes}\n\nDownload and install now?",
            current_version(&app)
        );

        let should_install = app
            .dialog()
            .message(prompt)
            .title("Update available")
            .kind(MessageDialogKind::Info)
            .buttons(MessageDialogButtons::OkCancelCustom(
                "Update".into(),
                "Later".into(),
            ))
            .blocking_show();

        if !should_install {
            return;
        }

        if let Err(err) = update
            .download_and_install(
                |_, _| {},
                || {
                    println!("startup update download finished");
                },
            )
            .await
        {
            eprintln!("failed to install update: {err}");
            app.dialog()
                .message(format!("Could not install the update:\n{err}"))
                .title("Update failed")
                .kind(MessageDialogKind::Error)
                .blocking_show();
            return;
        }

        app.restart();
    });
}
