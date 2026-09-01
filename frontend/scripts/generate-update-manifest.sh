#!/usr/bin/env bash
# Build a Tauri updater latest.json from signed release artifacts.
#
# Usage:
#   ./scripts/generate-update-manifest.sh \
#     --version 1.5.1 \
#     --base-url https://github.com/ntoric/mario_tauri/releases/download/v1.5.1 \
#     [--notes "Bug fixes"] \
#     [--out latest.json]
#
# Looks under src-tauri/target/release/bundle/ for:
#   macos/Mario Juicy.app.tar.gz(.sig)   (or *.app.tar.gz)
#   nsis/Mario Juicy_*_x64-setup.exe(.sig) (or *-setup.exe)
# Optional darwin-aarch64 / darwin-x86_64 / windows-x86_64 path overrides via env:
#   DARWIN_AARCH64_URL, DARWIN_X86_64_URL, WINDOWS_X86_64_URL
#   DARWIN_AARCH64_SIG, DARWIN_X86_64_SIG, WINDOWS_X86_64_SIG
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BUNDLE="${ROOT_DIR}/src-tauri/target/release/bundle"
VERSION=""
BASE_URL=""
NOTES=""
OUT="${ROOT_DIR}/latest.json"
PUB_DATE="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --version) VERSION="${2:-}"; shift 2 ;;
    --base-url) BASE_URL="${2:-}"; shift 2 ;;
    --notes) NOTES="${2:-}"; shift 2 ;;
    --out) OUT="${2:-}"; shift 2 ;;
    --pub-date) PUB_DATE="${2:-}"; shift 2 ;;
    *)
      echo "unknown arg: $1" >&2
      exit 1
      ;;
  esac
done

if [[ -z "${VERSION}" || -z "${BASE_URL}" ]]; then
  echo "usage: $0 --version X.Y.Z --base-url https://.../vX.Y.Z [--notes '...'] [--out latest.json]" >&2
  exit 1
fi

BASE_URL="${BASE_URL%/}"

read_sig() {
  local path="$1"
  if [[ -f "${path}" ]]; then
    tr -d '\n' < "${path}"
  fi
}

find_first() {
  local dir="$1"
  shift
  local pattern
  for pattern in "$@"; do
    local match
    match="$(find "${dir}" -maxdepth 1 -type f -name "${pattern}" 2>/dev/null | head -n 1 || true)"
    if [[ -n "${match}" ]]; then
      echo "${match}"
      return 0
    fi
  done
  return 1
}

platforms_json=""
append_platform() {
  local key="$1"
  local url="$2"
  local sig="$3"
  if [[ -z "${url}" || -z "${sig}" ]]; then
    return 0
  fi
  local entry
  entry="$(printf '{"signature":%s,"url":%s}' "$(python3 -c 'import json,sys; print(json.dumps(sys.argv[1]))' "${sig}")" "$(python3 -c 'import json,sys; print(json.dumps(sys.argv[1]))' "${url}")")"
  if [[ -n "${platforms_json}" ]]; then
    platforms_json+=","
  fi
  platforms_json+=$(printf '"%s":%s' "${key}" "${entry}")
}

# macOS updater bundle
MAC_TAR=""
if MAC_TAR="$(find_first "${BUNDLE}/macos" "Mario Juicy.app.tar.gz" "*.app.tar.gz")"; then
  MAC_SIG="$(read_sig "${MAC_TAR}.sig")"
  MAC_NAME="$(basename "${MAC_TAR}")"
  if [[ -n "${DARWIN_AARCH64_URL:-}" || -n "${MAC_SIG}" ]]; then
    append_platform "darwin-aarch64" \
      "${DARWIN_AARCH64_URL:-${BASE_URL}/${MAC_NAME}}" \
      "${DARWIN_AARCH64_SIG:-${MAC_SIG}}"
  fi
  if [[ -n "${DARWIN_X86_64_URL:-}" ]]; then
    append_platform "darwin-x86_64" \
      "${DARWIN_X86_64_URL}" \
      "${DARWIN_X86_64_SIG:-${MAC_SIG}}"
  elif [[ -n "${MAC_SIG}" ]]; then
    append_platform "darwin-x86_64" \
      "${BASE_URL}/${MAC_NAME}" \
      "${MAC_SIG}"
  fi
fi

# Windows NSIS updater artifact
WIN_EXE=""
if WIN_EXE="$(find_first "${BUNDLE}/nsis" "Mario Juicy*_x64-setup.exe" "Mario Juicy*-setup.exe" "*.exe")"; then
  WIN_SIG="$(read_sig "${WIN_EXE}.sig")"
  WIN_NAME="$(basename "${WIN_EXE}")"
  append_platform "windows-x86_64" \
    "${WINDOWS_X86_64_URL:-${BASE_URL}/${WIN_NAME}}" \
    "${WINDOWS_X86_64_SIG:-${WIN_SIG}}"
fi

if [[ -z "${platforms_json}" ]]; then
  echo "No updater artifacts found under ${BUNDLE}. Build with createUpdaterArtifacts and TAURI_SIGNING_PRIVATE_KEY* set." >&2
  exit 1
fi

python3 - "${OUT}" "${VERSION}" "${NOTES}" "${PUB_DATE}" "{${platforms_json}}" <<'PY'
import json, sys
out, version, notes, pub_date, platforms_raw = sys.argv[1:6]
platforms = json.loads(platforms_raw)
payload = {
    "version": version,
    "notes": notes,
    "pub_date": pub_date,
    "platforms": platforms,
}
with open(out, "w", encoding="utf-8") as f:
    json.dump(payload, f, indent=2)
    f.write("\n")
print(f"Wrote {out}")
print(json.dumps(payload, indent=2))
PY
