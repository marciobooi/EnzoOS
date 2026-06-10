# Hi-Fi Streamer UI Design System

This application is a Kiosk-mode touchscreen interface for an audiophile Hi-Fi streamer running on a Raspberry Pi.

## Hardware Constraints
*   **Resolution:** 1400x320 pixels (Ultra-wide aspect ratio)
*   **Input:** Capacitive Touchscreen (fingers are large, so buttons need padding and space)
*   **Environment:** Typically viewed from a few feet away in a living room

## Layout Requirements
The UI must be highly optimized for the 1400x320 letterbox format. It must fit perfectly on one screen without scrolling.
*   **Left Section (Width: ~300px):** Source selection buttons (MPD, Spotify, AirPlay, TIDAL, Web Radio) and System Settings buttons (DSP, Network). Buttons must be large and touchable.
*   **Center Section (Flex-grow):** "Now Playing" area. Album Art (square, large but fitting within the 320px height constraint), Track Title, Artist, Album name. Minimalist typography, very legible.
*   **Right Section (Width: ~300px):** Media Controls (Previous, Play/Pause, Next, Shuffle, Repeat) and Volume slider. Below them, a visual space for VU Meters.

## Aesthetic Guidelines
*   **Vibe:** Premium Audio Equipment, High-end audiophile gear (think Naim, McIntosh, or Rose HiFi).
*   **Theme:** Dark mode strictly. Deep blacks, glowing accents (Blue or Amber).
*   **Effects:** Use glassmorphism (translucency over background blur) but ensure it DOES NOT block click events (no overlapping z-indexes).
*   **Buttons:** Must have obvious active/pressed states.

## Technical Warnings
*   Avoid `absolute` positioning that bleeds out of containers and captures pointer events (like `pointer-events-auto` on overlays).
