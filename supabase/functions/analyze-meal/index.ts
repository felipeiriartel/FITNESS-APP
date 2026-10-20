// Comidia · Función de IA
// Modos:
//   "analizar" (por defecto): foto (base64) y/o descripción → calorías y macros estimados.
//   "sugerir": lo que le queda del día → 3 ideas de comida que calcen.
// Proveedor configurable con secretos de Supabase:
//   AI_PROVIDER = anthropic | openai | gemini   (por defecto: anthropic)
//   AI_API_KEY  = clave del proveedor
//   AI_MODEL    = modelo (opcional; ver valores por defecto abajo)
// Cada llamada queda en la tabla ia_uso (usuario, modo, tokens, ok) y en los registros, para controlar el costo.

const DEFAULT_MODELS: Record<string, string> = {
  anthropic: "claude-sonnet-5-5",
  openai: "gpt-4.1",
  gemini: "gemini-2.5-flash",
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYSTEM_ANALIZAR = `Eres un nutricionista experto en estimar el contenido nutricional de comidas a partir de fotos y descripciones. Conoces bien la comida chilena y latinoamericana (porotos, pastel de choclo, completos, sopaipillas, marraqueta, cazuela, empanadas, etc.), además de productos envasados comunes en Chile.

Reglas:
1. Identifica cada componente visible o mencionado y estima su cantidad en gramos o mililitros. Usa como referencia el tamaño del plato (aprox. 26 cm), cubiertos, manos, vasos o envases.
2. Si la persona entrega datos (gramos, tazas, preparación, marca), esos datos mandan sobre lo que ves.
3. Si aparece una etiqueta nutricional legible, usa sus valores multiplicados por la porción consumida.
4. Considera aceite, mantequilla, salsas y aderezos típicos de la preparación aunque no se vean (por ejemplo, frituras y salteados). Indícalo en "supuestos".
5. En bebidas, estima el volumen y el azúcar. El agua sola tiene 0 kcal.
6. Entrega valores numéricos únicos (no rangos), redondeados: kcal a la unidad, macros a 1 decimal.
7. "confianza" va de 0 a 1 y refleja qué tan seguro estás del total de calorías.
8. Incluye como máximo 3 "preguntas", solo si la respuesta cambiaría la estimación en más de 15%. Si no, deja la lista vacía.
9. Sé breve: como máximo 4 "supuestos" y 3 "preguntas", cada uno en una frase corta. En "cantidad" escribe solo la medida (ej: "150 g", "2 puñados ≈ 120 g").
10. Responde ÚNICAMENTE con un objeto JSON válido, sin texto adicional ni bloques de código, con esta forma exacta:
{"plato":"nombre corto","items":[{"nombre":"","cantidad":"ej: 150 g","gramos":150,"kcal":0,"proteina_g":0,"carbohidratos_g":0,"grasas_g":0}],"confianza":0.8,"supuestos":[""],"preguntas":[""]}`;

const SYSTEM_SUGERIR = `Eres un nutricionista chileno que propone comidas caseras, simples y realistas para alguien que cuenta calorías y quiere cuidar su masa muscular.

Reglas:
1. Propón exactamente 3 opciones distintas para el tipo de comida indicado, que quepan en lo que le queda del día. Cada opción debe usar entre el 60% y el 100% de las kcal disponibles para esa comida (si quedan más de 900 kcal, apunta a 450-800 kcal por opción).
2. Prioriza la proteína si le falta proteína en el día.
3. Usa ingredientes fáciles de encontrar en Chile (supermercado o feria) y preparaciones de menos de 20 minutos, salvo que la persona pida otra cosa.
4. Si quedan menos de 150 kcal, propone opciones muy livianas (infusiones, verduras, yogur sin azúcar) y recuerda en "descripcion" que no es necesario comer si no tiene hambre.
5. Nunca propongas saltarse comidas ni dietas extremas.
6. Ingredientes con cantidades concretas (gramos, unidades, tazas).
7. Responde ÚNICAMENTE con un objeto JSON válido, sin texto adicional, con esta forma exacta:
{"sugerencias":[{"nombre":"","descripcion":"una frase","ingredientes":["150 g de pechuga de pollo"],"kcal":0,"proteina_g":0,"carbohidratos_g":0,"grasas_g":0}]}`;

const ITEM_SCHEMA = {
  type: "object",
  properties: {
    nombre: { type: "string" },
    cantidad: { type: "string" },
    gramos: { type: "number" },
    kcal: { type: "number" },
    proteina_g: { type: "number" },
    carbohidratos_g: { type: "number" },
    grasas_g: { type: "number" },
  },
  required: ["nombre", "cantidad", "gramos", "kcal", "proteina_g", "carbohidratos_g", "grasas_g"],
};

const TOOLS = {
  analizar: {
    name: "registrar_estimacion",
    description: "Entrega la estimación nutricional de la comida.",
    input_schema: {
      type: "object",
      properties: {
        plato: { type: "string" },
        items: { type: "array", items: ITEM_SCHEMA },
        confianza: { type: "number" },
        supuestos: { type: "array", items: { type: "string" } },
        preguntas: { type: "array", items: { type: "string" } },
      },
      required: ["plato", "items", "confianza", "supuestos", "preguntas"],
    },
  },
  sugerir: {
    name: "entregar_sugerencias",
    description: "Entrega las 3 sugerencias de comida.",
    input_schema: {
      type: "object",
      properties: {
        sugerencias: {
          type: "array",
          items: {
            type: "object",
            properties: {
              nombre: { type: "string" },
              descripcion: { type: "string" },
              ingredientes: { type: "array", items: { type: "string" } },
              kcal: { type: "number" },
              proteina_g: { type: "number" },
              carbohidratos_g: { type: "number" },
              grasas_g: { type: "number" },
            },
            required: ["nombre", "descripcion", "ingredientes", "kcal", "proteina_g", "carbohidratos_g", "grasas_g"],
          },
        },
      },
      required: ["sugerencias"],
    },
  },
};

type Restante = { kcal?: number; proteina_g?: number; carbohidratos_g?: number; grasas_g?: number };
type Body = {
  mode?: "analizar" | "sugerir";
  image_base64?: string;
  media_type?: string;
  description?: string;
  meal_type?: string;
  answers?: string;
  restante?: Restante;
  preferencias?: string;
};
type Uso = { entrada: number; salida: number };
type Resultado = { raw: string; parsed?: Record<string, unknown>; truncado?: boolean; uso: Uso };
type Modo = "analizar" | "sugerir";

/** Usuario de la sesión: el JWT ya lo verificó Supabase (verify_jwt = true); aquí solo se lee. */
function usuarioDe(req: Request): string | null {
  try {
    const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
    const parte = token.split(".")[1];
    if (!parte) return null;
    const datos = JSON.parse(atob(parte.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(parte.length / 4) * 4, "=")));
    return typeof datos.sub === "string" ? datos.sub : null;
  } catch {
    return null;
  }
}

