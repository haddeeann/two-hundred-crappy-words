# Application identity and distribution proposal

Status: **PARTIALLY APPROVED — product, visual, version, and platform identity implemented; publisher identity pending**

Last reviewed: 2026-10-09

This document records the current prototype identity and the remaining decisions for the first macOS beta. The user approved **Ministry of Elsewhere** and the line **“Write a little every day. Build something enormous.”** on 2026-10-09, selected the **Cartographic Portal** visual direction, and approved **0.8.0 Beta 1**, build `1`, for Apple Silicon on macOS 13+. Those surfaces are implemented; publisher identity, signing, and publication remain gated.

## Current inventory

| Surface | Current value | Assessment |
| --- | --- | --- |
| Product name in the interface and HTML title | `Ministry of Elsewhere` | Approved and implemented. |
| Tauri `productName` | `Ministry of Elsewhere` | Approved friendly bundle name. |
| Rust and npm package names | `ministry-of-elsewhere` | Approved internal slug; the repository directory may retain its historical name locally. |
| Tauri bundle identifier | `com.pat.two-hundred-crappy-words` | Temporarily preserved so existing app-local history, recovery, settings, and permissions remain available; the publisher namespace has not been approved. |
| Tauri, Rust, and npm version | `0.8.0` | Approved and implemented for Beta 1. |
| Rust description and author | Accurate product description; `you` | Description corrected; public author/publisher remains pending. |
| npm description | Accurate product description | Implemented. |
| License | MIT in `package.json` and repository `LICENSE` | Already explicit. |
| macOS app name | `Ministry of Elsewhere` | Generated from the approved Tauri product name. |
| macOS minimum system version | `13.0` | Approved initial support floor; clean-machine testing remains release-candidate QA. |
| macOS architecture | Apple Silicon (`arm64`) only | Built and exercised on the current Mac; Intel has not been built or tested. |
| macOS icon | Cartographic Portal | Approved source and generated desktop icon set are implemented. |
| Browser/favicon icon | Cartographic Portal | Derived from the same approved source and implemented. |
| Other starter assets | None | Unused Svelte, Tauri, and Vite logo files were removed. |
| Next development DMG name | `Ministry of Elsewhere_0.8.0_aarch64.dmg` | Friendly name, technical version, and Apple Silicon architecture are explicit. |
| Current signing | Ad-hoc/linker signed, no Apple Team ID | Suitable only for development. `spctl --assess` rejects the built app. |
| Notarization and stapling | None | Not release-ready; the early development preview requires manual macOS approval. |
| Development-preview distribution | `13squirrels.netlify.app/ministry-of-elsewhere/` | Clearly labeled ad-hoc preview with manual macOS approval steps and a published SHA-256; not the release-ready public beta. |
| Update mechanism | None | Appropriate for the current offline prototype; first beta can use manual updates. |
| Tested distribution target | macOS on Apple Silicon | Windows, Linux, Intel macOS, and the Mac App Store are not tested products. |

The current build contains no entitlements file, provisioning profile, custom `Info.plist`, release automation, release tags, or signing credentials. Those absences are useful: there is no legacy public identity to migrate and no secret to rotate.

## Proposed first-beta identity

The product-language, version, and initial platform portions are approved. Remaining sections distinguish recommendations from completed decisions.

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

Approved first external beta:

```text
Release label:     0.8.0 Beta 1
Technical version: 0.8.0
macOS bundle build: 1
Git tag:            v0.8.0-beta.1
```

Use Semantic Versioning while the product is pre-1.0:

- increment the beta suffix for fixes to the same beta (`beta.2`);
- increment the minor version for a meaningful new pre-1.0 product capability;
- increment the patch version for a stable pre-1.0 corrective release;
- keep the macOS bundle build as a monotonically increasing integer, independent of the marketing label.

Apple's `CFBundleShortVersionString` requires a numeric period-separated release version, so the packaged app uses `0.8.0`; **Beta 1** is the human release label and `v0.8.0-beta.1` is the planned publication tag. The tag will be created only for an intentionally published candidate. The roadmap milestone and app version do not have to remain coupled forever.

### Icon direction — approved and implemented

The approved **Cartographic Portal** uses a pale arched doorway opening onto a blue landscape, with dark topographic lines flowing toward it. It presents worldbuilding as crossing from mapped knowledge into somewhere not yet known.

- The 1024 px reviewed source lives at `assets/brand/ministry-of-elsewhere-icon-source.png` with its prompt and regeneration instructions.
- Tauri-generated PNG, ICNS, ICO, and Windows tile assets replace the framework placeholders.
- The favicon derives from the same mark.
- Review at 128 px preserves the doorway, landscape, and contour lines; at 32 px the mark remains a recognizable pale portal over dark terrain.
- No mobile assets are retained or claimed while mobile remains unsupported.

## Packaging and trust plan

### Track A — no-cost local and private testing

Purpose: development on the current Mac and tightly controlled testing where the tester understands macOS security friction.

- Build an Apple Silicon `.app` or DMG locally.
- Explicitly use ad-hoc signing when needed for Apple Silicon rather than mistaking it for publisher verification.
- State that macOS may require the tester to approve the app in Privacy & Security.
- Do not describe the artifact as verified, notarized, or ready for general download.
- If this artifact is made reachable for early exploration, label it as a development preview, show the manual macOS approval path before download, publish its digest, and do not describe it as the release-ready public beta.

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

Approved first beta support statement:

- **Required:** macOS on Apple Silicon.
- **Minimum macOS:** macOS 13 or later, explicitly configured rather than inheriting Tauri's untested `10.13` default.
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

### Visual assets — complete

- One reviewed high-resolution source artwork file in a documented repository location. *(Complete.)*
- `src-tauri/icons/*`: regenerate every configured desktop platform size from that source with the Tauri icon command. *(Complete.)*
- `static/favicon.png`: derive a small, legible webview icon from the same mark. *(Complete.)*
- Remove confirmed-unused Svelte, Tauri, and Vite starter artwork. *(Complete.)*

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
3. **Approved and implemented:** use the Cartographic Portal icon direction.
4. **Approved and implemented:** label the first external beta **0.8.0 Beta 1**, package it as version `0.8.0` with build `1`, and reserve `v0.8.0-beta.1` for its eventual release tag.
5. **Approved and implemented:** target a notarized direct-download Apple Silicon beta with macOS 13+ as the initial support floor; defer the App Store, automatic updates, Intel, Windows, and Linux until separately tested and approved.

The remaining identity slice resolves the public publisher name/namespace and designs the bundle-identifier migration. Paid enrollment, credential creation, signing, notarization, tagging, and publication remain later explicit gates.

## References

- [Apple: Distributing your app for beta testing and releases](https://developer.apple.com/documentation/technologyoverviews/distribution)
- [Apple: Developer ID](https://developer.apple.com/developer-id/)
- [Apple: Notarizing macOS software before distribution](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution)
- [Apple Developer Program membership](https://developer.apple.com/programs/whats-included/)
- [Tauri: macOS code signing](https://v2.tauri.app/distribute/sign/macos/)
- [Tauri: DMG distribution](https://v2.tauri.app/distribute/dmg/)
