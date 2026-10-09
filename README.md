# Venus AI Web Test v2.6 — Smaller Local AI

v2.5 finally produced a clean diagnostic:

    Can't create a session.
    ERROR_CODE: 6
    ERROR_MESSAGE: std::bad_alloc

That means the browser/runtime could not allocate enough memory to create the
Qwen3 0.6B q8 inference session.

## v2.6 change

Creative local AI now uses:

    onnx-community/SmolLM2-360M-Instruct-ONNX
    dtype: q8
    CPU/WASM

The q8 model is roughly 363 MB instead of Qwen3 0.6B q8 at roughly 618 MB.

To further reduce runtime pressure:
- max generation length is reduced to 96 new tokens
- Qwen-specific thinking controls are removed
- the working factual Wikipedia path is unchanged
- the script is renamed to `app-v2.6.js` to prevent stale caching

## Retest

1. Upload all v2.6 files to the GitHub repository root.
2. Confirm `app-v2.6.js` exists.
3. Wait for GitHub Pages to redeploy.
4. Refresh the live site.
5. Click Load Venus AI.
6. Ask:

       Write a short story about a floating city on Venus.

If it loads, this becomes the practical free local creative model for the web
version.

If even SmolLM2 360M q8 hits `std::bad_alloc`, the next step should be an even
smaller model or making local creative AI optional only on devices with enough
browser memory.

No paid AI API is used.
