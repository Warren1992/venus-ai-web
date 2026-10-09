# Venus AI Web Test v2.4 — Safe Local AI

This build fixes the WebGPU generation crash found after v2.3 correctly routed
creative prompts to the local model.

## What failed in v2.3

The creative prompt:

    Write a short story about a floating city on Venus.

correctly reached Qwen3, but ONNX Runtime Web/WebGPU failed with a validation
error while creating a GPU bind group.

## v2.4 architecture

Factual questions:
- canonical Wikipedia grounding
- no local LLM generation needed

Creative/chat requests:
- Qwen3 0.6B
- q8 quantization
- CPU/WASM browser inference
- no WebGPU dependency
- no paid AI API

CPU/WASM will usually be slower than WebGPU, but it is the safer cross-browser
path for this prototype.

## Retest

1. Upload/overwrite the v2.4 files in the existing GitHub repository.
2. Wait for GitHub Pages to redeploy.
3. Refresh the public Venus AI site.
4. Click Load Creative AI.
5. Ask:

       Write a short story about a floating city on Venus.

The response may take noticeably longer than the WebGPU build, especially on a
phone. That is expected.

No paid AI API is used.
