use serde::Serialize;
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
        println!("update progress emit failed: {err}");
    }
}

fn current_version<R: Runtime>(app: &AppHandle<R>) -> String {
    app.package_info().version.to_string()
}

fn build_updater<R: Runtime>(
    app: &AppHandle<R>,
) -> Result<tauri_plugin_updater::Updater, String> {
    let builder = app.updater_builder();
    builder.build().map_err(|e| e.to_string())
}

async fn fetch_update<R: Runtime>(app: &AppHandle<R>) -> Result<Option<Update>, String> {
    let updater = build_updater(app)?;
    updater.check().await.map_err(|e| e.to_string())
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
        "downloading Mario update {} -> {}",
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
                println!("update progress: {total_downloaded} / {content_len:?}");
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
        // Let the app settle before network checks.
        tauri::async_runtime::spawn_blocking(|| {
            std::thread::sleep(std::time::Duration::from_secs(8));
        })
        .await
        .ok();

        let update = match fetch_update(&app).await {
            Ok(update) => update,
            Err(err) => {
                println!("startup update check skipped: {err}");
                return;
            }
        };

        let Some(update) = update else {
            println!("no Mario update available");
            return;
        };

        let version = update.version.clone();
        let notes = update
            .body
            .clone()
            .unwrap_or_else(|| "A newer version of Mario is ready to install.".into());
        let prompt = format!(
            "Mario {version} is available (you have {}).\n\n{notes}\n\nDownload and install now?",
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
            println!("failed to install update: {err}");
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
