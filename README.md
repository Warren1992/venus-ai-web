# Venus AI Web Test v2.8 — Automatic Model Loading

v2.8 removes the need for users to manually press "Load Venus AI".

## New behavior

When the page opens:

1. The page renders immediately.
2. Source-grounded factual mode is immediately available.
3. After a short 350 ms delay, Venus AI automatically begins loading:
   SmolLM2 135M Instruct q8 via CPU/WASM.
4. The button becomes a loading/status indicator.
5. Once loaded, creative prompts automatically use the local model.

The button remains wired to the loader so it can still be used as a retry control
if automatic loading fails.

## Why

A normal AI assistant should feel ready by default. Users should not need to know
what an AI model is or manually initialize it.

## Bandwidth

The local model is roughly 136 MB. The first visit can therefore require a
noticeable download. Browsers can cache the model assets, so later visits may
be substantially faster depending on browser cache behavior.

No paid AI API is used.
