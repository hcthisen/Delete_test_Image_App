# Branding Assets

This directory centralizes the visual identity assets used across the Journal.vet application.

## Provide Your Own Assets

Binary artwork is intentionally not committed to the repository so the project can stay lightweight and avoid licensing or brand-control issues. Add your custom files to this folder when branding the product for a specific deployment.

Recommended filenames that the application already references:

- `favicon.svg` / `favicon.ico` – used for browser tabs, bookmarks, and pinned tiles.
- `social-card.png` – default Open Graph / social media preview image (1200×630 px).

## Updating the Branding

1. Place your assets in this folder using the filenames above so that the application can continue referencing them without code changes.
2. Ensure `favicon.ico` remains a square image (ideally 32×32 or 64×64 pixels). If you only have an SVG, export a small `.ico` version as well for legacy browser support.
3. Provide a `social-card.png` that is 1200×630 pixels to satisfy most social media platforms.
4. After adding the assets, commit the changes and redeploy. No additional configuration is required because the layout metadata automatically picks up these filenames.

## Adding More Assets

If you introduce additional branding files (e.g., app store icons, press kits), store them in this directory and update the project metadata or documentation accordingly.
