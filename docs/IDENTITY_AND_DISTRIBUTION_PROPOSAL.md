# Application identity and distribution proposal

Status: **PARTIALLY APPROVED — product name implemented; visual and distribution identity pending**

Last reviewed: 2026-10-09

This document records the current prototype identity and the remaining decisions for the first macOS beta. The user approved **Ministry of Elsewhere** and the line **“Write a little every day. Build something enormous.”** on 2026-10-09. The visible name and internal package slug are implemented; icons, publisher identity, versioning, signing, and publication remain gated.

## Current inventory

| Surface | Current value | Assessment |
| --- | --- | --- |
| Product name in the interface and HTML title | `Ministry of Elsewhere` | Approved and implemented. |
| Tauri `productName` | `Ministry of Elsewhere` | Approved friendly bundle name. |
| Rust and npm package names | `ministry-of-elsewhere` | Approved internal slug; the repository directory may retain its historical name locally. |
| Tauri bundle identifier | `com.pat.two-hundred-crappy-words` | Temporarily preserved so existing app-local history, recovery, settings, and permissions remain available; the publisher namespace has not been approved. |
| Tauri, Rust, and npm version | `0.1.0` | Consistent but not an intentional beta version policy. |
| Rust description and author | Accurate product description; `you` | Description corrected; public author/publisher remains pending. |
| npm description | Accurate product description | Implemented. |
| License | MIT in `package.json` and repository `LICENSE` | Already explicit. |
| macOS app name | `Ministry of Elsewhere` | Generated from the approved Tauri product name. |
| macOS minimum system version | `10.13` | Tauri default, not a tested support promise. |
| macOS architecture | Apple Silicon (`arm64`) only | Built and exercised on the current Mac; Intel has not been built or tested. |
| macOS icon | Default Tauri mark | Placeholder, propagated to the generated platform icon set. |
| Browser/favicon icon | Default Svelte mark | Placeholder and unrelated to the app icon. |
| Other starter assets | `static/svelte.svg`, `static/vite.svg` | Unused starter identity remains in the repository. |
| Next development DMG name | `Ministry of Elsewhere_0.1.0_aarch64.dmg` | Friendly name implemented; version remains a placeholder until approved. |
| Current signing | Ad-hoc/linker signed, no Apple Team ID | Suitable only for development. `spctl --assess` rejects the built app. |
| Notarization and stapling | None | Not ready for download by another writer. |
| Update mechanism | None | Appropriate for the current offline prototype; first beta can use manual updates. |
| Tested distribution target | macOS on Apple Silicon | Windows, Linux, Intel macOS, and the Mac App Store are not tested products. |

The current build contains no entitlements file, provisioning profile, custom `Info.plist`, release automation, release tags, or signing credentials. Those absences are useful: there is no legacy public identity to migrate and no secret to rotate.

## Proposed first-beta identity

The product-language portion is approved. Remaining sections distinguish recommendations from completed decisions.

### Product language

- **Display name:** `Ministry of Elsewhere`
- **Approved line:** `Write a little every day. Build something enormous.`
- **One-line description:** `A calm, local-first writing studio for novelists building imagined worlds.`
- **Internal package slug:** `ministry-of-elsewhere`
- **Tone:** warm and lightly playful in encouragement; plain and precise for saving, recovery, privacy, conflicts, and export.

The name creates a memorable fictional institution for organizing imagined places without narrowing the product to one genre. It should appear in Finder, the title bar, dialogs, onboarding, export metadata, the DMG, and release notes. The tagline carries the daily-practice promise without making the default word count the brand.

Existing portable filenames and discriminators beginning with `200-crappy-words` remain unchanged. They are versioned compatibility identifiers, are normally visible inside existing projects, and do not need to match the current brand. Renaming them would create migration risk without improving the writing experience.

Before a public launch, the name still needs ordinary brand-clearance work. A web search is not trademark clearance, and this proposal makes no legal availability claim.

### Publisher and bundle identity

Use a stable reverse-DNS identifier controlled by the publisher, in this shape:

```text
<publisher-domain-reversed>.ministryofelsewhere
```

