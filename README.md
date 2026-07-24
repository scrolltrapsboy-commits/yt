# ffmpeg-render-service

A production-ready FFmpeg render API designed to be called from **n8n**. It takes a JSON
payload (title, script, stock video URLs, narration URL, optional background music),
and returns a rendered vertical (1080x1920) MP4 — perfect for YouTube Shorts, TikTok,
and Instagram Reels.

## What it does

1. Downloads all stock video clips, and (optionally) background music
2. Narration audio is either downloaded from `voiceUrl`, **or generated automatically
   on the server** from a `voiceText` script using the built-in local TTS engine —
   no external APIs involved
3. Validates every file (retries, timeouts, corruption detection)
4. Auto-generates subtitles (SRT) from the script, timed to the narration
5. Scales, center-crops, and concatenates the videos to fill the target frame
6. Loops/trims the visuals to match the narration length exactly
7. Mixes narration + background music (music ducked to 10% with fade in/out)
8. Burns subtitles (white text, black outline, bottom-aligned)
9. Encodes to H.264 / AAC with `+faststart` for instant web playback
10. Returns a JSON response with the video URL, duration, and render time

A standalone `POST /tts` endpoint is also available for generating narration
audio (or any speech) on demand, completely offline.

## Tech stack

Node.js 22, Express, FFmpeg (`fluent-ffmpeg` + `ffmpeg-static` + `ffprobe-static`), axios,
uuid, multer, cors, dotenv, pino (structured logging), Docker, and
[Piper](https://github.com/rhasspy/piper) (local, open-source, offline neural
text-to-speech — no cloud services, no API keys, no per-request cost).

## Project structure

```
ffmpeg-render-service/
├── src/
│   ├── controllers/       # Express route handlers (render, tts, health)
│   ├── routes/             # Route definitions
│   ├── services/           # Download, validation, subtitles, ffmpeg, tts, orchestration
│   ├── utils/               # Logger, error classes, error handler, file helpers
│   ├── config/               # Environment-driven configuration + TTS voice registry
│   ├── templates/             # Subtitle style presets
│   └── app.js                  # Express app assembly
├── temp/                # Per-job scratch space (auto-cleaned)
├── output/              # Finished MP4s (served at /output/:file)
├── public/              # Static assets
│   └── audio/            # Generated TTS audio (served at /audio/:file, auto-cleaned after 24h)
├── subtitles/           # (reserved for persisted SRTs if desired)
├── assets/
│   ├── music/           # Drop default background tracks here
│   ├── fonts/           # Custom subtitle fonts
│   └── overlays/        # Optional watermark/logo overlays
├── logs/                # pino log output (app.log)
├── tests/               # Unit tests (no network / ffmpeg required) 
├── server.js            # HTTP server entry point
├── render.js            # CLI entry point (run a render without HTTP)
├── health.js            # Standalone healthcheck script (used by Docker)
├── render.http           # REST Client examples
├── n8n-workflow-example.json  # Importable n8n workflow demonstrating the API call
├── Dockerfile            # Installs FFmpeg + Piper TTS engine + a default voice model
├── docker-compose.yml
├── .env.example
└── package.json
```

---

## Installation

### Windows

