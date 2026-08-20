# Contributing

## Prerequisites

- Node.js >= 22.13
- pnpm
- Android SDK or Xcode (for platform-specific work)

## Setup

```bash
pnpm install
pnpm dev        # starts dev server + launches app
pnpm typecheck  # run TypeScript checks
pnpm format     # lint + format
```

The `dev/` directory contains Node.js scripts that orchestrate builds, platform launches, SSH tunnels, and version management. See individual scripts for details.

## Project Structure

```
src/
  boot.ts              # Entry point, platform redirect, eruda debug console
  main.ts              # App init: storage, settings, theme, device ID
  App.tsx              # Root component: onboarding gate, tabs, page stack
  bridge/              # Native bridge abstraction (Android/iOS/browser APIs)
  classes/             # Core classes: Theme, Localization, Color
  components/          # Reusable UI components (each dir has .tsx + .scss)
  pages/               # Full-page views pushed onto navigation stack
  tabs/                # Bottom-tab views: home, terminal, projects, agents, more
  state/               # React context + useSyncExternalStore state management
  lib/                 # Utilities: settings, store, e2ee, keyboard, permissions
  platforms/           # Platform-specific bootstrapping (android/ios/browser)
  lang/                # Internationalization (English only currently)
  themes/              # Theme definitions (light, dark, oled)
  listeners/           # Global event listeners (intents, external links)
  polyfill/            # Runtime polyfills
  res/                 # Static assets: fonts, icons, logos
    icons/             # Icon font (IcoMoon format)
      shellular-app.ttf
      style.css
      selection.json
```

## File Naming Conventions

| Type             | Convention                                | Example                              |
| ---------------- | ----------------------------------------- | ------------------------------------ |
| React components | PascalCase dir, matching `.tsx` + `.scss` | `AppDialog/AppDialog.tsx`            |
| Pages            | lowercase dir, `index.tsx` + `index.scss` | `files/index.tsx`                    |
| Tabs             | lowercase dir, `index.tsx` + `index.scss` | `terminal/index.tsx`                 |
| Utilities / libs | camelCase                                 | `actionStack.ts`, `e2ee.ts`          |
| Classes          | camelCase                                 | `theme.ts`, `localization.ts`        |
| SCSS standalone  | camelCase, matching the component         | `App.scss`, `main.scss`              |
| SCSS partials    | camelCase                                 | `_mixins.scss`, `_keyframes.scss`    |
| Assets           | kebab-case                                | `shellular-app.ttf`, `noto_sans.ttf` |

## Code Style

- **Formatter/Linter:** Biome 2.4
- **Indentation:** Tabs
- **Quotes:** Double quotes
- **Semicolons:** As required
- **Imports:** Organize imports on save (configured in Biome)

Run `pnpm format` before committing. CI will reject unformatted code.

## Type Checking

TypeScript strict mode is enabled. Run `pnpm typecheck` before submitting a PR. Note that webpack uses `transpileOnly` mode, so builds can succeed with type errors — always type-check separately.

## Icons

Icons use a custom icon font generated with [IcoMoon](https://icomoon.io).

### Adding or modifying icons

1. Go to [icomoon.io/app](https://icomoon.io/app)
2. Click **Import Project** and upload `src/res/icons/selection.json`
3. Select existing icons to modify, or import new SVGs
4. Make your changes, then click **Generate Font**
5. Click **Download** and extract the zip
6. Replace these files from the download into the repo:
   - `fonts/shellular-app.ttf` -> `src/res/icons/shellular-app.ttf`
   - `style.css` -> `src/res/icons/style.css`
   - `selection.json` -> `src/res/icons/selection.json`

### Using icons in code

```tsx
<i className="icon-home" />
<i className="icon-terminal" />
```

The icon CSS maps class names to Unicode codepoints. Browse `src/res/icons/style.css` for all available icon classes.

## Branching & Releases

- All branches must be created from `dev`
- All pull requests must target `dev`
- The team stages everything in `dev` and merges into `main` only when ready to release

## Commit Messages

No strict convention is enforced. Keep them short and descriptive.

## Pull Requests

1. Create your branch from `dev` and open PRs against `dev`
2. Run `pnpm typecheck` and `pnpm format` before pushing
3. Test on at least one mobile platform (both if you make native changes)
4. Keep PRs focused — one feature or fix per PR
