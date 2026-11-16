// Comidia · Pago mensual con Webpay a través de Flow (flow.cl), sin Cargo Automático.
// Cada pago aprobado suma 1 mes de acceso (ver migración 007, función registrar_pago).
//
// Rutas (desplegar con verify_jwt = false; la sesión se valida aquí mismo):
//   POST /flow               { accion: "iniciar" | "sincronizar" | "cancelar" }  (requiere sesión)
//   POST /flow/confirmacion  Flow avisa aquí (servidor a servidor) cuando el pago cambia de estado.
//   POST /flow/retorno       El navegador vuelve aquí después de pagar; se redirige a la app.
//
// Secretos: FLOW_API_KEY, FLOW_SECRET_KEY y, opcionales, FLOW_API_URL (por defecto sandbox),
// APP_URL (por defecto https://comidia.netlify.app), FLOW_MONTO (4990).
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const FLOW_API = (Deno.env.get("FLOW_API_URL") ?? "https://sandbox.flow.cl/api").replace(/\/$/, "");
const FLOW_KEY = Deno.env.get("FLOW_API_KEY") ?? "";
const FLOW_SECRET = Deno.env.get("FLOW_SECRET_KEY") ?? "";
const APP_URL = (Deno.env.get("APP_URL") ?? "https://comidia.netlify.app").replace(/\/$/, "");
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

// Estados de pago en Flow: 1 pendiente, 2 pagada, 3 rechazada, 4 anulada.
const ESTADOS: Record<number, string> = { 1: "pendiente", 2: "pagado", 3: "rechazado", 4: "anulado" };

/** Lee el pago en Flow y, si está pagado por el monto correcto, registra el mes. Devuelve el estado. */
async function procesarPago(datos: Record<string, unknown>) {
  const orden = String(datos.commerceOrder ?? "");
  const status = Number(datos.status);
  const { data: pago } = await db.from("pagos").select("*").eq("commerce_order", orden).maybeSingle();
  if (!pago) {
    console.warn("pago desconocido:", orden);
    return "error";
  }
  if (status === 2) {
    if (Number(datos.amount) !== pago.monto || String(datos.currency ?? "CLP") !== "CLP") {
      console.error("monto no coincide:", orden, datos.amount, datos.currency);
      return "error";
    }
    const { error } = await db.rpc("registrar_pago", { p_order: orden, p_flow_order: Number(datos.flowOrder) || null });
    if (error) throw new Error(`registrar_pago: ${error.message}`);
    await db.from("suscripciones").update({ sincronizado_at: new Date().toISOString() }).eq("user_id", pago.user_id);
    return "pagado";
  }
  const estado = ESTADOS[status] ?? "pendiente";
  if (pago.estado !== "pagado" && estado !== "pendiente") {
    await db.from("pagos").update({ estado, flow_order: Number(datos.flowOrder) || null }).eq("commerce_order", orden);
  }
  return estado;
}

async function tokenDe(req: Request) {
  let token = new URL(req.url).searchParams.get("token") ?? "";
  if (!token && req.method === "POST") token = String((await req.formData().catch(() => null))?.get("token") ?? "");
  return token;
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
    // Revisa en Flow los pagos pendientes de los últimos 2 días (por si el aviso no llegó).
    const desde = new Date(Date.now() - 2 * 86400_000).toISOString();
    const { data: pendientes } = await db.from("pagos").select("commerce_order")
      .eq("user_id", usuario.id).eq("estado", "pendiente").gte("created_at", desde);
    for (const p of pendientes ?? []) {
      try {
        await procesarPago(await flow("GET", "payment/getStatusByCommerceId", { commerceId: p.commerce_order }));
      } catch (e) {
        console.warn("sincronizar:", p.commerce_order, String(e));
      }
    }
    return json({ ok: true });
  }

  if (accion === "cancelar") {
    return json({ ok: true, mensaje: "No hay cobros automáticos: su acceso dura hasta la fecha pagada." });
  }

  if (accion === "iniciar") {
    if (sus.gratis) return json({ error: "Su cuenta ya es gratis." }, 400);
    if (!usuario.email) return json({ error: "Su cuenta no tiene correo registrado." }, 400);
    // Orden única: id de la persona + marca de tiempo (máximo 45 caracteres en Flow).
    const orden = `${usuario.id}.${Date.now().toString(36)}`;
    await db.from("pagos").insert({ commerce_order: orden, user_id: usuario.id, monto: MONTO });
    const p = await flow("POST", "payment/create", {
      commerceOrder: orden,
      subject: "Comidia · 1 mes",
      currency: "CLP",
      amount: MONTO,
      email: usuario.email,
      paymentMethod: 9, // todos los medios activos en la cuenta (Webpay)
      urlConfirmation: `${BASE_FUNCION}/confirmacion`,
      urlReturn: `${BASE_FUNCION}/retorno`,
    });
    await db.from("pagos").update({ token: String(p.token), flow_order: Number(p.flowOrder) || null }).eq("commerce_order", orden);
    return json({ url: `${p.url}?token=${p.token}` });
  }

  return json({ error: "Acción no válida." }, 400);
}

/** Aviso de Flow (servidor a servidor). Debe responder 200 rápido. */
async function confirmacion(req: Request) {
  const token = await tokenDe(req);
  if (!token) return new Response("sin token", { status: 400 });
  try {
    await procesarPago(await flow("GET", "payment/getStatus", { token }));
  } catch (e) {
    console.error("confirmacion:", String(e));
    return new Response("error", { status: 500 }); // Flow reintentará
  }
  return new Response("ok");
}

/** El navegador vuelve desde Flow. */
async function retorno(req: Request) {
  const token = await tokenDe(req);
  if (!token) return volverApp("error");
  try {
    const estado = await procesarPago(await flow("GET", "payment/getStatus", { token }));
    if (estado === "pagado") return volverApp("ok");
    if (estado === "rechazado" || estado === "anulado") return volverApp("cancelado");
    return volverApp(estado === "pendiente" ? "pendiente" : "error");
  } catch (e) {
    console.error("retorno:", String(e));
    return volverApp("error");
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const ruta = new URL(req.url).pathname.replace(/\/+$/, "");
  try {
    if (ruta.endsWith("/confirmacion")) return await confirmacion(req);
    if (ruta.endsWith("/retorno")) return await retorno(req);
    if (req.method !== "POST") return json({ error: "Método no permitido." }, 405);
    return await acciones(req);
  } catch (e) {
    console.error(String(e));
    return json({ error: "No se pudo conectar con Flow. Intente de nuevo en unos minutos." }, 502);
  }
});
