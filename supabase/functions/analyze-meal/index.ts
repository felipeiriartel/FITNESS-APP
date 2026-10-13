// Comedia · Función de análisis nutricional con IA
// Recibe una foto (base64) y/o una descripción, y devuelve calorías y macros estimados.
// Proveedor configurable con secretos de Supabase:
//   AI_PROVIDER = anthropic | openai | gemini   (por defecto: anthropic)
//   AI_API_KEY  = clave del proveedor
//   AI_MODEL    = modelo (opcional; ver valores por defecto abajo)

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

const SYSTEM = `Eres un nutricionista experto en estimar el contenido nutricional de comidas a partir de fotos y descripciones. Conoces bien la comida chilena y latinoamericana (porotos, pastel de choclo, completos, sopaipillas, marraqueta, cazuela, empanadas, etc.), además de productos envasados comunes en Chile.

Reglas:
1. Identifica cada componente visible o mencionado y estima su cantidad en gramos o mililitros. Usa como referencia el tamaño del plato (aprox. 26 cm), cubiertos, manos, vasos o envases.
2. Si la persona entrega datos (gramos, tazas, preparación, marca), esos datos mandan sobre lo que ves.
3. Si aparece una etiqueta nutricional legible, usa sus valores multiplicados por la porción consumida.
4. Considera aceite, mantequilla, salsas y aderezos típicos de la preparación aunque no se vean (por ejemplo, frituras y salteados). Indícalo en "supuestos".
5. En bebidas, estima el volumen y el azúcar. El agua sola tiene 0 kcal.
6. Entrega valores numéricos únicos (no rangos), redondeados: kcal a la unidad, macros a 1 decimal.
7. "confianza" va de 0 a 1 y refleja qué tan seguro estás del total de calorías.
8. Incluye como máximo 3 "preguntas", solo si la respuesta cambiaría la estimación en más de 15%. Si no, deja la lista vacía.
9. Responde ÚNICAMENTE con un objeto JSON válido, sin texto adicional ni bloques de código, con esta forma exacta:
{"plato":"nombre corto","items":[{"nombre":"","cantidad":"ej: 150 g","gramos":150,"kcal":0,"proteina_g":0,"carbohidratos_g":0,"grasas_g":0}],"confianza":0.8,"supuestos":[""],"preguntas":[""]}`;

type Body = {
  image_base64?: string;
  media_type?: string;
  description?: string;
  meal_type?: string;
  answers?: string;
};

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

function buildUserText(b: Body): string {
  const parts: string[] = [];
  if (b.meal_type) parts.push(`Tipo de comida: ${b.meal_type}.`);
  if (b.description?.trim()) parts.push(`Información de la persona: ${b.description.trim()}`);
  if (b.answers?.trim()) parts.push(`Respuestas a tus preguntas anteriores: ${b.answers.trim()}`);
  if (!b.image_base64) parts.push("No hay foto; estima solo con la descripción.");
  parts.push("Estima calorías y macronutrientes. Responde solo con el JSON.");
  return parts.join("\n");
}

async function callAnthropic(key: string, model: string, b: Body, text: string) {
  const content: unknown[] = [];
  if (b.image_base64) {
    content.push({
      type: "image",
      source: { type: "base64", media_type: b.media_type ?? "image/jpeg", data: b.image_base64 },
    });
  }
  content.push({ type: "text", text });
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 2000,
      system: SYSTEM,
      messages: [{ role: "user", content }],
    }),
  });
  const data = await readJson(r);
  if (!r.ok) throw new Error(data?.error?.message ?? `Error del proveedor (${r.status})`);
  return (data.content ?? [])
    .filter((c: { type: string }) => c.type === "text")
    .map((c: { text: string }) => c.text)
    .join("");
}

async function callOpenAI(key: string, model: string, b: Body, text: string) {
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
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content },
      ],
    }),
  });
  const data = await readJson(r);
  if (!r.ok) throw new Error(data?.error?.message ?? `Error del proveedor (${r.status})`);
  return data.choices?.[0]?.message?.content ?? "";
}

async function callGemini(key: string, model: string, b: Body, text: string) {
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
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [{ role: "user", parts }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.2 },
      }),
    },
  );
  const data = await readJson(r);
  if (!r.ok) throw new Error(data?.error?.message ?? `Error del proveedor (${r.status})`);
  return (data.candidates?.[0]?.content?.parts ?? [])
    .map((p: { text?: string }) => p.text ?? "")
    .join("");
}

function extractJson(raw: string): Record<string, unknown> {
  const cleaned = raw.replace(/```(?:json)?/gi, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  try {
    if (start === -1 || end === -1) throw new Error("sin objeto JSON");
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch (e) {
    console.error("Respuesta de la IA no interpretable:", String(e), raw.slice(0, 1500));
    throw new Error("La IA devolvió un formato inesperado. Intente nuevamente.");
  }
}

const num = (v: unknown, d = 0) => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : d;
};
const r1 = (n: number) => Math.round(n * 10) / 10;

function normalize(p: Record<string, unknown>) {
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
  const strList = (v: unknown) =>
    (Array.isArray(v) ? v : []).map(String).filter((s) => s.trim().length > 0).slice(0, 5);
  return {
    plato: String(p.plato ?? items[0]?.nombre ?? "Comida"),
    items,
    total,
    confianza: Math.min(1, num(p.confianza, 0.5)),
    supuestos: strList(p.supuestos),
    preguntas: strList(p.preguntas).slice(0, 3),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método no permitido." }, 405);

  try {
    let body: Body;
    try {
      body = (await req.json()) as Body;
    } catch (e) {
      console.error("Cuerpo de la solicitud inválido:", String(e));
      return json({ error: "La solicitud no es un JSON válido. Revise comillas y llaves del texto enviado." }, 400);
    }
    if (!body.image_base64 && !body.description?.trim()) {
      return json({ error: "Envíe una foto o una descripción del alimento." }, 400);
    }
    if (body.image_base64 && body.image_base64.length > 8_000_000) {
      return json({ error: "La imagen es demasiado grande." }, 413);
    }

    const provider = (Deno.env.get("AI_PROVIDER") ?? "anthropic").toLowerCase();
    const key = Deno.env.get("AI_API_KEY");
    if (!key) return json({ error: "Falta configurar AI_API_KEY en Supabase." }, 500);
    const model = Deno.env.get("AI_MODEL") || DEFAULT_MODELS[provider];
    if (!model) return json({ error: `Proveedor no soportado: ${provider}` }, 500);

    const text = buildUserText(body);
    let raw: string;
    if (provider === "anthropic") raw = await callAnthropic(key, model, body, text);
    else if (provider === "openai") raw = await callOpenAI(key, model, body, text);
    else if (provider === "gemini") raw = await callGemini(key, model, body, text);
    else return json({ error: `Proveedor no soportado: ${provider}` }, 500);

    return json(normalize(extractJson(raw)));
  } catch (e) {
    console.error("Error en analyze-meal:", e instanceof Error ? e.message : String(e));
    return json({ error: e instanceof Error ? e.message : "Error inesperado." }, 500);
  }
});