Do not ship `com.pat.two-hundred-crappy-words` as the public identifier. Keep it temporarily during development so the rebrand does not hide existing app-local state. The exact publisher name and namespace must come from the user because they become durable public identity and may be tied to an Apple Developer membership. Changing it requires a copy-only migration of app-local settings, workspace state, daily progress, recovery drafts, and persisted filesystem scope before the new identifier is first used.

### Version policy

Recommended first external beta:

```text
Marketing version: 0.8.0-beta.1
macOS bundle build: 1
Git tag:            v0.8.0-beta.1
```

Use Semantic Versioning while the product is pre-1.0:

- increment the beta suffix for fixes to the same beta (`beta.2`);
- increment the minor version for a meaningful new pre-1.0 product capability;
- increment the patch version for a stable pre-1.0 corrective release;
- keep the macOS bundle build as a monotonically increasing integer, independent of the marketing label.

The roadmap milestone and app version do not have to remain coupled forever. `0.8.0-beta.1` is recommended only because it honestly describes the present pre-release maturity and gives the first beta an understandable baseline.

### Icon direction

The earlier writing-orbit concept is superseded by the approved name. The next step is to review a small set of concepts built around **an understated institution for imagined worlds**.

- Favor a strong, restrained symbol such as an impossible doorway, archival seal, or mapped portal rather than lettering or a literal government building.
- Preserve a connection to writing or catalogued worlds without making the icon genre-specific.
- A restrained ink/charcoal base with one warm violet or starlight accent can relate to the interface without turning a native window utility into branding.
- The silhouette must remain recognizable in monochrome and at 16–32 px.
- The macOS artwork should follow Apple's current rounded-square app-icon conventions, with safe margins and no tiny lettering.
- The favicon should be derived from the same simplified mark rather than retaining a framework logo.

No generated artwork should be adopted until the user chooses a direction from visible concepts.

## Packaging and trust plan

### Track A — no-cost local and private testing

Purpose: development on the current Mac and tightly controlled testing where the tester understands macOS security friction.

- Build an Apple Silicon `.app` or DMG locally.
- Explicitly use ad-hoc signing when needed for Apple Silicon rather than mistaking it for publisher verification.
- State that macOS may require the tester to approve the app in Privacy & Security.
- Do not describe the artifact as verified, notarized, or ready for general download.
- Do not publish this artifact as the public beta.

This path requires no paid account and no credentials, but it creates installation friction and weakens the first-run trust experience.

### Track B — recommended direct-download macOS beta

Purpose: a beta that another writer can download and open through the normal macOS trust path.

- Enroll the chosen individual or organization in the Apple Developer Program.
- Create a **Developer ID Application** certificate for distribution outside the Mac App Store.
- Build with hardened runtime and the narrowest necessary entitlements.
- Sign the application and DMG, submit them for Apple notarization, and staple the ticket.
- Verify the signature, hardened runtime, notarization ticket, and Gatekeeper assessment before publishing.
- Store certificates and notarization credentials outside Git; inject them through the local keychain or protected release secrets.

Apple currently lists the Developer Program at **99 USD per membership year**, with regional pricing possible. This is an account and cost decision, so enrollment remains a separate user gate.

The Mac App Store is not the recommended first channel. Its sandbox and review model would add a separate filesystem-capability project to an app whose core value is working safely with writer-selected ordinary folders.

### Architecture and operating-system support

Recommended first beta support statement:

- **Required:** macOS on Apple Silicon.
- **Minimum macOS:** choose and test a real floor before publishing; recommend macOS 13 or later as a manageable initial support window rather than inheriting Tauri's untested `10.13` default.
- **Optional before wider beta:** add and test Tauri's `universal-apple-darwin` target on an Intel Mac or a suitable clean test environment.
- **Not yet supported:** Windows and Linux distributions, despite generated icon assets and Tauri's theoretical targets.

Architecture should be visible in artifact names until a universal binary is actually produced. No platform should be claimed from configuration alone.

### Updates

Use manually downloaded, signed releases for the first beta. The app has no updater and no approved network requirement. An automatic updater would add a network boundary, signing keys, hosting, failure recovery, and user-facing policy; it should remain a later decision gate after the direct-download process is trustworthy.

