# Venus AI Web v3.3 — Fixed Bottom Layout

This build fixes the layout jump that happened immediately after the local model finished loading.

## What was happening

The app used four CSS grid rows:

1. Header
2. Model loading strip
3. Main chat area
4. Bottom navigation

When the model loading strip became hidden, browser grid auto-placement moved the
main chat and bottom navigation into the wrong rows. The bottom navigation ended
up occupying the flexible `1fr` row, becoming extremely tall and making the
composer appear to jump upward toward the Venus icon.

## v3.3 fix

The app now uses named grid areas:

- `header`
- `status`
- `main`
- `nav`

Each section is permanently assigned to its own area.

When the loading/status strip disappears:
- its row collapses
- the main chat area remains the flexible row
- the composer stays at the bottom of the chat area
- the bottom navigation stays at its normal height at the bottom of the screen

All v3.2 features are preserved.
