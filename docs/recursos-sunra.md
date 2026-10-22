# Recursos gráficos generados con Sunra

- **Modelo:** GPT Image 2.5 Flare (`gpt-image-2.5-flare`), calidad alta, 1K, formato 1:1.
- **Proyecto en Sunra:** «Comidia · rediseño oscuro».
- **Generaciones usadas:** 8 de un máximo de 15, todas aprovechadas.
- **Conversión:** con Chrome (canvas → WebP), sin dependencias nuevas. Todas las imágenes quedan bajo 80 KB.
- **Coherencia:** las ilustraciones de peso y ranking usaron la de comidas como imagen de referencia.

| Archivo | Uso | Tamaño |
|---|---|---|
| `public/img/vacio-comidas.webp` | Estado vacío: sin comidas en el día (Hoy) | 480 px, 11 KB |
| `public/img/vacio-peso.webp` | Estado vacío: sin peso registrado (Hoy y Progreso › Peso) | 480 px, 7 KB |
| `public/img/vacio-ranking.webp` | Estado vacío: ranking sin puntos | 480 px, 5 KB |
| `public/img/textura-lineas.webp` | Textura de marca para bloques destacados (bloque principal de Hoy, líder del ranking, acceso) | 640 px, 9 KB |
| `public/img/icono-app.webp` | Propuesta de ícono de app (referencia) | 512 px, 7 KB |
| `public/icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `apple-touch-icon.png` | Íconos del manifest, generados desde la propuesta | 192, 512, 512 y 180 px |

## Prompts

### vacio-comidas
> Minimal flat illustration on a solid near-black background (#050605). An empty round plate seen from directly above, drawn with confident off-white line work, a fork and a knife beside it. A single vivid green (#33e07c) line, like a subway map line, curves around the plate with three small hollow station circles on it. Hand-inked line quality, 2 colors only (off-white and green), lots of empty black space, centered composition. No text, no letters, no numbers, no gradients, no glow, no shadows.

### vacio-peso (con vacio-comidas como referencia)
> Same visual style as the reference image: minimal flat illustration on a solid near-black background (#050605), confident hand-inked off-white line work, one vivid green (#33e07c) accent line. Subject: a bathroom scale seen from directly above, with two footprint outlines on it and a blank round dial; a single green subway-map style line with two small hollow station circles enters from the left and stops at the scale. Lots of empty black space, centered. No text, no letters, no numbers on the dial, no gradients, no glow, no shadows.

### vacio-ranking (con vacio-comidas como referencia)
> Same visual style as the reference image: minimal flat illustration on a solid near-black background (#050605), confident hand-inked off-white line work, one vivid green (#33e07c) accent line. Subject: an empty three-step winners podium drawn in off-white outlines, with a small crown outline floating above the top step; a single green subway-map style line with hollow station circles climbs the three steps like a route. Lots of empty black space, centered. No text, no letters, no numbers on the podium, no gradients, no glow, no shadows.

### textura-lineas
> Seamless tileable background pattern, very subtle and dark: on solid near-black (#050605), thin dark green lines (#0f2a1a) forming an abstract subway map network, straight segments at 0, 45 and 90 degrees, rounded corners, a few hollow station circles, sparse, low contrast, even density across the whole square so it tiles. Flat vector, no text, no letters, no gradients, no glow, no vignette.

### icono-app
> App icon design, square, full bleed solid near-black background (#050605). Centered: a round plate seen from above drawn as a thick off-white ring, with a single vivid green (#33e07c) hand-drawn leaf resting on the right edge of the rim, and a short thick green arc on the inner ring like a progress line. Bold, simple, readable at small size, flat vector, generous padding for a maskable safe zone. No text, no letters, no gradients, no glow, no shadows, no rounded corners on the canvas.

### Exploración de lettering (solo referencia, no se usan en la app)
El logotipo final es un SVG vectorial dibujado a mano (`public/logo.svg` y el componente `Logo`). Se tomó la idea 1: las hojas como puntos de las íes.

1. *lettering-1:* «Logotype lettering study for a food tracking app named "comidia" (all lowercase). Heavy condensed grotesque letters in off-white on a pure black background. The dots of both letters i are drawn by hand as small vivid green leaves (#33e07c), slightly irregular, like ink brush. Flat vector, centered, generous black margin, no other text, no mockup, no shadows.»
2. *lettering-2:* «Logotype lettering study for the word "COMIDIA" in uppercase. Tall, very heavy condensed sans serif, off-white on near-black background. The letter O is drawn as a plate seen from above with a hand-drawn vivid green rim (#33e07c) and a tiny green leaf resting on it. Flat vector, centered, no other text, no mockup, no gradients.»
3. *lettering-3:* «Logotype lettering study for the word "comidia" in lowercase, wide extended heavy grotesque, off-white on black. A single vivid green (#33e07c) hand-drawn line runs under the word like a subway line with small station dots, and the last letter a ends in a leaf-shaped terminal. Flat vector, centered, no other text, no mockup.»