1. Install [Node.js 22 LTS](https://nodejs.org/) (includes npm).
2. Install [FFmpeg](https://www.gyan.dev/ffmpeg/builds/) is **not required** —
   this project bundles static FFmpeg/ffprobe binaries via `ffmpeg-static` /
   `ffprobe-static`. You only need Node.js.
3. Open PowerShell in the project folder:
   ```powershell
   npm install
   copy .env.example .env
   npm start
   ```
4. The API is now running at `http://localhost:3000`.

> If you see permission or antivirus issues with the bundled ffmpeg binary,
> allow `node_modules\ffmpeg-static\ffmpeg.exe` through Windows Defender.

> **Note on `/tts` outside Docker:** the Piper TTS engine is installed
> automatically inside the Docker image (see below). If you run this project
> bare metal / on Windows and want `/tts` (or `voiceText` in `/render`) to
> work, you need to install Piper yourself and point `PIPER_BIN` /
> `PIPER_MODELS_DIR` at it — see "Text-to-Speech (TTS)" further down.
> Everything else in this project works without it.

### Ubuntu / Debian (bare metal)

```bash
# Node.js 22 via NodeSource
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

# Fonts used for burned-in subtitles (recommended even though ffmpeg-static
# bundles the ffmpeg binary, since libass needs system fonts)
sudo apt-get install -y fonts-dejavu-core

# Project setup
git clone <your-repo-url> ffmpeg-render-service
cd ffmpeg-render-service
npm install
cp .env.example .env
npm start
```

### WSL (Windows Subsystem for Linux)

Follow the **Ubuntu** instructions above inside your WSL2 distro. Notes:

- Run everything from the Linux filesystem (e.g. `~/ffmpeg-render-service`), not
  `/mnt/c/...`, for much faster disk I/O during rendering.
- If calling the API from Windows-side n8n / Postman, use `http://localhost:3000`
  — WSL2 forwards localhost automatically on modern Windows builds. If it
  doesn't, find your WSL IP with `ip addr show eth0` and use that instead.

### Docker (recommended for production)

```bash
docker compose up -d --build
```

This builds the image (Node 22 + FFmpeg + fonts + the Piper TTS engine and a
default voice model, all baked in), starts the container, maps port `3000`,
and persists `output/`, `logs/`, `temp/`, `assets/`, and `public/` (generated
TTS audio) to your host via volumes. Check status:

```bash
docker compose ps
docker compose logs -f
curl http://localhost:3000/health
```

To run without Compose:

```bash
docker build -t ffmpeg-render-service .
docker run -d --name ffmpeg-render-service \
  -p 3000:3000 \
  -v $(pwd)/output:/app/output \
  -v $(pwd)/logs:/app/logs \
  -v $(pwd)/temp:/app/temp \
  -e PUBLIC_BASE_URL=http://your-server-ip:3000 \
  ffmpeg-render-service
```

---

## API

### `POST /render`

**Request body**

```json
{
  "title": "Space Facts",
  "script": "Did you know that a day on Venus is longer than its year...",
  "videoUrls": [
    "https://cdn.example.com/stock/space-1.mp4",
    "https://cdn.example.com/stock/space-2.mp4"
  ],
  "voiceUrl": "https://cdn.example.com/audio/space-facts-narration.mp3",
  "backgroundMusic": "https://cdn.example.com/audio/ambient-space.mp3",
  "style": {
    "width": 1080,
    "height": 1920,
    "fps": 30
  }
}
```

Narration can come from a pre-recorded file (`voiceUrl`, as above) **or** be
generated automatically on the server from text (`voiceText`) — provide
exactly one of the two:

```json
{
  "title": "Space Facts",
  "script": "Did you know that a day on Venus is longer than its year...",
  "videoUrls": ["https://cdn.example.com/stock/space-1.mp4"],
  "voiceText": "Did you know that a day on Venus is longer than its year...",
  "voice": "default"
}
```

When `voiceText` is used, the render pipeline calls the local Piper TTS engine
directly (no HTTP round-trip, no temp file download) to synthesize the
narration before rendering — same pipeline as `POST /tts` under the hood.

| Field             | Type     | Required | Notes                                             |
|-------------------|----------|----------|----------------------------------------------------|
| `title`           | string   | yes      | Used for logging only                              |
| `script`          | string   | yes      | Used to auto-generate timed subtitles              |
| `videoUrls`       | string[] | yes      | One or more http(s) video URLs, played in order    |
| `voiceUrl`        | string   | one of `voiceUrl`/`voiceText` | Pre-recorded narration audio URL — its duration drives final length |
| `voiceText`       | string   | one of `voiceUrl`/`voiceText` | Text to synthesize into narration automatically (max `TTS_MAX_CHARS`, default 5000) |
| `voice`           | string   | no       | Voice to use when `voiceText` is set. Default `"default"` |
| `backgroundMusic` | string   | no       | Looped, ducked to 10%, fades in/out                |
| `style.width`     | number   | no       | Default `1080`                                     |
| `style.height`    | number   | no       | Default `1920`                                     |
| `style.fps`       | number   | no       | Default `30`                                       |

**Response — success (200)**

```json
{
  "success": true,
  "videoUrl": "http://server/output/final.mp4",
  "duration": 58.3,
  "renderTime": 14.5
}
```

- `duration` — length of the final video in seconds (matches narration length)
- `renderTime` — wall-clock time the render took, in seconds

**Response — failure (4xx/5xx)**

```json
{
  "success": false,
  "error": {
    "code": "DOWNLOAD_ERROR",
    "message": "Failed to download video[0] after 3 attempts: timeout of 60000ms exceeded",
    "details": { "url": "https://...", "label": "video[0]" }
  }
}
```

Error codes: `VALIDATION_ERROR` (400), `DOWNLOAD_ERROR` (502),
`CORRUPTED_FILE_ERROR` (422), `FFMPEG_ERROR` (500), `TIMEOUT_ERROR` (504),
`TTS_ENGINE_MISSING` (500), `TTS_MODEL_MISSING` (500), `TTS_ENGINE_ERROR` (500),
`TTS_SYNTHESIS_FAILED` (500), `TTS_OUTPUT_INVALID` (500), `TTS_TIMEOUT` (504),
`INTERNAL_ERROR` (500).

### `POST /tts`

Generates speech completely on the server using the local
[Piper](https://github.com/rhasspy/piper) TTS engine — no cloud services, no
API keys, no per-request cost.

**Request body**

```json
{
  "text": "Hello world",
  "voice": "default"
}
```

| Field  | Type   | Required | Notes                                                |
|--------|--------|----------|-------------------------------------------------------|
| `text` | string | yes      | Non-empty, max `TTS_MAX_CHARS` characters (default 5000) |
| `voice`| string | no       | Defaults to `"default"`. Unknown values fall back to the default voice rather than erroring — see `src/config/voices.js` |

**Response — success (200)**

```json
{
  "success": true,
  "audioUrl": "/audio/3f1a9c2e-5b7d-4e2a-9c0a-8e6b1d2f4a3c.wav",
  "duration": 3.8
}
```

- The WAV file is saved to `public/audio/` and served statically at the
  returned `audioUrl` (relative path — prefix with your server's base URL if
  calling from outside the same host, e.g. `n8n`).
- Files in `public/audio/` older than `TTS_MAX_AUDIO_AGE_HOURS` (default 24h)
  are deleted automatically, checked hourly — same mechanism as `output/`.

**Response — failure (4xx/5xx)**

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": ["text is required and must be a non-empty string"]
  }
}
```

### `GET /audio/:filename`

Serves generated TTS `.wav` files statically. This is the URL returned as
`audioUrl` by `POST /tts`.

### `GET /health`

```json
{ "status": "ok" }
```

### `GET /output/:filename`

Serves the rendered MP4 statically. This is the URL returned as `videoUrl`.

---

## curl examples

```bash
# Health check
curl http://localhost:3000/health

# Generate speech directly (no video involved)
curl -X POST http://localhost:3000/tts \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello world", "voice": "default"}'

# Minimal render (no background music, default 1080x1920 @ 30fps)
curl -X POST http://localhost:3000/render \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Ocean Facts",
    "script": "The ocean covers more than seventy percent of Earth surface.",
    "videoUrls": ["https://cdn.example.com/stock/ocean-1.mp4"],
    "voiceUrl": "https://cdn.example.com/audio/ocean-narration.mp3"
  }'

