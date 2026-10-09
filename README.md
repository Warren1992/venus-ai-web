# Venus AI Web v3.0 — Local Vision

Venus AI Web v3.0 adds all three image features from the Android-style + menu:

1. Photo library
2. Take photo
3. Live camera

## How local web vision works

The browser loads `Xenova/vit-gpt2-image-captioning` on demand with
Transformers.js. The image stays in the browser and the local vision model
produces a visual description.

For an attached photo:
- Venus unloads the text model first to reduce browser memory pressure.
- Local Vision describes the image.
- The vision model is released.
- SmolLM2 135M is restored from browser cache.
- For simple "what do you see?" prompts, Venus returns the local visual
  description directly.
- For other questions, SmolLM2 is instructed to answer only from that visual
  description and not invent details.

## Photo library

Tap + -> Photo library.
The selected image is resized locally before analysis and appears as an
attachment preview above the composer.

## Take photo

Tap + -> Take photo.
On mobile browsers this requests a camera capture input. The captured image is
then attached and analyzed exactly like a library photo.

## Live camera

Tap + -> Live camera.

The live camera screen includes:
- rear/front camera switching
- Analyze Frame
- Auto Scan every ~6.5 seconds
- a local vision response panel
- Use Frame in Chat

Live camera keeps the vision model loaded while the camera screen is open.
When the camera closes, Venus releases the vision model and restores the normal
local chat model.

## Important limitation

This first web vision implementation is caption-based rather than a full
visual-question-answering model. It is useful for broad scene/object
descriptions, but it is not intended for reliable OCR, tiny text, precise
counting, medical interpretation, or safety-critical image analysis.

No paid AI API is used.
