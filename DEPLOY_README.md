# Venus AI Web Test — HTTPS Deployment

This folder is ready to deploy as a static HTTPS site.

## Easiest test: Netlify Drop

1. Sign in to Netlify.
2. Open Netlify Drop.
3. Drag this **uncompressed folder** into the deploy area.
4. Netlify will give you an `https://...netlify.app` URL.
5. Open that URL on an iPhone in Safari.

## iPhone test

- Factual/source-grounded mode should work even if WebGPU is unavailable.
- Local Qwen creative/chat mode requires WebGPU. Safari 26 / iOS 26 added WebGPU support.
- To make it app-like on iPhone: Safari Share -> Add to Home Screen -> keep “Open as Web App” enabled.

## Important

The initial local model download is large (~570 MB). Test factual mode first before loading the local creative model.