# Render with auto-generated narration (no voiceUrl needed - text is
# synthesized on the server automatically before rendering)
curl -X POST http://localhost:3000/render \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Ocean Facts",
    "script": "The ocean covers more than seventy percent of Earth surface.",
    "videoUrls": ["https://cdn.example.com/stock/ocean-1.mp4"],
    "voiceText": "The ocean covers more than seventy percent of Earth surface.",
    "voice": "default"
  }'

# Full render with background music and custom style
curl -X POST http://localhost:3000/render \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Space Facts",
    "script": "Did you know that a day on Venus is longer than its year.",
    "videoUrls": [
      "https://cdn.example.com/stock/space-1.mp4",
      "https://cdn.example.com/stock/space-2.mp4"
    ],
    "voiceUrl": "https://cdn.example.com/audio/space-narration.mp3",
    "backgroundMusic": "https://cdn.example.com/audio/ambient-space.mp3",
    "style": { "width": 1080, "height": 1920, "fps": 30 }
  }'
```

More examples (including fetching the rendered file) are in [`render.http`](./render.http),
usable directly with the VS Code "REST Client" extension.

---

## n8n integration

Import [`n8n-workflow-example.json`](./n8n-workflow-example.json) into n8n
(**Workflows → Import from File**) to see a working example, or configure an
**HTTP Request** node manually:

| Setting            | Value                                         |
|---------------------|-----------------------------------------------|
| Method              | `POST`                                        |
| URL                 | `http://<your-server>:3000/render`            |
| Body Content Type   | `JSON`                                        |
| Body                | See payload example above (use expressions to inject data from prior nodes) |
| Response Format     | `JSON`                                        |
| Timeout             | `900000` (15 min) — renders can take a while  |

