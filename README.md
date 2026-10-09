# Venus AI Web v2.9.2 — Android Style + Safer Chat Quality

This build ports the look and much of the behavior of the Venus AI Android app
into the browser while preserving the working SmolLM2 135M + Wikipedia hybrid.

## Ported from the Android app

- dark Venus UI with warm orange/gold accents
- VENUS AI header and local-model status badge
- tap VENUS AI to start a new conversation
- Meet Venus empty-chat screen and suggestion cards
- Android-style chat bubbles
- + / microphone / VOICE / send composer
- on-device text-to-speech "Read aloud"
- browser speech-recognition dictation when supported
- hands-free Voice conversation mode when browser speech recognition is supported
- persistent local conversation threads
- Threads drawer with search, rename, and delete
- persistent local Memory screen
- "Remember that ..." commands save memory
- saved memory is injected into local creative chat context
- Settings screen with features/privacy/model status
- automatic SmolLM2 135M loading on page open
- canonical Wikipedia factual mode remains unchanged

## Not yet identical to Android

The web build currently shows the Android attachment menu, but local photo vision,
live-camera analysis, and reliable background OS reminders are not ported yet.
The browser version does not pretend those features are working; those buttons
explicitly identify them as the next web port.

## Deploy

Upload all files to the existing GitHub Pages repository root. Make sure
`app-v2.9.js` exists and `index.html` points to it.


## v2.9.1 hotfix

The v2.9 Android-style build successfully loaded SmolLM2 135M, but creative
generation ended with:

    Venus AI error: cleanText is not defined

The UI and model were working. The final response-cleanup helper was accidentally
omitted during the Android-style rebuild.

v2.9.1 restores `cleanText()` and uses the new script filename
`app-v2.9.1.js` so browsers do not reuse the buggy cached v2.9 JavaScript.


## v2.9.2 chat-quality fix

The 135M model successfully generated in v2.9.1, but simple conversational
questions could hallucinate fake dates, schedules, missed messages, and other
personal context.

v2.9.2:
- handles common greetings / "how are you?" locally with clean deterministic replies
- tells the local model never to invent appointments, dates, prior messages, people,
  relationships, or personal history
- excludes error messages from future model context
- limits the tiny model to a small four-message context window
- uses deterministic generation for ordinary chat and sampling only for creative tasks
- cache-busts the main script as `app-v2.9.2.js`