/** Guarda una fila en ia_uso por cada llamada. Si falla, no afecta la respuesta al usuario. */
async function registrarUso(fila: Record<string, unknown>) {
  const url = Deno.env.get("SUPABASE_URL");
  const clave = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !clave) return;
  try {
    const r = await fetch(`${url}/rest/v1/ia_uso`, {
      method: "POST",
      headers: { apikey: clave, Authorization: `Bearer ${clave}`, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify(fila),
    });
    if (!r.ok) console.warn("ia_uso:", r.status, (await r.text()).slice(0, 200));
  } catch (e) {
    console.warn("ia_uso:", String(e));
  }
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

async function readJson(r: Response) {
  const text = await r.text();
  try {
    return JSON.parse(text);
  } catch {
    console.error("Respuesta no JSON del proveedor:", r.status, text.slice(0, 500));
    throw new Error(`Respuesta no válida del proveedor de IA (HTTP ${r.status}).`);
  }
}

function textoAnalizar(b: Body): string {
  const parts: string[] = [];
  if (b.meal_type) parts.push(`Tipo de comida: ${b.meal_type}.`);
  if (b.description?.trim()) parts.push(`Información de la persona: ${b.description.trim()}`);
  if (b.answers?.trim()) parts.push(`Respuestas a tus preguntas anteriores: ${b.answers.trim()}`);
  if (!b.image_base64) parts.push("No hay foto; estima solo con la descripción.");
  parts.push("Estima calorías y macronutrientes. Responde solo con el JSON.");
  return parts.join("\n");
}

function textoSugerir(b: Body): string {
  const r = b.restante ?? {};
  const v = (n?: number) => Math.max(0, Math.round(Number(n) || 0));
  return [
    `Tipo de comida: ${b.meal_type ?? "cualquiera"}.`,
    `Le quedan hoy: ${v(r.kcal)} kcal, ${v(r.proteina_g)} g de proteína, ${v(r.carbohidratos_g)} g de carbohidratos y ${v(r.grasas_g)} g de grasas.`,
    b.preferencias?.trim() ? `Lo que tiene, quiere o no quiere: ${b.preferencias.trim().slice(0, 300)}` : "",
    "Propón 3 opciones. Responde solo con el JSON.",
  ].filter(Boolean).join("\n");
}

async function callAnthropic(key: string, model: string, system: string, b: Body, text: string, modo: Modo): Promise<Resultado> {
  const content: unknown[] = [];
  if (b.image_base64) {
    content.push({
      type: "image",
      source: { type: "base64", media_type: b.media_type ?? "image/jpeg", data: b.image_base64 },
    });
  }
  content.push({ type: "text", text });
  const tool = TOOLS[modo];
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      system: `${system}\n\nEntrega el resultado llamando siempre a la herramienta ${tool.name}, sin texto adicional.`,
      tools: [tool],
      // El modelo actual no acepta forzar la herramienta (type "tool"/"any"); se usa "auto"
      // y el sistema le pide llamarla. Si responde en texto, se lee el JSON igual (extractJson).
      tool_choice: { type: "auto" },
      messages: [{ role: "user", content }],
    }),
  });
  const data = await readJson(r);
  if (!r.ok) throw new Error(data?.error?.message ?? `Error del proveedor (${r.status})`);
  const bloques = (data.content ?? []) as { type: string; text?: string; input?: Record<string, unknown> }[];
  const herramienta = bloques.find((c) => c.type === "tool_use");
  const raw = bloques.filter((c) => c.type === "text").map((c) => c.text ?? "").join("");
  return {
    raw,
    parsed: herramienta?.input && typeof herramienta.input === "object" ? herramienta.input : undefined,
    truncado: data.stop_reason === "max_tokens",
    uso: { entrada: data.usage?.input_tokens ?? 0, salida: data.usage?.output_tokens ?? 0 },
  };
}

