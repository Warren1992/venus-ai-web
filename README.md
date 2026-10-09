# Venus AI Web Test v2.5 — Cache-Busted WASM

The v2.4 screenshot revealed that the browser loaded the new v2.4 HTML but was
still executing an older cached `app.js`.

Evidence:
- The page displayed the new q8 / CPU-WASM model label from v2.4 HTML.
- The runtime failure text was the old message:
  "Close Firefox completely before retrying the local model."
- That message does not exist in the actual v2.4 WASM loader.

Therefore the previous test did not reliably test v2.4's CPU/WASM path.

## v2.5 fix

- Main JavaScript is renamed to `app-v2.5.js`.
- `index.html` points to that new filename.
- CSS and manifest references include `?v=2.5`.
- Document no-cache meta hints are included.
- The old `app.js` is no longer executed.
- The actual v2.4 CPU/WASM q8 loader is preserved.

## How to update GitHub

Upload ALL v2.5 files to the repository root and overwrite existing files.
Because `app-v2.5.js` is a new filename, make sure it appears in GitHub after
the commit.

After GitHub Pages redeploys, refresh the live site.

The load progress should literally start with:

    v2.5: Starting Qwen3 0.6B q8 in safe CPU/WASM mode…

If it fails, the failure description should say:

    v2.5 WASM loader ran, but the local q8 model failed to load.

Seeing either phrase proves the browser is running the new JavaScript.

Then test:
    Write a short story about a floating city on Venus.
