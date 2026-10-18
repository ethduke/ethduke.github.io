# ethduke.github.io

Source for my project page at <https://ethduke.github.io/>.

Plain HTML and CSS. No build step or package installation.

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

## Publishing

Push reviewed commits to `main`. In GitHub Pages, use **Deploy from a branch → main → /(root)**.

## IPFS mirror

Export the committed website into an ignored folder:

```sh
node scripts/prepare-ipfs.mjs
```

`dist/ipfs/` contains exactly the seven public site files. It excludes Git metadata, local instructions, hooks, scripts, and this README. `dist/ipfs-manifest.json` records the source commit and file hashes outside the upload folder.

Add and recursively pin **only `dist/ipfs/`**, using IPFS Desktop or Kubo with CIDv1 and raw leaves. Verify the resulting `/ipfs/<CID>/` URL before assigning `ipfs://<CID>` to an ENS contenthash record. The ENS record change must be reviewed and signed by the name's controller. Do not upload the repository root.

The mirror retains the GitHub site's canonical URL and identical content. Keep the CID pinned on an available node or pinning service; local pinning alone depends on the local node staying reachable. Future site updates require a new export, pin, and ENS contenthash update.

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
