# Ministry of Elsewhere brand assets

`ministry-of-elsewhere-icon-source.png` is the approved 1024 × 1024 source for the application icon. Keep this reviewed source in version control and regenerate platform assets from it rather than resizing an already reduced icon.

The concept was generated with OpenAI's built-in image-generation tool and selected by the product owner on 2026-10-09. The approved direction is the **Cartographic Portal**: a pale doorway opening onto a blue imagined landscape, surrounded by dark flowing contour lines. The source was center-cropped to the icon's clean rounded-square bounds and resized losslessly for the canonical canvas; no manuscript or other private project material was used.

Concept prompt:

> An original macOS writing-app icon built around a cartographic portal: spare map contour lines converge into a clean doorway leading beyond the edge of the known map. Use restrained adult geometric forms, ink-black and pale parchment with one muted celestial-blue accent, generous safe margins, and no text, compass rose, globe, people, government building, ornate filigree, watermark, or existing-brand resemblance.

Regenerate the desktop icon set with:

```sh
npm run tauri icon -- assets/brand/ministry-of-elsewhere-icon-source.png
```

The command also generates unreferenced mobile files. Until mobile is a tested target, retain only the configured desktop assets in `src-tauri/icons/` and derive `static/favicon.png` from the generated `128x128.png`.