async function callOpenAI(key: string, model: string, system: string, b: Body, text: string): Promise<Resultado> {
  const content: unknown[] = [{ type: "text", text }];
  if (b.image_base64) {
    content.push({
      type: "image_url",
      image_url: { url: `data:${b.media_type ?? "image/jpeg"};base64,${b.image_base64}` },
    });
  }
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content },
      ],
    }),
  });
  const data = await readJson(r);
  if (!r.ok) throw new Error(data?.error?.message ?? `Error del proveedor (${r.status})`);
  const uso: Uso = { entrada: data.usage?.prompt_tokens ?? 0, salida: data.usage?.completion_tokens ?? 0 };
  return { raw: data.choices?.[0]?.message?.content ?? "", truncado: data.choices?.[0]?.finish_reason === "length", uso };
}

async function callGemini(key: string, model: string, system: string, b: Body, text: string): Promise<Resultado> {
  const parts: unknown[] = [];
  if (b.image_base64) {
    parts.push({ inline_data: { mime_type: b.media_type ?? "image/jpeg", data: b.image_base64 } });
  }
  parts.push({ text });
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: "POST",
      headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.2, maxOutputTokens: 4096 },
      }),
    },
  );
  const data = await readJson(r);
  if (!r.ok) throw new Error(data?.error?.message ?? `Error del proveedor (${r.status})`);
  const raw = (data.candidates?.[0]?.content?.parts ?? [])
    .map((p: { text?: string }) => p.text ?? "")
    .join("");
  const uso: Uso = {
    entrada: data.usageMetadata?.promptTokenCount ?? 0,
    salida: data.usageMetadata?.candidatesTokenCount ?? 0,
  };
  return { raw, truncado: data.candidates?.[0]?.finishReason === "MAX_TOKENS", uso };
}

