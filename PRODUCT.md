# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Un grupo cercano de unas 7 personas en Chile que quieren bajar de peso. Usan la app en el celular, varias veces al día: al comer (foto del plato o texto), al tomar agua, al entrenar y al pesarse. Abren la app con una pregunta concreta: cuánto me queda hoy.

## Product Purpose

Comidia es una PWA para registrar calorías, proteína, agua, ejercicio y peso, con estimación por IA a partir de una foto del plato, texto libre o código de barras. El éxito es que cada persona registre todos los días y termine el día dentro de su meta.

## Positioning

Meta diaria adaptativa (se recalcula con el peso real y el gasto observado), registro por foto guiada con escala del plato, y un ranking mensual entre amigos que premia los días en meta, no el peso.

## Operating Context

Uso a una mano en el teléfono, en la mesa o en la calle, con sesiones cortas. Ranking en vivo durante el mes; el marcador vuelve a cero el día 1. Los demás solo ven nombre y puntos, nunca calorías ni peso.

## Capabilities and Constraints

- React 18 + Vite, Supabase (auth, datos, funciones de IA), service worker con recordatorios Web Push.
- Funciones: registro por foto con IA, por texto, por código de barras (Open Food Facts), comidas frecuentes, sugerencias de qué comer, agua, ejercicio (MET), peso y cintura, calendario por estado del día, resumen semanal, ranking mensual, exportación Excel/JSON.
- Las fotos no se guardan salvo en comidas frecuentes.
- Estados del día: en meta, leve exceso (≤10 %), exceso, muy bajo, sin registro.

## Brand Commitments

- Nombre: Comidia.
- Textos en español de Chile, tratando de «usted».
- Vocabulario local: once, colación, pichanga, marraqueta.
- Nombres de color con raíz chilena en el código: palta, choclo, ciruela, zapallo, aceite, ají.

## Evidence on Hand

No hay testimonios, cifras de uso ni prensa. No se deben inventar.

## Product Principles

1. Lo primero es cuánto le queda del día.
2. Registrar debe tomar segundos; la foto es el camino principal.
3. Estimaciones honestas: todo resultado de IA es editable antes de guardar.
4. La competencia es entre amigos y premia la constancia, no el peso.
5. La privacidad entre participantes es estricta.

## Accessibility & Inclusion

Áreas táctiles de al menos 44 px, contraste WCAG AA y respeto de prefers-reduced-motion.
