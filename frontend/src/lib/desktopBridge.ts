export interface DesktopUpdateCheckResult {
  available: boolean
  currentVersion: string
  version?: string | null
  notes?: string | null
  date?: string | null
}

export type DesktopUpdateProgressStatus = 'downloading' | 'installing'

export interface DesktopUpdateProgress {
  status: DesktopUpdateProgressStatus
  downloaded: number
  contentLength?: number | null
  percent?: number | null
}

const UPDATE_PROGRESS_EVENT = 'desktop-update-progress'

type TauriEventApi = {
  listen?: <T>(
    event: string,
    handler: (event: { payload: T }) => void
  ) => Promise<() => void>
}

type TauriCore = {
  invoke?: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>
}

function getTauri(): { core?: TauriCore; event?: TauriEventApi } | null {
  if (typeof window === 'undefined') return null
  return (window as unknown as { __TAURI__?: { core?: TauriCore; event?: TauriEventApi } }).__TAURI__ ?? null
}

function getTauriCore(): TauriCore | null {
  return getTauri()?.core ?? null
}

export function hasDesktopIpc(): boolean {
  return typeof getTauriCore()?.invoke === 'function'
}

export function isTauriShell(): boolean {
  if (typeof window === 'undefined') return false
  const w = window as unknown as { __TAURI__?: unknown; __TAURI_INTERNALS__?: unknown }
  return !!w.__TAURI__ || !!w.__TAURI_INTERNALS__
}

export async function desktopInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const invoke = getTauriCore()?.invoke
  if (!invoke) {
    throw new Error('Desktop IPC unavailable')
  }
  return (await invoke(cmd, args)) as T
}

/** True only when the Tauri shell exposes updater commands. */
export function hasDesktopUpdater(): boolean {
  return hasDesktopIpc()
}

export async function getDesktopAppVersion(): Promise<string | null> {
  if (!hasDesktopIpc()) return null
  try {
    return await desktopInvoke<string>('app_version')
  } catch {
    return null
  }
}

export async function checkDesktopForUpdates(): Promise<DesktopUpdateCheckResult | null> {
  if (!hasDesktopIpc()) return null
  return desktopInvoke<DesktopUpdateCheckResult>('check_for_updates')
}

export async function downloadAndInstallDesktopUpdate(): Promise<boolean> {
  if (!hasDesktopIpc()) return false
  await desktopInvoke<void>('download_and_install_update')
  return true
}

/** Subscribe to native updater download/install progress. Returns an unsubscribe fn. */
export async function subscribeDesktopUpdateProgress(
  onProgress: (progress: DesktopUpdateProgress) => void
): Promise<() => void> {
  const listen = getTauri()?.event?.listen
  if (!listen) return () => {}
  try {
    return await listen<DesktopUpdateProgress>(UPDATE_PROGRESS_EVENT, (event) => {
      const payload = event?.payload
      if (!payload || typeof payload !== 'object') return
      onProgress({
        status: payload.status === 'installing' ? 'installing' : 'downloading',
        downloaded: Number(payload.downloaded) || 0,
        contentLength: payload.contentLength ?? null,
        percent:
          payload.percent == null || Number.isNaN(Number(payload.percent))
            ? null
            : Number(payload.percent),
      })
    })
  } catch {
    return () => {}
  }
}