/** Intenta leer un objeto JSON desde el texto de la IA. Devuelve null si no es posible. */
function extractJson(raw: string): Record<string, unknown> | null {
  const cleaned = raw.replace(/```(?:json)?/gi, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  const candidato = cleaned.slice(start, end + 1);
  for (const intento of [candidato, candidato.replace(/,\s*([}\]])/g, "$1")]) {
    try {
      return JSON.parse(intento);
    } catch {
      /* siguiente intento */
    }
  }
  return null;
}

const num = (v: unknown, d = 0) => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : d;
};
const r1 = (n: number) => Math.round(n * 10) / 10;
const strList = (v: unknown, max = 5) =>
  (Array.isArray(v) ? v : []).map(String).filter((s) => s.trim().length > 0).slice(0, max);

function normalizarAnalisis(p: Record<string, unknown>) {
  const items = (Array.isArray(p.items) ? p.items : []).map((it: Record<string, unknown>) => ({
    nombre: String(it.nombre ?? "Alimento"),
    cantidad: String(it.cantidad ?? ""),
    gramos: num(it.gramos),
    kcal: Math.round(num(it.kcal)),
    proteina_g: r1(num(it.proteina_g)),
    carbohidratos_g: r1(num(it.carbohidratos_g)),
    grasas_g: r1(num(it.grasas_g)),
  }));
  const total = items.reduce(
    (a, it) => ({
      kcal: a.kcal + it.kcal,
      proteina_g: r1(a.proteina_g + it.proteina_g),
      carbohidratos_g: r1(a.carbohidratos_g + it.carbohidratos_g),
      grasas_g: r1(a.grasas_g + it.grasas_g),
    }),
    { kcal: 0, proteina_g: 0, carbohidratos_g: 0, grasas_g: 0 },
  );
  return {
    plato: String(p.plato ?? items[0]?.nombre ?? "Comida"),
    items,
    total,
    confianza: Math.min(1, num(p.confianza, 0.5)),
    supuestos: strList(p.supuestos),
    preguntas: strList(p.preguntas, 3),
  };
}

function normalizarSugerencias(p: Record<string, unknown>) {
  const lista = (Array.isArray(p.sugerencias) ? p.sugerencias : []).slice(0, 3).map((s: Record<string, unknown>) => ({
    nombre: String(s.nombre ?? "Opción"),
    descripcion: String(s.descripcion ?? ""),
    ingredientes: strList(s.ingredientes, 8),
    kcal: Math.round(num(s.kcal)),
    proteina_g: r1(num(s.proteina_g)),
    carbohidratos_g: r1(num(s.carbohidratos_g)),
    grasas_g: r1(num(s.grasas_g)),
  }));
  return { sugerencias: lista };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método no permitido." }, 405);

  const uso = { user_id: usuarioDe(req), modo: "analizar", foto: false, proveedor: null as string | null, modelo: null as string | null,
    intentos: 0, tokens_entrada: 0, tokens_salida: 0, ok: false, error: null as string | null };
  try {
    let body: Body;
    try {
      body = (await req.json()) as Body;
    } catch (e) {
      console.error("Cuerpo de la solicitud inválido:", String(e));
      return json({ error: "La solicitud no es un JSON válido. Revise comillas y llaves del texto enviado." }, 400);
    }
    const modo = body.mode === "sugerir" ? "sugerir" : "analizar";
    uso.modo = modo;
    if (modo === "analizar" && !body.image_base64 && !body.description?.trim()) {
      return json({ error: "Envíe una foto o una descripción del alimento." }, 400);
    }
    if (modo === "sugerir") delete body.image_base64;
    if (body.image_base64 && body.image_base64.length > 8_000_000) {
      return json({ error: "La imagen es demasiado grande." }, 413);
    }

    const provider = (Deno.env.get("AI_PROVIDER") ?? "anthropic").toLowerCase();
    const key = Deno.env.get("AI_API_KEY");
    if (!key) return json({ error: "Falta configurar AI_API_KEY en Supabase." }, 500);
    const model = Deno.env.get("AI_MODEL") || DEFAULT_MODELS[provider];
    if (!model) return json({ error: `Proveedor no soportado: ${provider}` }, 500);

    uso.proveedor = provider;
    uso.modelo = model;
    uso.foto = Boolean(body.image_base64);
    const system = modo === "sugerir" ? SYSTEM_SUGERIR : SYSTEM_ANALIZAR;
    const text = modo === "sugerir" ? textoSugerir(body) : textoAnalizar(body);
    const llamar = (t: string): Promise<Resultado> => {
      if (provider === "anthropic") return callAnthropic(key, model, system, body, t, modo);
      if (provider === "openai") return callOpenAI(key, model, system, body, t);
      return callGemini(key, model, system, body, t);
    };
    if (!["anthropic", "openai", "gemini"].includes(provider)) {
      return json({ error: `Proveedor no soportado: ${provider}` }, 500);
    }

    // Hasta 2 intentos: si la respuesta llega cortada o mal formada, se pide de nuevo, más breve.
    let parsed: Record<string, unknown> | null = null;
    for (let intento = 1; intento <= 2 && !parsed; intento++) {
      const t = intento === 1 ? text : `${text}\nTu respuesta anterior no se pudo leer. Responde de nuevo, más breve, con la estructura exacta.`;
      const res = await llamar(t);
      uso.intentos = intento;
      uso.tokens_entrada += res.uso.entrada;
      uso.tokens_salida += res.uso.salida;
      parsed = res.parsed ?? extractJson(res.raw);
      console.log(JSON.stringify({
        evento: "uso_ia", modo, proveedor: provider, modelo: model, foto: Boolean(body.image_base64), intento,
        tokens_entrada: res.uso.entrada, tokens_salida: res.uso.salida, truncado: Boolean(res.truncado), ok: Boolean(parsed),
      }));
      if (parsed && res.truncado && modo === "analizar" && !Array.isArray(parsed.items)) parsed = null;
      if (!parsed) console.error("Respuesta de la IA no interpretable:", res.truncado ? "(cortada por largo)" : "", res.raw.slice(0, 1500));
    }
    if (!parsed) {
      uso.error = "respuesta no interpretable";
      await registrarUso(uso);
      return json({
        error: "La IA no pudo entregar un resultado válido. Intente de nuevo o divida la comida en dos registros.",
      }, 502);
    }
    uso.ok = true;
    await registrarUso(uso);
    return json(modo === "sugerir" ? normalizarSugerencias(parsed) : normalizarAnalisis(parsed));
  } catch (e) {
    console.error("Error en analyze-meal:", e instanceof Error ? e.message : String(e));
    if (uso.proveedor) {
      uso.error = (e instanceof Error ? e.message : String(e)).slice(0, 300);
      await registrarUso(uso);
    }
    return json({ error: e instanceof Error ? e.message : "Error inesperado." }, 500);
  }
});
