# Project Scaffold: Proxybuilder v2

> **Document**: 03-01-project-scaffold.md
> **Parent**: [Index](00-index.md)

## Overview

This document specifies the new flat project structure, replacing the Lerna monorepo with a single-package layout. Includes `package.json`, `tsconfig.json`, `.gitignore`, and the directory scaffold.

## Architecture

### Current Architecture (v1)

```
nginx-proxy/                 # Git root
├── package.json             # Monorepo root (Lerna + workspaces)
├── lerna.json               # Lerna config
├── tsconfig.json            # Shared TS config (strict disabled)
├── publish.sh               # Broken commit script
└── packages/
    └── proxybuilder/        # The actual package
        ├── package.json     # @truesoftware/proxybuilder
        ├── tsconfig.json    # Extends root
        ├── src/             # Source code
        └── resources/       # Templates
```

### Proposed Architecture (v2)

```
nginx-proxy/                 # Git root
├── package.json             # @blendsdk/proxybuilder (flat, no monorepo)
├── tsconfig.json            # Strict TypeScript
├── .gitignore               # Updated
├── README.md                # Comprehensive documentation
├── src/
│   ├── index.ts             # CLI entry point (yargs)
│   ├── builder.ts           # Core ProxyBuilder class
│   ├── config.ts            # proxybuilder.json manager
│   ├── logger.ts            # Logging system
│   ├── shell.ts             # Shell command executor
│   ├── validator.ts         # Input validation
│   ├── types.ts             # All TypeScript interfaces
│   ├── constants.ts         # Default values, paths
│   ├── commands/
│   │   ├── setup.ts         # System setup (install nginx, certbot, etc.)
│   │   ├── init.ts          # Initialize working directory
│   │   ├── create.ts        # Create domain proxy
│   │   ├── delete.ts        # Delete domain (full cleanup)
│   │   ├── enable.ts        # Enable disabled domain
│   │   ├── disable.ts       # Disable domain
│   │   ├── update.ts        # Update domain config
│   │   ├── list.ts          # List all domains
│   │   ├── renew.ts         # Renew certificate(s)
│   │   ├── revoke.ts        # Revoke certificate
│   │   ├── maintenance.ts   # Toggle maintenance mode
│   │   ├── status.ts        # Health overview
│   │   ├── cert-info.ts     # Certificate details
│   │   └── dns-setup.ts     # Configure DNS provider
│   ├── templates/           # Nginx config templates (copied to dist)
│   │   ├── nginx.conf
│   │   ├── proxy.conf
│   │   ├── letsencrypt.conf
│   │   ├── maintenance.conf
│   │   ├── passthrough/
│   │   │   ├── site.conf
│   │   │   ├── upstream.conf
│   │   │   └── ssl.conf
│   │   ├── full/
│   │   │   ├── site.conf
│   │   │   ├── upstream.conf
│   │   │   ├── ssl.conf
│   │   │   ├── security.conf
│   │   │   ├── general.conf
│   │   │   └── log.conf
│   │   └── pages/
│   │       ├── maintenance.html
│   │       └── 502.html
│   └── dns/                 # DNS provider integrations
│       ├── provider.ts      # IDnsProvider interface + registry
│       ├── cloudns.ts       # ClouDNS implementation
│       └── namecheap.ts     # Namecheap implementation
├── plans/                   # Implementation plans (not published)
└── .clinerules/             # AI agent config (not published)
```

## Implementation Details

### `package.json`

```json
{
  "name": "@blendsdk/proxybuilder",
  "version": "2.0.0",
  "description": "Nginx reverse proxy configuration builder with SSL, load balancing, and maintenance mode",
  "main": "dist/index.js",
  "bin": {
    "proxybuilder": "./dist/index.js"
  },
  "scripts": {
    "build": "tsc && cp -r src/templates dist/templates",
    "watch": "tsc -w",
    "dev": "node ./dist/index.js",
    "clean": "rm -rf dist",
    "prepublishOnly": "yarn clean && yarn build"
  },
  "keywords": [
    "nginx",
    "proxy",
    "reverse-proxy",
    "ssl",
    "letsencrypt",
    "certbot",
    "load-balancer"
  ],
  "author": "BlendSDK",
  "license": "ISC",
  "engines": {
    "node": ">=20.0.0"
  },
  "files": [
    "dist/**/*"
  ],
  "dependencies": {
    "yargs": "^17.7.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "@types/yargs": "^17.0.0",
    "typescript": "^5.4.0"
  }
}
```

**Key changes from v1:**
- Flat structure (no Lerna, no workspaces)
- `@blendsdk/proxybuilder` name
- `@types/*` moved to `devDependencies`
- `shelljs`, `glob`, `mkdirp` removed (using Node.js built-ins)
- `build` script copies templates to `dist/`
- `engines` requires Node >= 20
- `files` field ensures only `dist/` is published
- Version starts at `2.0.0`

### `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "es2022",
    "module": "commonjs",
    "lib": ["es2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "moduleResolution": "node",
    "declaration": true,
    "sourceMap": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist", "plans"]
}
```

**Key changes from v1:**
- `target: "es2022"` (was `es6`)
- `lib: ["es2022"]` (removed `dom` — CLI doesn't need DOM types)
- `strict: true` enabled
- All strict sub-options enabled by default
- `resolveJsonModule: true` for reading `package.json` version
- No `experimentalDecorators` / `emitDecoratorMetadata` (not needed)

### `.gitignore`

```
node_modules/
dist/
*.tgz
.env
*.log
.DS_Store
```

**Key changes from v1:**
- Much simpler — removed all the irrelevant entries (Next.js, Gatsby, Vue, Nuxt, etc.)
- Only what's relevant to this project

### Build Process

The build does two things:
1. `tsc` — compile TypeScript to `dist/`
2. `cp -r src/templates dist/templates` — copy template files (nginx configs, HTML pages) to dist

Templates are resolved at runtime via `path.join(__dirname, "templates", ...)` which works both in development (`dist/templates/`) and when installed globally.

### Files to Delete (v1 cleanup)

These files/folders should be removed when creating the v2 branch:

- `lerna.json`
- `publish.sh`
- `yarn.lock` (will be regenerated)
- `packages/` (entire directory)

The root `package.json` and `tsconfig.json` will be replaced entirely.

## Testing Requirements

- `yarn build` completes with zero errors
- `node dist/index.js --help` shows help with all commands
- `node dist/index.js --version` shows `2.0.0`
- Templates are present in `dist/templates/`