Example HTTP Request node JSON (paste into an n8n node via "Import cURL" or use
the full workflow file above):

```json
{
  "parameters": {
    "method": "POST",
    "url": "http://localhost:3000/render",
    "sendBody": true,
    "specifyBody": "json",
    "jsonBody": "={\n  \"title\": \"{{ $json.title }}\",\n  \"script\": \"{{ $json.script }}\",\n  \"videoUrls\": {{ JSON.stringify($json.videoUrls) }},\n  \"voiceUrl\": \"{{ $json.voiceUrl }}\",\n  \"backgroundMusic\": \"{{ $json.backgroundMusic }}\"\n}",
    "options": {
      "timeout": 900000,
      "response": { "response": { "responseFormat": "json" } }
    }
  },
  "name": "Call FFmpeg Render API",
  "type": "n8n-nodes-base.httpRequest",
  "typeVersion": 4.2
}
```

Downstream, use an **IF** node on `{{ $json.success }}` to branch on success/failure,
and `{{ $json.videoUrl }}` to pass the finished video to your next step (upload,
notification, etc).

---

## Video settings

| Setting        | Value           |
|-----------------|------------------|
| Resolution      | 1080x1920 (default, overridable via `style`) |
| Frame rate      | 30 fps (default) |
| Video codec     | H.264 (`libx264`) |
| CRF             | 20               |
| Preset          | `medium`         |
| Audio codec     | AAC, 192k        |
| Pixel format    | `yuv420p`        |
| Container flags | `-movflags +faststart` (instant playback / streaming) |

## Subtitles

- Script is split into sentences, then wrapped to a max of **42 characters per line**
  and **2 lines per cue**, without ever splitting a word mid-word.
- Cue timing is distributed proportionally across the narration's actual duration
  (measured via `ffprobe`), so subtitles stay roughly in sync with speech pace.
- Burned in with: white text, black outline, bottom-aligned (libass `force_style`).
- Style is fully configurable via `.env` (`SUB_FONT_SIZE`, `SUB_OUTLINE_WIDTH`,
  `SUB_MARGIN_BOTTOM`, etc.) or by editing `src/templates/subtitleStyle.template.js`.

## Background music

- Optional — omit `backgroundMusic` to skip it entirely.
- Automatically looped to cover the full narration length.
- Fades in over 2s, fades out over the last 3s (configurable).
- Mixed at 10% volume under the narration (configurable via `MUSIC_VOLUME`).

## Error handling

- **Downloads**: retried up to 3 times with backoff, per-request timeout, max
  file size guard, empty/partial file detection.
- **Corrupted files**: every downloaded video/audio file is probed with `ffprobe`
  before rendering; missing streams or unreadable files fail fast with a clear
  `CORRUPTED_FILE_ERROR`.
- **FFmpeg failures**: full stderr is captured and logged; the API responds with
  a `FFMPEG_ERROR` and the command that failed.
- **Timeouts**: both downloads and the FFmpeg render itself are wrapped in
  timeouts so a single hung job can't block the service indefinitely.

## Logging

Structured JSON logs (via pino) are written to `logs/app.log` and pretty-printed
to stdout in development. Every render logs: start/end, execution time, each
downloaded file's size, the exact FFmpeg command used for each pass, final
output size, and any errors with stack traces.

## Text-to-Speech (TTS)

