# Comidia

Aplicación web para controlar calorías, proteína, agua, ejercicio y peso, con análisis de fotos de comida mediante IA.
Es multiusuario: cualquier persona puede crear su cuenta y cada una ve solo sus propios datos.

## Funciones

- **Registro con foto + IA**: tome una foto del plato, agregue datos (porción, preparación, marca) y la IA estima calorías, proteína, carbohidratos y grasas por alimento. Si tiene dudas, hace hasta 3 preguntas y recalcula con sus respuestas. Todo es editable antes de guardar.
- **Registro por texto**: escriba lo que comió ("2 huevos y una marraqueta") y la IA lo calcula, sin necesidad de foto.
- **Código de barras**: escanee el envase con la cámara (o desde una foto, o escribiendo el código). Los datos vienen de [Open Food Facts](https://world.openfoodfacts.org); si el producto no está, se ofrece fotografiar la etiqueta.
- **¿Qué puedo comer?**: la IA propone 3 comidas caseras que calzan con las calorías y la proteína que le quedan en el día.
- **Fotos privadas y efímeras**: la foto solo se usa para el análisis y no se guarda, salvo que la comida se guarde como frecuente.
- **Comidas frecuentes**: guarde lo que come seguido y regístrelo con un toque (o media porción).
- **Agua**: botones de +250 ml, +500 ml y +1 L, con meta diaria (35 ml por kg).
- **Ejercicio**: tipo, duración, intensidad y detalle; el gasto se estima con valores MET y se cuenta al 75%.
- **Peso y cintura**: con instrucciones de medición, gráfico de tendencia (promedio de 7 días) e historial.
- **Calendario**: cada día en color según cumplimiento (en meta, leve exceso, exceso, muy bajo o sin registro) y marca de ejercicio.
- **Resumen semanal**: días registrados, promedio de calorías y proteína, déficit acumulado, baja estimada y cambio real de peso.
- **Meta adaptativa**: la meta se recalcula sola cada día con su peso actual y, cuando hay datos suficientes, con su gasto real observado.
- **Recordatorios**: avisos en el teléfono para tomar agua (cuánto lleva y cuánto le falta) y con las calorías y proteína que le quedan para la meta del día, a las horas que cada persona elija.
- **Exportación**: Excel con todas las hojas (comidas, ejercicio, peso, agua, resumen diario y semanal) y respaldo JSON importable en cualquier instalación.

## Cómo calcula

| Concepto | Método |
|---|---|
| Metabolismo basal | Mifflin-St Jeor (sexo, edad, estatura, peso promedio de 7 días) |
| Actividad diaria | Basal × 1,2 (sedentaria), 1,3 (ligera) o 1,45 (activa), sin contar ejercicio |
| Ejercicio | Gasto neto = (MET − 1) × peso × horas; se suma solo el 75%. Al inicio usa las horas habituales del perfil y, a medida que acumula 28 días, pasa a usar lo registrado |
| Gasto real (adaptativo) | Ingesta promedio − pendiente del peso × 7.700 kcal/kg, con las últimas 4 semanas. Se activa con ≥10 días registrados y ≥4 pesajes en ≥10 días, y gana peso en el cálculo según la calidad de los datos |
| Meta | Gasto − déficit del ritmo elegido (0,5 kg/sem ≈ 550 kcal/día). Nunca bajo el basal ni de 1.500 kcal (hombres) / 1.200 kcal (mujeres). Ritmo limitado al 1% del peso por semana |
| Proteína | Peso × g/kg elegido (1,7 por defecto) |
| Grasas / carbohidratos | 25% de la meta en grasas; el resto en carbohidratos |

La meta también puede fijarse manualmente en Ajustes; la app sigue mostrando la sugerencia automática como referencia.

## Estructura

```
supabase/migrations/001_init.sql        Tablas, seguridad por usuario (RLS) y bucket de fotos
supabase/functions/analyze-meal/        Función que llama a la IA (Anthropic, OpenAI o Gemini)
supabase/functions/send-reminders/      Envía los recordatorios (Web Push con VAPID)
public/sw.js                            Service worker que muestra las notificaciones
src/lib/calc.js                         Todos los cálculos (probados en tests/calc.test.js)
src/pages/                              Hoy, Calendario, Progreso, Ajustes, Acceso
src/components/                         Formularios, gráfico y componentes de interfaz
```

## Instalación

### 1. Supabase

1. Cree un proyecto en [supabase.com](https://supabase.com).
2. En **SQL Editor**, pegue y ejecute en orden los archivos de `supabase/migrations/` (`001_init.sql`, `002_fotos_frecuentes.sql` y `003_recordatorios.sql`).
3. En **Authentication → Providers**, deje activo **Email**. Si no quiere confirmar correos al registrarse, desactive *Confirm email*.
4. En **Authentication → URL Configuration**, ponga en *Site URL* la dirección que le dé Netlify (por ejemplo `https://comidia-xxx.netlify.app`).

### 2. Función de IA

Con la [CLI de Supabase](https://supabase.com/docs/guides/cli):

```bash
supabase login
supabase link --project-ref SU_PROJECT_REF
supabase functions deploy analyze-meal
supabase secrets set AI_PROVIDER=anthropic AI_API_KEY=su_clave
```

`AI_PROVIDER` acepta `anthropic`, `openai` o `gemini`. Opcionalmente defina `AI_MODEL` para elegir el modelo; los valores por defecto están al inicio de `index.ts`. Use un modelo con visión (que acepte imágenes).

La clave de la IA queda solo en Supabase; nunca llega al navegador. La función exige que el usuario haya iniciado sesión.

### 3. Recordatorios (opcional)

Las notificaciones usan Web Push. Se necesitan un par de claves VAPID y un token para el cron, guardados en **Supabase Vault** (nunca en el repositorio).

1. Genere las claves: `npx web-push generate-vapid-keys --json`. Convierta la privada a formato JWK (P-256, con `x`, `y` y `d`).
2. En **SQL Editor**:
   ```sql
   select vault.create_secret('<clave pública>', 'comidia_vapid_publica');
   select vault.create_secret('<clave privada en JWK>', 'comidia_vapid_privada');
   select vault.create_secret('<token largo al azar>', 'comidia_cron_token');
   ```
3. Despliegue la función sin verificación de JWT (ella valida el token del cron o la sesión del usuario):
   `supabase functions deploy send-reminders --no-verify-jwt`
4. Programe el envío cada 15 minutos:
   ```sql
   select cron.schedule('comidia-recordatorios', '*/15 * * * *', $$
     select net.http_post(
       url := 'https://<su-proyecto>.supabase.co/functions/v1/send-reminders',
       headers := jsonb_build_object('Content-Type','application/json','x-cron-token',
         (select decrypted_secret from vault.decrypted_secrets where name='comidia_cron_token')),
       body := '{}'::jsonb, timeout_milliseconds := 20000);
   $$);
   ```
5. En Netlify agregue `VITE_VAPID_PUBLIC_KEY` con la clave pública.

Cada persona los activa en **Ajustes → Recordatorios**. En iPhone (iOS 16.4 o más) primero hay que agregar Comidia a la pantalla de inicio y abrirla desde ese ícono.

### 4. Prueba local

```bash
cp .env.example .env      # complete VITE_SUPABASE_URL y VITE_SUPABASE_KEY
npm install
npm run dev
npm test                  # pruebas de los cálculos
```

`VITE_SUPABASE_KEY` es la clave pública (*publishable* o *anon*) de **Project Settings → API**. Nunca use la clave *service_role* en el frontend.

### 5. Netlify

1. Suba esta carpeta a un repositorio de GitHub y en Netlify elija **Add new site → Import an existing project**.
2. Netlify detecta `netlify.toml` (comando `npm run build`, carpeta `dist`).
3. En **Site configuration → Environment variables**, agregue `VITE_SUPABASE_URL` y `VITE_SUPABASE_KEY`.
4. Despliegue. En el celular, abra la dirección y use **Agregar a pantalla de inicio** para usarla como app.

Alternativa sin GitHub: ejecute `npm run build` con el `.env` completo y arrastre la carpeta `dist` a [app.netlify.com/drop](https://app.netlify.com/drop).

## Para otras personas

- **Usar su instalación**: basta con que creen una cuenta; cada usuario tiene sus datos aislados por RLS. Tenga presente que cada análisis con IA se cobra en su cuenta del proveedor.
- **Montar su propia copia**: siguen esta guía con su propio Supabase, Netlify y clave de IA.
- **Trasladar datos**: Ajustes → *Descargar respaldo JSON* y, en la otra cuenta o instalación, *Importar respaldo* (las fotos no se trasladan).

## Aviso

Las cifras son estimaciones de apoyo. La precisión de la IA mejora mucho cuando se indican gramos, preparación o se fotografía la etiqueta nutricional. La app no reemplaza la evaluación de un nutricionista o médico.

## Amigos, comidas compartidas y suscripción (migración 006)

- **Amigos:** se buscan por nombre en la pestaña Ranking o con el enlace de invitación (`/?invita=CÓDIGO`). El ranking muestra solo a la persona y sus amigos.
- **Comidas compartidas:** al guardar una comida se puede enviar a amigos; ellos la revisan en Hoy y la agregan o la descartan.
- **Suscripción:** 10 días de prueba sin tarjeta (15 si llega invitado; quien invita suma 5 días, hasta 30). Luego $4.990 al mes con Flow. Las cuentas con `suscripciones.gratis = true` no pagan.

Para activar los pagos:

```bash
supabase functions deploy flow --no-verify-jwt
supabase secrets set FLOW_API_KEY=... FLOW_SECRET_KEY=... FLOW_API_URL=https://www.flow.cl/api
```

Sin `FLOW_API_URL` se usa el sandbox de Flow (`https://sandbox.flow.cl/api`). El plan `comidia-mensual` se crea solo en Flow con el primer pago.
