# docs

**The shipped page moved to `index.html` at the repository root. This directory holds no page.**

The foundation build planned `docs/index.html` as the GitHub Pages entry point. The UI build
moved it, because the authoritative ship gate does not accept it there:

    bash "3. GitHub/_staging/_runner/pregate.sh" <repo> --flagship

Six of that gate's checks read `"$D/index.html"` with the path written out rather than resolved:
the doctype check, the em dash and en dash check, the banned colour check, the muted text rule,
and the whole GEO block (canonical link, Open Graph tags, JSON-LD). Only its flagship host check
falls back to `docs/index.html`. A page living only under `docs/` therefore fails the gate that
decides whether this ships, while every local gate passes, which is the worst shape a
disagreement between two checks can have.

The root is also what GitHub Pages serves at the published address when the source is the branch
root, which is the address in the README and in the canonical link.

Consequences, all already applied:

- `scripts/build.mjs` writes `index.html` at the root. It is GENERATED and committed; rebuild
  with `npm run build`, and `npm run build -- --check` fails if the committed page is not what
  the source produces.
- `scripts/_shipped.mjs` lists `index.html` in `SCAN_FILES`, so all four local gates scan the
  same file the authoritative gate scans. The previous version is beside it as
  `_shipped.mjs.bak-2026-09-21`.
- A `.nojekyll` file is not needed at the root for a page with no underscore prefixed paths, and
  none is shipped.
