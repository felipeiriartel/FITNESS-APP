// Comidia · Suscripción mensual con Flow (flow.cl).
//
// Rutas (desplegar con verify_jwt = false; la sesión se valida aquí mismo):
//   POST /flow            { accion: "iniciar" | "sincronizar" | "cancelar" }  (requiere sesión)
//   POST /flow/retorno    Flow vuelve aquí después de que la persona registra su tarjeta.
//   POST /flow/aviso      Flow avisa aquí cada cobro del plan (urlCallback del plan).
//
// Secretos: FLOW_API_KEY, FLOW_SECRET_KEY y, opcionales, FLOW_API_URL (por defecto sandbox),
// APP_URL (por defecto https://comidia.netlify.app), FLOW_PLAN_ID (comidia-mensual), FLOW_MONTO (4990).
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const FLOW_API = (Deno.env.get("FLOW_API_URL") ?? "https://sandbox.flow.cl/api").replace(/\/$/, "");
const FLOW_KEY = Deno.env.get("FLOW_API_KEY") ?? "";
const FLOW_SECRET = Deno.env.get("FLOW_SECRET_KEY") ?? "";
const APP_URL = (Deno.env.get("APP_URL") ?? "https://comidia.netlify.app").replace(/\/$/, "");
const PLAN_ID = Deno.env.get("FLOW_PLAN_ID") ?? "comidia-mensual";
const MONTO = Number(Deno.env.get("FLOW_MONTO") ?? "4990");
const BASE_FUNCION = `${SUPABASE_URL}/functions/v1/flow`;

const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const volverApp = (estado: string) => new Response(null, { status: 303, headers: { Location: `${APP_URL}/?suscripcion=${estado}` } });

