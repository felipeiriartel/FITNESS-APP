# Comidia · Sistema de diseño «Línea de Metro»

El día se lee como una línea de Metro: las comidas son estaciones, el verde es la línea y la cifra restante es el letrero del andén. Solo modo oscuro. Todos los valores viven en variables de `:root` en `src/styles.css`.

## Color
| Token | Valor | Uso |
|---|---|---|
| `--bg` | `#050605` | Fondo de la app |
| `--s1` / `--s2` / `--s3` | `#0d0f0e` / `#151816` / `#1f2320` | Bloques, controles y pistas; negros escalonados |
| `--line` / `--line-2` | `#262a27` / `#3b413d` | Filetes de 1 px (separación y bordes de control) |
| `--ink` / `--muted` / `--dim` | `#f4f6f3` / `#a7b0a9` / `#868f88` | Texto principal, secundario y terciario (todos ≥ 4,5:1 sobre `--s1`) |
| `--linea` | `#33e07c` | Acción y detalle: botón +, botón principal, estado activo, línea del día, cifras clave (11,9:1 sobre `--bg`) |
| `--on-linea` | `#03140a` | Texto sobre verde |
| `--choclo` | `#ffd23f` | Solo acento puntual: racha, corona del líder, «¿Qué puedo comer?» |
| `--ciruela` / `--zapallo` / `--aceite` | `#c792f2` / `#ff9f45` / `#43c9dc` | Proteína / carbohidratos (y ejercicio) / grasas |
| `--aji` / `--cielo` / `--agua` | `#ff6352` / `#8fb1ff` / `#58aefc` | Exceso / muy bajo / agua |

Los fondos suaves de estado se arman con `color-mix(in srgb, <color> 15–22%, var(--s1))`. No hay degradados decorativos, vidrio ni sombras difusas genéricas; la única sombra es la del aviso flotante.

## Tipografía
- **Big Shoulders** (variable, 500–900, opsz 10–72): títulos en mayúsculas, cifras y botones grandes. Cifras protagonistas a 900: kcal restantes `clamp(5.2rem, 27vw, 7.4rem)`, peso `clamp(4.4rem, 22vw, 6rem)`, líder del ranking `clamp(2.6rem, 13vw, 3.4rem)`.
- **Atkinson Hyperlegible Next** (400–800): todo el texto. Base de 17 px y 1,5 de interlineado.
- Rótulos de dato: 0,7–0,8 rem, mayúsculas, espaciado de 0,04–0,08 em, en `--muted`.

## Forma y ritmo
- Radios: `--r-blk` 16 px (bloques destacados), `--r-card` 14 px, `--r-ctl` 10 px, `--r-chip` 8 px.
- Espaciado: `--e1`…`--e6` = 4, 8, 12, 16, 24 y 32 px. Separación base entre bloques: 12 px; relleno de bloque: 16 px.
- Áreas táctiles de 44 px como mínimo.

## Componentes (variantes cerradas)
- **Botón:** normal (`--s2` con borde `--line-2`), `primary` (verde), `ghost` (texto verde), `danger`, `small` (44 px) y `big` (58 px, rótulo de letrero en Big Shoulders mayúsculas). Al tocar: `scale(.97)`.
- **Bloque:** `card` (`--s1`, filete `--line`). Los bloques destacados `anden` y `lider` llevan la textura de marca y el filete `--line-2`.
- **Distintivo de sección** (`badge`): cuadrado de 32 px con el ícono en el color de su línea, como el número de línea de un letrero.
- **Ficha** (`chip`): borde fino; activa, en verde lleno.
- **Selector** (`seg`): la opción activa lleva una barra inferior verde de 3 px.
- **Hoja** (`Modal`): `--s1`, cabecera fija con filete, pie fijo con la acción principal.
- **Encabezado de página:** negro sólido, título Big Shoulders en mayúsculas y filete inferior.
- **Barra inferior:** negra, con indicador verde que se desliza a la pestaña activa y botón + verde de 60 px.
- **Estado vacío** (`Vacio`): ilustración de Sunra (fundida con `mix-blend-mode: lighten`), título en mayúsculas, una frase útil y la acción que lo resuelve.

## Firma: la línea del día
En Hoy, una vía de 6 px muestra lo consumido. Cada tipo de comida es una estación hueca en su posición de kcal acumuladas, con su ícono debajo; la meta es una terminal blanca. Si se pasa de la meta, el tramo sobrante va en `--aji`.

## Íconos
`Icon` en `src/components/ui.jsx`: 48 íconos propios en grilla de 24, trazo 2, puntas y uniones redondeadas, un solo path por ícono. No se usan emojis ni librerías.

## Movimiento
Curva `--ease-out` `cubic-bezier(0.16, 1, 0.3, 1)`, 140 ms en estados y 260 ms en transiciones. Hay entrada de pestaña (opacidad y 10 px), indicador deslizante, hojas desde abajo y barras que crecen con `scaleX`. Con `prefers-reduced-motion` todo se reduce a casi cero.

## Recursos
`public/logo.svg` y el componente `Logo` (hojas en los puntos de las íes), `public/icon.svg`, y `public/img/*.webp` (ver `docs/recursos-sunra.md`).
