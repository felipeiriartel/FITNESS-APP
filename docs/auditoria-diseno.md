# Auditoría del diseño anterior (antes del rediseño oscuro)

Revisión hecha con la skill Impeccable sobre capturas a 390 px con datos de ejemplo.

## Lo que funcionaba
- La lógica de la pantalla Hoy era correcta: las calorías restantes, el detalle (consumido, meta, gasto) y los macros estaban en el primer bloque.
- Las áreas táctiles eran generosas (52 px en botones y 46 px en fichas) y se respetaba prefers-reduced-motion.
- Los textos estaban bien escritos, en «usted», con vocabulario chileno.

## Problemas
1. **Identidad genérica.** Fondo crema verdoso, tarjetas blancas redondeadas y un anillo de progreso centrado: la plantilla de cualquier app de fitness.
2. **Jerarquía plana.** El anillo, las cuatro cifras del costado y los tres macros pesan casi lo mismo. La cifra restante (770) compite con 1.260, 2.030 y 2.753.
3. **Emojis como sistema de íconos.** Hay 76 líneas con emojis en src/. Se ven distinto en cada teléfono, conviven con los íconos SVG de línea y rompen la coherencia (📷, 🔲, ⭐ y 💡 en una misma fila).
4. **Todas las tarjetas iguales.** Comidas, Agua, Ejercicio y Peso usan el mismo contenedor y el mismo título; nada indica orden ni prioridad.
5. **Sombras «3D» duras** (`box-shadow: 0 4px 0`) en botones y acciones, con una tecla amarilla flotante en el +. Le dan aspecto de juguete y suman ruido.
6. **Modo oscuro secundario.** El oscuro era una variante automática gris verdosa (#0e1712) que no se diseñó por sí misma.
7. **Ranking.** Degradado verde con sombra difusa en la tarjeta del líder, filas cebra y una fila propia con sombra de color: tres tratamientos distintos en una sola lista.
8. **Estados vacíos** resueltos con un emoji y una frase. No orientan.
9. **Tipografía.** Bricolage Grotesque tiene personalidad, pero aquí se usaba en pesos medios y tamaños chicos, sin protagonismo de las cifras.

## Opciones de tipografía (títulos y cifras)
| Opción | Carácter | A favor | En contra |
|---|---|---|---|
| **Big Shoulders** (elegida) | Grotesca condensada nacida de la señalética de Chicago; variable en peso (100–900) y tamaño óptico (10–72) | Es una letra de letrero de andén, justo el mundo de la dirección «línea de Metro». Las cifras son altas y estrechas: «1.240» cabe enorme en 390 px. El eje óptico mantiene legibles los rótulos chicos | Las minúsculas son estrechas; se usa sobre todo en mayúsculas y números |
| Archivo (ancho variable 62–125) | Grotesca neutra con eje de ancho, de condensada a expandida | Una sola familia sirve para condensada y expandida | Es demasiado neutra: con el ancho al mínimo se ve correcta pero sin voz |
| Barlow Condensed | Condensada redondeada, inspirada en carteles de California | Muy legible y con muchos pesos | Es la condensada que más se usa en apps deportivas, así que cae en lo genérico |

**Texto:** Atkinson Hyperlegible Next, diseñada para lectores con baja visión. Distingue bien 1/l/I y 0/O en cifras y gramos, y se lee bien a pleno sol. Se descartaron Inter, Roboto y Poppins por el encargo.

## Dirección elegida
«Línea de Metro»: el día se lee como una línea con estaciones (desayuno, almuerzo, once, cena), con el verde como la línea y la cifra restante como letrero de andén. Las reglas detalladas están en DESIGN.md.
