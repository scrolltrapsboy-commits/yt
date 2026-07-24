#!/usr/bin/env bash
# ==========================================
# install-piper.sh
#
# Installs the Piper TTS engine + a voice model to a local directory.
# Used by the Dockerfile at build time, and can also be run by hand on a
# bare-metal / VM host that isn't using Docker.
#
# Usage:
#   ./scripts/install-piper.sh [install_dir] [voice]
#
# Env vars (all optional, override the defaults below):
#   PIPER_VERSION        Piper release tag (default: 2023.11.14-2)
#   PIPER_DEFAULT_VOICE  Voice model name  (default: en_US-lessac-medium)
#
# Examples:
#   ./scripts/install-piper.sh
#   ./scripts/install-piper.sh /opt/piper en_US-lessac-medium
#   sudo ./scripts/install-piper.sh /opt/piper
# ==========================================
set -euo pipefail

PIPER_VERSION="${PIPER_VERSION:-2023.11.14-2}"
INSTALL_DIR="${1:-/opt/piper}"
VOICE="${2:-${PIPER_DEFAULT_VOICE:-en_US-lessac-medium}}"
MODELS_DIR="$INSTALL_DIR/models"

# ------------------------------------------
# Detect OS + architecture so this works on
# both x86_64 and arm64 hosts (e.g. Apple
# Silicon, AWS Graviton, Raspberry Pi).
# ------------------------------------------
OS="$(uname -s)"
ARCH="$(uname -m)"

case "$OS" in
  Linux)
    case "$ARCH" in
      x86_64)         PIPER_ASSET="piper_linux_x86_64.tar.gz" ;;
      aarch64|arm64)  PIPER_ASSET="piper_linux_aarch64.tar.gz" ;;
      armv7l)         PIPER_ASSET="piper_linux_armv7l.tar.gz" ;;
      *) echo "ERROR: Unsupported Linux architecture: $ARCH" >&2; exit 1 ;;
    esac
    ARCHIVE_TYPE="tar.gz"
    ;;
  Darwin)
    case "$ARCH" in
      x86_64) PIPER_ASSET="piper_macos_x64.tar.gz" ;;
      arm64)  PIPER_ASSET="piper_macos_aarch64.tar.gz" ;;
      *) echo "ERROR: Unsupported macOS architecture: $ARCH" >&2; exit 1 ;;
    esac
    ARCHIVE_TYPE="tar.gz"
    ;;
  *)
    echo "ERROR: Unsupported OS: $OS (this script targets Linux/macOS)." >&2
    echo "On Windows, install Piper manually: https://github.com/rhasspy/piper/releases" >&2
    exit 1
    ;;
esac

PIPER_BIN="$INSTALL_DIR/piper"
DOWNLOAD_URL="https://github.com/rhasspy/piper/releases/download/${PIPER_VERSION}/${PIPER_ASSET}"

# Split "en_US-lessac-medium" -> lang=en_US, dataset=lessac, quality=medium
IFS='-' read -r LANG_CODE DATASET QUALITY <<< "$VOICE"
LANG_SHORT="${LANG_CODE%%_*}"
VOICE_BASE_URL="https://huggingface.co/rhasspy/piper-voices/resolve/main/${LANG_SHORT}/${LANG_CODE}/${DATASET}/${QUALITY}"

echo "=========================================="
echo " Installing Piper TTS"
echo "   Version:     $PIPER_VERSION"
echo "   OS/Arch:     $OS/$ARCH"
echo "   Asset:       $PIPER_ASSET"
echo "   Install dir: $INSTALL_DIR"
echo "   Voice:       $VOICE"
echo "=========================================="

mkdir -p "$INSTALL_DIR" "$MODELS_DIR"

TMP_ARCHIVE="$(mktemp)"
echo "-> Downloading Piper binary from: $DOWNLOAD_URL"
if ! curl -fsSL "$DOWNLOAD_URL" -o "$TMP_ARCHIVE"; then
  echo "ERROR: Failed to download Piper release asset. Check PIPER_VERSION/network access." >&2
  echo "       Tried: $DOWNLOAD_URL" >&2
  exit 1
fi

echo "-> Extracting to $INSTALL_DIR"
tar -xzf "$TMP_ARCHIVE" -C "$INSTALL_DIR" --strip-components=1
rm -f "$TMP_ARCHIVE"
chmod +x "$PIPER_BIN"

echo "-> Downloading voice model: $VOICE"
curl -fsSL "${VOICE_BASE_URL}/${VOICE}.onnx" -o "$MODELS_DIR/${VOICE}.onnx"
curl -fsSL "${VOICE_BASE_URL}/${VOICE}.onnx.json" -o "$MODELS_DIR/${VOICE}.onnx.json"

echo "-> Verifying installation"
ls -lah "$INSTALL_DIR"
ls -lah "$MODELS_DIR"

echo "-> Running a test synthesis"
echo "Hello from Piper" | "$PIPER_BIN" \
  --model "$MODELS_DIR/${VOICE}.onnx" \
  --output_file "$(mktemp -u).wav.test"

echo "=========================================="
echo " Piper installed successfully."
echo " PIPER_BIN=$PIPER_BIN"
echo " PIPER_MODELS_DIR=$MODELS_DIR"
echo "=========================================="
echo
echo "If running outside Docker, set these environment variables"
echo "(or add them to your .env file) before starting the server:"
echo
echo "  PIPER_BIN=$PIPER_BIN"
echo "  PIPER_MODELS_DIR=$MODELS_DIR"
echo "  PIPER_DEFAULT_VOICE=$VOICE"
