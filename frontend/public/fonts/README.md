# Fonts folder

The card design calls for two specific Khmer fonts:
- **Khmer OS Moul Light** — used for the player's name and role
- **Khmer OS Siem Reap** — used for the address and other body text

These are well-known free Khmer fonts, but they aren't hosted on Google Fonts'
CDN, so this project can't fetch them automatically. To use the exact fonts:

1. Get the two `.ttf` (or `.woff2`) files — from the Cambodian government's
   Unicode font page (https://www.khmeros.info/en/fonts) or another source
   you trust.
2. Drop them into this folder with these exact names:
   - `KhmerOSMoulLight.ttf`
   - `KhmerOSSiemReap.ttf`
3. That's it — `src/index.css` already has `@font-face` rules pointing here,
   so the ID card will pick them up automatically once the files exist.

**Until you add them:** the card falls back to Google Fonts' "Moul" (close to
Moul Light, for the name/role) and "Nokora" (a clean, similar body font, for
addresses etc.) — both loaded automatically, so everything still looks
correct even without the exact OS fonts.