// ---------- Cliente de la API de Flow ----------
async function firmar(params: Record<string, string>) {
  const cadena = Object.keys(params).sort().map((k) => k + params[k]).join("");
  const llave = await crypto.subtle.importKey("raw", new TextEncoder().encode(FLOW_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const firma = await crypto.subtle.sign("HMAC", llave, new TextEncoder().encode(cadena));
  return [...new Uint8Array(firma)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function flow(metodo: "GET" | "POST", servicio: string, datos: Record<string, string | number> = {}) {
  const params: Record<string, string> = { apiKey: FLOW_KEY };
  for (const [k, v] of Object.entries(datos)) if (v !== undefined && v !== null && v !== "") params[k] = String(v);
  params.s = await firmar(params);
  const cuerpo = new URLSearchParams(params);
  const r = metodo === "GET"
    ? await fetch(`${FLOW_API}/${servicio}?${cuerpo}`)
    : await fetch(`${FLOW_API}/${servicio}`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: cuerpo });
  const texto = await r.text();
  let res: Record<string, unknown> = {};
  try { res = JSON.parse(texto); } catch { /* respuesta no JSON */ }
  if (!r.ok) throw new Error(`Flow ${servicio}: ${res.message ?? texto.slice(0, 200)} (${r.status})`);
  return res;
}

/** Crea el plan mensual en Flow la primera vez. */
async function asegurarPlan() {
  try {
    await flow("GET", "plans/get", { planId: PLAN_ID });
  } catch {
    await flow("POST", "plans/create", {
      planId: PLAN_ID, name: "Comidia mensual", currency: "CLP", amount: MONTO,
      interval: 3, interval_count: 1, trial_period_days: 0, days_until_due: 3,
      charges_retries_number: 3, urlCallback: `${BASE_FUNCION}/aviso`,
    });
  }
}

/** Fecha de Flow ("2026-11-30 00:00:00") a ISO, en hora de Chile. */
function fechaFlow(v: unknown): string | null {
  if (typeof v !== "string" || !v.trim()) return null;
  const d = new Date(v.trim().replace(" ", "T") + (/[zZ]|[+-]\d\d:?\d\d$/.test(v) ? "" : "-03:00"));
  return isNaN(d.getTime()) ? null : d.toISOString();
}

/** Lee la suscripción en Flow y guarda el estado en la base de datos. */
async function sincronizar(userId: string, subscriptionId: string) {
  const s = await flow("GET", "subscription/get", { subscriptionId });
  const status = Number(s.status); // 0 sin iniciar, 1 activa, 2 en prueba, 4 cancelada
  const morosa = Number(s.morose) === 1; // 1 = importe vencido sin pagar
  const fin = fechaFlow(s.period_end) ?? fechaFlow(s.next_invoice_date);
  let estado = "activa";
  if (status === 4 || Number(s.cancel_at_period_end) === 1) estado = "cancelada";
  else if (morosa) estado = "morosa";
  // Al cancelar se mantiene el acceso hasta el fin del mes ya pagado: la fecha nunca se acorta.
  let hasta = fin;
  if (estado === "cancelada") {
    const { data: actual } = await db.from("suscripciones").select("pagado_hasta").eq("user_id", userId).maybeSingle();
    const previo = actual?.pagado_hasta ? new Date(actual.pagado_hasta).getTime() : 0;
    if (!hasta || previo > new Date(hasta).getTime()) hasta = actual?.pagado_hasta ?? null;
  }
  await db.from("suscripciones").update({ estado, pagado_hasta: hasta, sincronizado_at: new Date().toISOString() }).eq("user_id", userId);
  return { estado, pagado_hasta: hasta };
}

async function usuarioDeSesion(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  if (!/^Bearer\s+/i.test(auth)) return null;
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { Authorization: auth, apikey: ANON_KEY || SERVICE_KEY } });
  if (!r.ok) return null;
  const u = await r.json();
  return u?.id ? { id: u.id as string, email: (u.email ?? "") as string } : null;
}

// ---------- Rutas ----------
async function acciones(req: Request) {
  const usuario = await usuarioDeSesion(req);
  if (!usuario) return json({ error: "Inicie sesión de nuevo." }, 401);
  if (!FLOW_KEY || !FLOW_SECRET) return json({ error: "Los pagos todavía no están configurados. Intente más tarde." }, 503);
  const { accion } = await req.json().catch(() => ({}));
  const { data: sus } = await db.from("suscripciones").select("*").eq("user_id", usuario.id).maybeSingle();
  if (!sus) return json({ error: "No encontramos su cuenta. Cierre sesión y vuelva a entrar." }, 404);

  if (accion === "sincronizar") {
    if (!sus.flow_subscription_id) return json({ ok: true });
    return json(await sincronizar(usuario.id, sus.flow_subscription_id));
  }

  if (accion === "cancelar") {
    if (!sus.flow_subscription_id) return json({ error: "No tiene una suscripción activa." }, 400);
    await flow("POST", "subscription/cancel", { subscriptionId: sus.flow_subscription_id, at_period_end: 1 });
    return json(await sincronizar(usuario.id, sus.flow_subscription_id));
  }

  if (accion === "iniciar") {
    if (sus.gratis) return json({ error: "Su cuenta ya es gratis." }, 400);
    if (sus.flow_subscription_id && ["activa", "morosa"].includes(sus.estado)) {
      return json({ error: "Ya tiene una suscripción. Si un cobro falló, Flow lo reintentará con su tarjeta." }, 400);
    }
    let customerId = sus.flow_customer_id as string | null;
    if (!customerId) {
      const { data: perfil } = await db.from("profiles").select("display_name").eq("user_id", usuario.id).maybeSingle();
      const c = await flow("POST", "customer/create", {
        name: perfil?.display_name?.trim() || usuario.email, email: usuario.email, externalId: usuario.id,
      });
      customerId = String(c.customerId);
      await db.from("suscripciones").update({ flow_customer_id: customerId }).eq("user_id", usuario.id);
    }
    const reg = await flow("POST", "customer/register", { customerId, url_return: `${BASE_FUNCION}/retorno` });
    return json({ url: `${reg.url}?token=${reg.token}` });
  }

  return json({ error: "Acción no válida." }, 400);
}

/** Flow envía por POST el token del registro de tarjeta; si quedó registrada, se crea la suscripción. */
async function retorno(req: Request) {
  let token = new URL(req.url).searchParams.get("token") ?? "";
  if (!token && req.method === "POST") token = String((await req.formData().catch(() => null))?.get("token") ?? "");
  if (!token) return volverApp("error");
  try {
    const reg = await flow("GET", "customer/getRegisterStatus", { token });
    if (String(reg.status) !== "1") return volverApp("cancelado");
    const { data: sus } = await db.from("suscripciones").select("*").eq("flow_customer_id", String(reg.customerId)).maybeSingle();
    if (!sus) return volverApp("error");
    if (!sus.flow_subscription_id || sus.estado === "cancelada") {
      await asegurarPlan();
      // Si todavía le quedan días de prueba, el primer cobro se hace cuando terminan.
      const fin = new Date(sus.prueba_hasta);
      const inicio = fin > new Date() ? new Date(fin.getTime() - 3 * 3600_000).toISOString().slice(0, 10) : undefined;
      const s = await flow("POST", "subscription/create", {
        planId: PLAN_ID, customerId: String(reg.customerId), ...(inicio ? { subscription_start: inicio } : {}),
      });
      await db.from("suscripciones").update({ flow_subscription_id: String(s.subscriptionId), estado: "activa" }).eq("user_id", sus.user_id);
      await sincronizar(sus.user_id, String(s.subscriptionId));
    }
    return volverApp("ok");
  } catch (e) {
    console.error("retorno:", String(e));
    return volverApp("error");
  }
}

/** Aviso de cobro: no se depende del formato del aviso; se vuelven a leer las suscripciones desde Flow. */
async function aviso() {
  const { data } = await db.from("suscripciones").select("user_id, flow_subscription_id")
    .not("flow_subscription_id", "is", null).limit(500);
  for (const s of data ?? []) {
    try {
      await sincronizar(s.user_id, s.flow_subscription_id);
    } catch (e) {
      console.warn("aviso:", s.user_id, String(e));
    }
  }
  return new Response("ok");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const ruta = new URL(req.url).pathname.replace(/\/+$/, "");
  try {
    if (ruta.endsWith("/retorno")) return await retorno(req);
    if (ruta.endsWith("/aviso")) return await aviso();
    if (req.method !== "POST") return json({ error: "Método no permitido." }, 405);
    return await acciones(req);
  } catch (e) {
    console.error(String(e));
    return json({ error: "No se pudo conectar con Flow. Intente de nuevo en unos minutos." }, 502);
  }
});
