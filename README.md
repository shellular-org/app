# Shellular

Use your dev machine from your phone. Connect to your Mac, PC, or VPS and ship from anywhere. Terminal, file editor, Git, AI agents, and system monitoring — all on mobile.

## Features

- **Remote terminal** — xterm.js-based shell access over WebSocket
- **File browser & editor** — browse, edit, and diff files with CodeMirror 6
- **Project management** — Git integration for your remote projects
- **AI agents** — chat and task execution via ACP
- **System monitoring** — CPU, memory, and battery dashboards
- **Port forwarding** — expose services from your dev machine
- **End-to-end encryption** — libsodium-powered key exchange
- **QR pairing** — scan to connect, no manual IP entry
- **Themes** — Light, Dark, and OLED

## Prerequisites

- **Node.js** >= 22.13
- **pnpm** (package manager)
- Platform SDKs (for native builds):
  - Android: JDK 17+, Android SDK
  - iOS: Xcode 16+, CocoaPods

## Quick Start

```bash
# Install dependencies
pnpm install

# Start development server (defaults to Android)
pnpm dev

# Start for a specific platform
pnpm dev android
pnpm dev ios
pnpm dev browser
```

This starts webpack-dev-server with HMR and launches the app on the target platform.

## Building

```bash
# Type-check and build for production
pnpm build android
pnpm build ios
pnpm build browser
```

## Scripts

| Command                 | Description                        |
| ----------------------- | ---------------------------------- |
| `pnpm dev`              | Start dev server + platform launch |
| `pnpm dev:release`      | Dev server in production mode      |
| `pnpm build <platform>` | Full production build              |
| `pnpm typecheck`        | TypeScript type checking           |
| `pnpm format`           | Lint and format with Biome         |
| `pnpm patch`            | Bump patch version                 |
| `pnpm minor`            | Bump minor version                 |

## Tech Stack

React 19 / TypeScript / Webpack 5 / Tailwind CSS 4 / xterm.js 6 / CodeMirror 6 / Chart.js / Framer Motion / libsodium / Bio

## License

AGPL-3.0-only
