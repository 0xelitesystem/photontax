# docs

**The shipped page moved to `index.html` at the repository root. This directory holds no page.**
It holds the release notes, [CHANGELOG.md](CHANGELOG.md).

The foundation build planned `docs/index.html` as the GitHub Pages entry point. The UI build
moved it, because the ship gate this repository is released through did not accept it there.

At the time, six of that gate's checks read `index.html` at the repository root with the path
written out rather than resolved: the doctype check, the em dash and en dash check, the banned
colour check, the muted text rule, and the whole GEO block (canonical link, Open Graph tags,
JSON-LD). Only its flagship host check fell back to `docs/index.html`. A page living only under
`docs/` therefore failed the gate that decides whether this ships, while every local gate passed,
which is the worst shape a disagreement between two checks can have. The page stays at the root.

The root is also what GitHub Pages serves at the published address when the source is the branch
root, which is the address in the README and in the canonical link.

Consequences, all already applied:

- `scripts/build.mjs` writes `index.html` at the root. It is GENERATED and committed; rebuild
  with `npm run build`, and `npm run build -- --check` fails if the committed page is not what
  the source produces.
- `scripts/_shipped.mjs` lists `index.html` in `SCAN_FILES`, so all four local gates scan the
  same file the ship gate scans.
- A `.nojekyll` file is not needed at the root for a page with no underscore prefixed paths, and
  none is shipped.