## Files affected after approval

### Product and package metadata

- `src-tauri/tauri.conf.json`: friendly product name, final bundle identifier, marketing version, numeric macOS bundle version, minimum supported macOS, icons, and later signing identity.
- `src-tauri/Cargo.toml` and `src-tauri/Cargo.lock`: package version, accurate description, and approved author/publisher metadata.
- `package.json` and `package-lock.json`: matching app version and accurate description while retaining the internal slug.
- `src/app.html`: retain the friendly title and replace the starter favicon.

### Visual assets

- One reviewed high-resolution source artwork file in a documented repository location.
- `src-tauri/icons/*`: regenerate every Tauri platform size from that source with the Tauri icon command.
- `static/favicon.png`: derive a small, legible webview icon from the same mark.
- `static/svelte.svg` and `static/vite.svg`: remove if confirmed unused.

### Distribution configuration and documentation

- A macOS-specific Tauri configuration or the macOS bundle section in `tauri.conf.json` for the chosen support floor, build number, signing identity, and any reviewed entitlements.
- A narrowly scoped entitlements file only if the signed build demonstrably requires it.
- `README.md`, `ROADMAP.md`, `docs/CURRENT.md`, `docs/DECISIONS.md`, the privacy/data-location guide, and a future release checklist.
- A release tag and release notes only when a verified candidate is intentionally published.

No Apple certificate, private key, app-specific password, API key, Team ID secret, or notarization credential belongs in the repository.

## Reproducible commands

The exact release commands should be copied into the release checklist after the identity gate. The current toolchain supports these shapes:

```sh
# Deterministic dependencies and complete local quality gate
npm ci
npm test
npm run check
npm run build
npm audit --omit=dev
cargo test --manifest-path src-tauri/Cargo.toml
cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings

# Apple Silicon development application or DMG
npm run tauri build -- --bundles app
npm run tauri build -- --bundles dmg

# Later, only after both Rust targets and architecture testing exist
rustup target add aarch64-apple-darwin x86_64-apple-darwin
npm run tauri build -- --target universal-apple-darwin --bundles dmg
```

Release verification must include at least:

```sh
codesign --verify --deep --strict --verbose=2 "/path/to/Ministry of Elsewhere.app"
codesign -dvvv --entitlements :- "/path/to/Ministry of Elsewhere.app"
spctl --assess --type execute --verbose=4 "/path/to/Ministry of Elsewhere.app"
xcrun stapler validate "/path/to/Ministry of Elsewhere.app"
xcrun stapler validate "/path/to/Ministry of Elsewhere.dmg"
```

The release checklist must resolve paths from the newly built artifact rather than relying on stale files already present under `target/`. It must also install the DMG on a clean compatible Mac, launch it outside the development checkout, complete the getting-started flow, create and reopen a disposable world, confirm data locations, uninstall the app, and verify the documented project/app-data boundary.

## Approval gate

Before public packaging, approve or revise the remaining decisions:

1. **Approved and implemented:** use **Ministry of Elsewhere** and “Write a little every day. Build something enormous.”
2. Supply the intended public publisher name and a durable reverse-DNS namespace for the bundle identifier.
3. Review and choose an icon direction derived from the new identity.
4. Use `0.8.0-beta.1` with build `1` for the first external beta.
5. Target a notarized direct-download Apple Silicon beta, with macOS 13+ as the proposed initial support floor; defer the App Store, automatic updates, Intel, Windows, and Linux until separately tested and approved.

The next coherent slice is visual identity: create reviewable icon concepts before replacing any asset. Bundle-identifier migration, paid enrollment, credential creation, signing, notarization, and publication remain later explicit gates.

## References

- [Apple: Distributing your app for beta testing and releases](https://developer.apple.com/documentation/technologyoverviews/distribution)
- [Apple: Developer ID](https://developer.apple.com/developer-id/)
- [Apple: Notarizing macOS software before distribution](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution)
- [Apple Developer Program membership](https://developer.apple.com/programs/whats-included/)
- [Tauri: macOS code signing](https://v2.tauri.app/distribute/sign/macos/)
- [Tauri: DMG distribution](https://v2.tauri.app/distribute/dmg/)
