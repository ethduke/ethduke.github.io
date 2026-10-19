# ethduke.github.io

Source for my project page at <https://ethduke.github.io/>.

Plain HTML and CSS. Rendering the portfolio needs no framework. Node 24 and the locked publishing dependencies are used only for validation and releases.

## Local preview

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

Open <http://127.0.0.1:8000>.

## Editing

- `index.html`: page content and JSON-LD project metadata.
- `styles.css`: layout, typography, and light/dark colors.
- `index.md`: text portfolio with selected projects and supplementary notes.
- `llms.txt`: short index for tools reading the site.
- `robots.txt` and `sitemap.xml`: crawler discovery.
- `publish.config.json`: public IPNS identity and repository binding; no private keys.
- `.github/workflows/publish.yml`: Pages, IPFS and IPNS delivery.

Keep project descriptions and links consistent across HTML, JSON-LD, and Markdown. Keep the public identity limited to `ethduke`; personal documents and local instructions stay outside Git.

## Before committing

Enable the local hooks once per clone; the checks use Node.js built-ins:

```sh
git config core.hooksPath .githooks
node scripts/check-public.mjs
```

Stage explicit files and review the diff. The pre-commit hook checks staged content, the approved file list, and the 100 KiB file limit for portfolio sources.
Reviewed `program-lens/` static assets have exact path/SHA-256 pins and a
1 MiB per-file limit; every asset still passes the public-content checks. The commit-message hook requires one lowercase sentence with a type prefix:

```text
feat: add a minimal static project portfolio
fix: improve mobile spacing
docs: update project notes
```

Use the handle and GitHub noreply address for repository-local Git identity. Hooks need enabling on each clone; review is still required.

## Automatic publishing

This repository is the source of truth for GitHub Pages, the ENS website and the Gwei website. The old `gwei-onepager` repository is a legacy mirror; do not edit it separately.

Push reviewed changes to `main`. **Publish portfolio** validates the public-content boundary, runs publisher regression tests and the dependency audit, and exports committed files only. It deploys the approved Pages files, verifies the live homepage and stylesheet, pins the seven-file IPFS bundle to Pinata, checks the exact CID and public gateway bytes, then signs and publishes the shared IPNS record. A stale commit cannot advance the pointer. PRs get checks and export builds without deployment credentials.

GitHub Pages must use **GitHub Actions** as its publishing source. The `github-pages` and `ipfs-publish` environments permit the `main` branch only. Publishing is automatic as explicitly authorized; no manual environment reviewer is configured. ENS/Gwei wallet transactions are outside CI.

The IPFS bundle contains exactly `index.html`, `styles.css`, `favicon.svg`, `index.md`, `llms.txt`, `robots.txt` and `sitemap.xml`. Program Lens remains linked to its separate GitHub Pages path. Hooks, scripts, private app source and local files never enter either website artifact. GitHub Pages additionally includes the reviewed compiled Program Lens files and `.nojekyll`.

### One-time operator setup

1. Install Node 24 and run `npm ci --ignore-scripts`.
2. With a local Kubo node running, `node scripts/setup-ipns.mjs` creates a dedicated Ed25519 website key, imports a backup into the local Kubo keystore, stores its base64 protobuf bytes in the encrypted `IPNS_PRIVATE_KEY` GitHub environment secret, and writes only its public name to `publish.config.json`. The script does not use a wallet key and will not replace an existing identity.
3. In the repository's `ipfs-publish` environment, add **`PINATA_JWT`**. Scope the Pinata token to public-file upload and read (`org:files:write` and `org:files:read`). Do not grant admin or wallet permissions. The workflow uploads a CAR to the public network and reuses an existing pin when the CID is unchanged. It does not delete older pins or purchase additional storage.
4. Run **Publish portfolio** on `main` and verify the **Pin IPFS and publish IPNS** job is green. Its summary gives the CID, stable IPNS URI, previous CID and record expiry. Only then set both `bitcoinduke.eth` Content Hash and `bitduke.gwei` Set Website to that same `ipns://...` URI, reviewing and signing each one-time transaction in the owner wallet.

`IPNS_PRIVATE_KEY` controls only this website pointer. Never put it in Git, artifacts, action caches or logs. It can be recovered from the dedicated local Kubo keystore backup named in `publish.config.json`; preserve that keystore securely. A compromised IPNS key requires a replacement name and new ENS/Gwei record transactions. Pausing delivery means disabling the workflow or removing its publishing secret; it does not undo already-published data.

### Refreshes, verification and recovery

The same workflow runs every 12 hours to refresh the signed IPNS record, reusing the existing content pin. Records have a 72-hour validity and a 5-minute cache TTL. They use a monotonically increasing signed sequence and are validated after publishing through the delegated routing API. Gateway caching can delay when all URLs show the same release; multi-platform deployment is not atomic.

GitHub schedules are best effort. To prevent the 60-day inactivity shutdown on public repositories, a separate job with no publishing secrets creates an empty commit after 40 idle days, preserving the identical content tree. Only that keepalive job has `contents: write`; deploy jobs cannot write repository content. A non-forced update protects concurrent edits. Watch Actions failures: durable pinning alone does not renew an IPNS name. For stronger uptime guarantees, move the refresh task to an always-on publisher using the same protected IPNS key.

Each run retains `portfolio-release` (30 days) and a sanitized `ipfs-publication` record (90 days). That record contains public commit/CID/provenance and fixed failure codes, never tokens or private-key bytes. A timeout after publication is explicitly unverified: resolve the IPNS name and reconcile its CID before retrying. Upload and IPNS PUT requests are not blindly repeated. If Pages deploys but IPFS fails, the previous IPNS target remains until a verified publish succeeds, except when a PUT has an unverified result.

To restore an earlier site, revert its content change on `main`; the normal pipeline publishes the restored content with a newer IPNS sequence. Older CIDs remain pinned. A rerun of an older source commit is rejected. Use **Run workflow** on current `main` to retry an infrastructure failure after inspecting its publication record.

For a manual reviewed export, `node scripts/prepare-ipfs.mjs` still creates `dist/ipfs/` and an adjacent source/hash manifest. Upload only this folder, never the repository root. `npm run build` creates both allowlisted website artifacts from the committed tree.

## Program Lens demo

`program-lens/` contains only the compiled static demo published at
<https://ethduke.github.io/program-lens/>. All cases, input text, labels,
annotation evidence and prediction scores are synthetic, with explicit notices
in the interface. The app source stays in a separate private repository; real
datasets, original labels, review evidence, local configuration and secrets
are not part of this site. Demo review notes stay in the visitor's browser and
can be exported locally. No API, RPC, backend or model inference is used.

To update the demo, review a fresh synthetic-only static export, replace only
this directory, update its exact asset hashes in `scripts/check-public.mjs`,
and run both working-tree and staged public-content checks before committing.
The root `.nojekyll` makes the `_next/` asset directory available on Pages.