Speech is synthesized completely on the server by
[Piper](https://github.com/rhasspy/piper), a fast local neural TTS engine
(MIT license). There is **no cloud service, no API key, and no per-request
cost** — Piper runs as a child process inside the same container.

- The Dockerfile downloads the Piper binary (from GitHub Releases) and one
  default English voice model, `en_US-lessac-medium` (from Hugging Face —
  `rhasspy/piper-voices`, also MIT licensed), at **build time**, so the image
  is ready to serve `/tts` immediately after deployment — no runtime
  downloads, no internet access required at request time.
- `POST /tts` and `voiceText` in `POST /render` both go through the same
  `src/services/tts.service.js`, which spawns Piper, streams the text to its
  stdin, and validates the resulting WAV with `ffprobe` before returning.
- A synthesis call that takes longer than `TTS_TIMEOUT_MS` (default 60s) is
  killed and returns a `TTS_TIMEOUT` error.

### Installing Piper outside Docker

The Piper install logic lives in [`scripts/install-piper.sh`](./scripts/install-piper.sh)
(architecture-aware: Linux x86_64/arm64/armv7l and macOS x86_64/arm64). The
Dockerfile calls this same script at build time, and you can also run it
directly on a bare-metal host or VM that isn't using Docker:

```bash
./scripts/install-piper.sh /opt/piper en_US-lessac-medium
```

Then point the app at the install (these are already the defaults, so this
is only needed if you installed to a different path):

```
PIPER_BIN=/opt/piper/piper
PIPER_MODELS_DIR=/opt/piper/models
PIPER_DEFAULT_VOICE=en_US-lessac-medium
```

### Adding more voices

1. Download a voice's `.onnx` and `.onnx.json` files from
   [`rhasspy/piper-voices`](https://huggingface.co/rhasspy/piper-voices/tree/main)
   into `PIPER_MODELS_DIR` (add a `curl` step to the Dockerfile's Piper
   install block for a build-time install, or drop them into a mounted
   volume for a runtime install).
2. Register the voice name in `src/config/voices.js`, e.g.:
   ```js
   const VOICE_MODELS = {
     default: config.tts.defaultVoice,
     male: 'en_US-ryan-medium'
   };
   ```
3. Callers can now pass `"voice": "male"`. Unrecognized voice names silently
   fall back to `default` instead of failing the request.

## Environment variables

See [`.env.example`](./.env.example) for the full list with defaults and comments,
covering server settings, video/subtitle/music defaults, download/ffmpeg timeouts,
and cleanup behavior.

---

## Troubleshooting

**"TTS engine is not installed on this server (Piper binary missing)"**
Piper wasn't found at `PIPER_BIN` (default `/opt/piper/piper`) when the
request ran. Check `GET /health` first — it now reports a `tts` block with
`piperBinFound`/`defaultVoiceModelFound` and a hint. Then:
- **Docker**: rebuild the image (`docker compose up --build`) and check the
  build logs for the Piper install step. If your platform builds from source
  instead of your `Dockerfile` (some PaaS auto-detect Node and use a
  buildpack), make sure it's actually building the Dockerfile.
- **Bare metal / no Docker**: run `./scripts/install-piper.sh`, then confirm
  `PIPER_BIN`/`PIPER_MODELS_DIR` point at the install (see "Installing Piper
  outside Docker" above).
- This only affects `/tts` and auto-narration in `/render` — the rest of the
  render pipeline works without Piper.

**"FFmpeg step timed out"**
Increase `FFMPEG_TIMEOUT_MS` in `.env` for longer scripts / more clips, or lower
`DEFAULT_PRESET` (e.g. from `medium` to `veryfast`) for faster (larger) output.

**"Corrupted or unreadable media file"**
The source URL likely returned an HTML error page instead of real media (e.g.
an expired signed URL, or a 403 saved as a file). Check the URL directly in a
browser and confirm it downloads a playable file.

**Subtitles don't appear / wrong font**
Ensure `fonts-dejavu-core` (or your chosen `SUB_FONT_NAME`) is installed on the
host. The Docker image installs this automatically; on bare metal Ubuntu run
`sudo apt-get install fonts-dejavu-core`, or on Windows pick a font that's
installed system-wide and set `SUB_FONT_NAME` accordingly.

**Video looks stretched instead of cropped**
This shouldn't happen — the service always scales with
`force_original_aspect_ratio=increase` then crops to the exact target size,
preserving aspect ratio and centering the frame. If you see stretching, check
that `style.width`/`style.height` in your request match what you expect.

**n8n "Response Format" shows raw text instead of JSON**
Set the HTTP Request node's `Response > Response Format` to `JSON` explicitly.

**Port already in use**
Change `PORT` in `.env` (bare metal) or the `ports:` mapping in
`docker-compose.yml` (Docker), e.g. `"3001:3000"`.

**Disk filling up with old renders**
Adjust `MAX_OUTPUT_AGE_HOURS` in `.env` — the service automatically deletes
files in `output/` older than this threshold, checked hourly. The same
applies to generated TTS audio in `public/audio/` via `TTS_MAX_AUDIO_AGE_HOURS`.

**`TTS_ENGINE_MISSING` / `TTS_MODEL_MISSING` error from `/tts` or `/render`**
This means the Piper binary or voice model wasn't found at `PIPER_BIN` /
`PIPER_MODELS_DIR`. Inside the provided Docker image this shouldn't happen —
if it does, rebuild the image (`docker compose build --no-cache`) to make
sure the Piper install step completed. If running bare metal, you need to
install Piper yourself and set `PIPER_BIN`/`PIPER_MODELS_DIR` in `.env` (see
"Text-to-Speech (TTS)" above).
