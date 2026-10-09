# Venus AI Web Test v2.7 — Ultra-Light Local AI

v2.6 failed during model loading with:

    Error in input stream

This is different from v2.5's `std::bad_alloc`. The v2.6 failure occurred
while the model was still downloading/streaming.

## v2.7 changes

Creative local AI now uses:

    onnx-community/SmolLM2-135M-Instruct-ONNX
    q8
    CPU/WASM

The q8 model is about 136 MB, versus about 363 MB for the 360M model used in
v2.6.

Additional stability changes:
- one automatic retry for stream/network/fetch/abort errors
- 72 max new tokens for creative replies
- unique script name `app-v2.7.js`
- factual Wikipedia mode remains unchanged

## Retest

1. Upload every v2.7 file to the GitHub repository root.
2. Confirm `app-v2.7.js` exists.
3. Wait for GitHub Pages to redeploy.
4. Refresh Venus AI.
5. Click Load Venus AI.
6. Ask:

       Write a short story about a floating city on Venus.

If the first download stream fails, Venus AI should automatically try once more.

No paid AI API is used.
