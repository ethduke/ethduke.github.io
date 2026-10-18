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

Stage explicit files and review the diff. The pre-commit hook checks staged content, the approved file list, and the 100 KiB file limit. The commit-message hook requires one lowercase sentence with a type prefix:

```text
feat: add a minimal static project portfolio
fix: improve mobile spacing
docs: update project notes
```

Use the handle and GitHub noreply address for repository-local Git identity. Hooks need enabling on each clone; review is still required.

## Publishing

Push reviewed commits to `main`. In GitHub Pages, use **Deploy from a branch → main → /(root)**.
