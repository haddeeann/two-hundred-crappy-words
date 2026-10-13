# Release checklist

This checklist separates a reproducible local development-preview build from the
external evidence required for a trustworthy public macOS release.

## 1. Freeze and identify the candidate

- Start from a clean, reviewed commit on the intended branch.
- Confirm `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, and the
  lockfiles agree on the technical version.
- Confirm the monotonically increasing macOS bundle build and intended human label.
- Do not create the release tag until every applicable gate below passes.

## 2. Run the repository-local gate

From the repository root on the target Apple Silicon Mac:

```sh
./scripts/verify-development-preview.sh
```

The script installs locked dependencies, runs frontend and native tests, static
checks, strict Rust linting, the production dependency audit, builds a fresh `.app`,
applies an explicit ad-hoc development signature, and verifies the bundle's version,
build number, minimum macOS version, architecture, and signature. It always deletes
the old app bundle before building so stale
output cannot satisfy the check.

Build a DMG separately only after the `.app` gate passes:

```sh
npm run tauri build -- --bundles dmg
shasum -a 256 "src-tauri/target/release/bundle/dmg/Ministry of Elsewhere_0.8.0_aarch64.dmg"
```

Record the exact artifact byte size and SHA-256 in the release notes and download
page. Download the hosted artifact again and verify the same digest.

## 3. Privacy and product checks

- Read [`../PRIVACY.md`](../PRIVACY.md) against the current permissions, stores, and
  network behavior.
- Export content-free diagnostics from Help, inspect every field, save it, parse it as
  JSON, and confirm it contains no project name/ID, path, filename, text, totals,
  recovery content, permission scope, or logs.
- Complete Getting Started, create/open/reopen a disposable world, write and recover
  a draft, back up and restore the complete project folder, and export a manuscript.
- Verify Help, keyboard paths, VoiceOver names, 200% zoom, native window controls,
  reduced motion, empty states, and failure messages.

## 4. External public-release gates

The following cannot be marked complete from a local build alone:

- Confirm the legal publisher identity and approve its controlled reverse-DNS bundle
  identifier; implement and exercise the copy-only app-data migration.
- Build with the publisher's Developer ID Application certificate and hardened
  runtime, notarize both app/DMG as required, staple the ticket, and run `codesign`,
  `spctl`, and `xcrun stapler validate` against the exact candidate.
- Install on a clean supported macOS 13+ Apple Silicon Mac outside the development
  checkout; launch, write, restart, back up, restore, update, and uninstall.
- Collect and resolve real beta-writer feedback.
- Obtain the publisher's explicit human launch approval.

An artifact missing any of these gates remains a clearly labeled development preview.

## 5. Manual update

The app has no automatic updater. Before replacing it, quit Ministry and back up the
project folders. For extra rollback safety, copy the closed app-data directory named
in [`DATA_AND_RECOVERY.md`](DATA_AND_RECOVERY.md). Install the newer verified app in
Applications, replacing the old app only after confirming its version and digest.
Open an existing project and verify its writing and private practice state before
discarding the previous app copy or backup.

## 6. Rollback

Quit the app. Restore the previous verified `.app` and, if the newer build performed
an app-data or format migration, restore the matching closed-app backup as a unit.
Never combine an older executable with partially migrated private data unless that
release explicitly documents backward compatibility. Project files remain ordinary
and should be restored from their own backup only if the newer version actually
changed them and the writer wants to reverse those edits.

## 7. Uninstall

Quit Ministry and move the application from Applications to Trash. This leaves all
writer-selected project folders untouched. To remove private settings, history,
goals, challenges, permission scopes, and any remaining recovery drafts too, first
back up anything needed and then remove the exact Application Support directory from
the data-location guide. That second step is irreversible and is never performed by
the app automatically.
