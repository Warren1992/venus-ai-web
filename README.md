# Venus AI Web Test v2.3 — Mobile Routing Fix

This build fixes the routing bug found during the first Android GitHub Pages test.

## Bug found

The prompt:

    Write a short story about a floating city on Venus.

was incorrectly routed to Wikipedia factual mode because the old factual classifier
treated the word `city` as evidence that the request was factual.

## Fix

Creative/action intent now takes priority.

Requests containing or beginning with terms such as:

- write
- create
- make
- draft
- compose
- brainstorm
- imagine
- invent
- design
- story
- fiction
- poem
- script
- scene
- roleplay

are routed to the local Qwen3 model even when they mention places, planets, cities,
history, or other factual nouns.

Factual questions such as:

    What is the largest planet in the Solar System?

continue to use the canonical Wikipedia grounding path.

## Mobile retest

After uploading this build to GitHub Pages:

1. Load the creative AI model.
2. Ask:
   `Write a short story about a floating city on Venus.`
3. It should generate creative prose locally instead of returning Wikipedia facts.

No paid AI API is used.
