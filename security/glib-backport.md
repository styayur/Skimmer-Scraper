# Linux desktop GLib backport

Skimmer's GTK3 desktop build uses GLib 0.18.5 with the upstream string-iterator
repair for RUSTSEC-2024-0429 / GHSA-wrw7-89jp-8q8g. The registry advisory lists
0.20.0 as its first fixed release. The API, package name and version of the
locally patched crate stay at 0.18.5. [Advisory](https://github.com/advisories/GHSA-wrw7-89jp-8q8g)

## Upstream upgrade review, 2026-11-28

The latest stable Tauri (2.12.7) requires GTK `^0.18` and WebKitGTK `^2`.
Its Wry runtime 2.12.5 requires GTK `^0.18`, WebKitGTK `=2.0` and Wry
`^0.57.0`. GTK 0.18.2 and WebKitGTK 2.0.2 both require GLib 0.18.
GTK 0.19.0 and WebKitGTK 3.0.0 now use GLib 0.22, and Wry 0.58.2 uses
WebKitGTK 3. A supported upgrade needs the Tauri and runtime constraints to
advance together. Adding GLib 0.20 as a direct dependency leaves the old GTK
types and dependency path in place. [Tauri manifest](https://docs.rs/crate/tauri/2.12.7/source/Cargo.toml)
· [runtime manifest](https://docs.rs/crate/tauri-runtime-wry/2.12.5/source/Cargo.toml)
· [GTK 0.19](https://docs.rs/crate/gtk/0.19.0) · [WebKitGTK 3](https://docs.rs/crate/webkit2gtk/3.0.0)
· [Wry 0.58.2](https://docs.rs/crate/wry/0.58.2)

The locked release graph includes
`skimmer-scraper → tauri 2.12.7 → tauri-runtime-wry 2.12.5 → wry 0.57.3 → webkit2gtk 2.0.2 → gtk 0.18.2 → glib 0.18.5`.
Tauri and tauri-runtime 2.12.4 also reach GTK and WebKitGTK. Windows MSVC has an
empty GLib reverse tree. The Linux-only dev dependency lets the integration test
use the same package from the application lock. The graph check follows normal
and build edges so the test dependency cannot establish runtime reachability.

## Reproduce the source

The crate archive SHA-256 is
`233daaf6e83ae6a12a52055f568f9d7cf4671dabb78ff9560ab6da230ce00ee5`.
Vextessera #77 merged at `63ee1265cbe77b8774c75dc2598a5a4900639ece`.
The selected donor includes #78 at `c3c5b32edb915f2173b7fb2436e3facb64e67b71`.
Its `vendor/glib` Git tree is `f3d610cb5ff8029a8abbceca47e9248a8f803cb6`.
All 121 files, the MIT license and copyright notice, the donor's per-file SHA-256
inventory, and its local patch are copied byte for byte from that revision.
[Crate archive](https://static.crates.io/crates/glib/glib-0.18.5.crate)
· [Donor #77](https://github.com/styayur/vextessera/pull/77) · [Donor #78](https://github.com/styayur/vextessera/pull/78)
· [Pinned donor tree](https://github.com/styayur/vextessera/tree/c3c5b32edb915f2173b7fb2436e3facb64e67b71/vendor/glib)

The upstream change passes a mutable output pointer to GLib's native string
lookup. The donor also makes FFI conversion types and ownership explicit,
establishes a pointer-slice terminator before dropping a removed element,
and adds concrete GString pointer forwarding. Those additional edits are
recorded in their own patch. Its empty Cargo workspace isolates the crate's
upstream tooling. [Upstream fix](https://github.com/gtk-rs/gtk-rs-core/commit/b5a4071e439bef2b5eea76c3aa25e5ae84839e34)
· [Donor's review and license record](https://github.com/styayur/vextessera/blob/c3c5b32edb915f2173b7fb2436e3facb64e67b71/security/glib-backport.md)
· [Local file hashes](glib-provenance.json)

Run from the repository root with Python 3.11+, Git and Cargo. The verifier
applies both recorded patches to a temporary copy of the checksummed registry
archive, reproduces the manifest addition and compares the resulting 121 files
with the donor and the working tree. The application lock represents GLib as a
path package. The archive checksum remains in the provenance record.

```sh
curl -fL https://static.crates.io/crates/glib/glib-0.18.5.crate -o /tmp/skimmer-glib-0.18.5.crate
python3 scripts/verify-glib-backport.py /tmp/skimmer-glib-0.18.5.crate
python3 scripts/glib-target-graphs.py /tmp/skimmer-glib-graphs
```

## Native evidence and scanner disposition

The Linux job builds the release Tauri executable and embedded web assets with
the application lock, runs the optimized Cargo suite including ordinary
forward, reverse and interleaved string iteration, and checks the visible
application window on an isolated X11 display. Tauri's Unix window icon is the
256-pixel PNG frame from the existing Windows icon. The job publishes the
binary digest, linked libraries, runtime log, native test log, target-filtered
Cargo metadata and reverse trees. The Windows desktop and Chromium suites run
on the same pull request. [Linux verification workflow](../.github/workflows/linux-glib.yml)

At the base commit `991138b8c67c188bd47731d6c193142750225818`, the repository's
only configured CodeQL analysis scanned GitHub Actions. Default CodeQL setup
was inactive. The backport workflow adds full branch scans for Rust,
JavaScript/TypeScript, Python and Actions, verifies Rust source coverage, and
retains the SARIF and the Cargo/npm audit reports. Each scanner runs with its
normal rules. An authenticated read of default-branch Dependabot alert #2 on
2026-11-28 returned **open**, medium severity, for runtime GLib 0.18.5 in
`src-tauri/Cargo.lock`. A PR scan and a default-branch alert describe different
revisions. [Dependabot #2](https://github.com/styayur/Skimmer-Scraper/security/dependabot/2)

With RustSec database `c5279d0b0c9e8b70df666eb6d1edbabcfd1176bd`, cargo-audit
0.22.2 reported the GLib advisory as an **unsound** warning on the original
registry lock. Its report on the local path lock omitted that warning. Both
reports carried the chrono and proc-macro-error maintenance warnings. A package
source change affects scanner matching. The checksum reconstruction and native
test provide the source and execution evidence. Keep #71 open while a scanner
finding persists and recheck the authenticated default-branch alert after
integration. Revisit the patch when stable Tauri accepts the updated GTK stack.
[Issue #71](https://github.com/styayur/Skimmer-Scraper/issues/71)
