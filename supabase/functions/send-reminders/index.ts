// Comidia · Recordatorios (notificaciones push)
// - Programado (pg_cron cada 15 min, cabecera x-cron-token): envía los recordatorios que tocan.
// - Prueba (usuario con sesión, { prueba: true }): envía uno de prueba a sus dispositivos.
// Las claves VAPID y el token del cron se guardan en Supabase Vault.
import { createClient } from "npm:@supabase/supabase-js@2";
import { enviar, type ClavesVapid, type Suscripcion } from "./webpush.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

type Recordatorios = { activo?: boolean; agua?: string[]; calorias?: string | null };
type Perfil = {
  user_id: string;
  recordatorios: Recordatorios | null;
  zona_horaria: string | null;
  metas_cache: { meta?: number; proteina?: number; agua?: number } | null;
};
type Mensaje = { title: string; body: string; tag: string; url?: string };

async function secreto(nombre: string): Promise<string> {
  const { data, error } = await admin.rpc("secreto_app", { nombre });
  if (error || !data) throw new Error(`No se pudo leer el secreto ${nombre}`);
  return data as string;
}

let clavesCache: ClavesVapid | null = null;
async function claves(): Promise<ClavesVapid> {
  if (!clavesCache) {
    clavesCache = {
      publica: await secreto("comidia_vapid_publica"),
      privadaJwk: JSON.parse(await secreto("comidia_vapid_privada")),
      contacto: "mailto:soporte@comidia.app",
    };
  }
  return clavesCache;
}

/** Fecha (YYYY-MM-DD) y minutos del día en la zona horaria de la persona. */
function ahoraLocal(zona: string) {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: zona, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(new Date()).map((p) => [p.type, p.value]),
  );
  return { fecha: `${partes.year}-${partes.month}-${partes.day}`, minutos: Number(partes.hour) * 60 + Number(partes.minute) };
}

const aMinutos = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};
/** Toca si la hora configurada cayó dentro de los últimos 15 minutos. */
const toca = (hhmm: string | null | undefined, minutos: number) => {
  if (!hhmm || !/^\d{2}:\d{2}$/.test(hhmm)) return false;
  const d = minutos - aMinutos(hhmm);
  return d >= 0 && d < 15;
};

const fmt = (n: number, dec = 0) => n.toLocaleString("es-CL", { minimumFractionDigits: dec, maximumFractionDigits: dec });
const litros = (ml: number) => `${(ml / 1000).toLocaleString("es-CL", { maximumFractionDigits: 2 })} L`;

function sumarDia(fecha: string, n: number) {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

async function datosDelDia(userId: string, fecha: string) {
  const [agua, comidas, historial] = await Promise.all([
    admin.from("water_logs").select("ml").eq("user_id", userId).eq("log_date", fecha),
    admin.from("meals").select("kcal, protein_g").eq("user_id", userId).eq("log_date", fecha),
    admin.from("meals").select("log_date").eq("user_id", userId).gte("log_date", sumarDia(fecha, -90)).lte("log_date", fecha),
  ]);
  const ml = (agua.data ?? []).reduce((s, r) => s + Number(r.ml), 0);
  const kcal = (comidas.data ?? []).reduce((s, r) => s + Number(r.kcal), 0);
  const proteina = (comidas.data ?? []).reduce((s, r) => s + Number(r.protein_g), 0);
  const dias = new Set((historial.data ?? []).map((r) => r.log_date as string));
  let racha = 0;
  for (let d = dias.has(fecha) ? fecha : sumarDia(fecha, -1); dias.has(d); d = sumarDia(d, -1)) racha++;
  return { ml, kcal, proteina, nComidas: comidas.data?.length ?? 0, racha };
}

function mensajeAgua(ml: number, meta: number): Mensaje | null {
  const falta = meta - ml;
  if (falta <= 0) return null; // meta cumplida: no molestar
  const vaso = falta >= 500 ? "un vaso grande (500 ml)" : "un vaso (250 ml)";
  return {
    title: "💧 Hora de hidratarse",
    body: `Lleva ${litros(ml)} de ${litros(meta)}. Le faltan ${litros(falta)}: tome ${vaso} ahora.`,
    tag: "agua",
  };
}

function mensajeCalorias(d: Awaited<ReturnType<typeof datosDelDia>>, meta: number, metaProteina: number): Mensaje {
  if (d.nComidas === 0) {
    return {
      title: "🍽️ ¿Ya registró sus comidas?",
      body: d.racha > 0
        ? `Aún no hay comidas registradas hoy. Anótelas para mantener su racha de ${d.racha} ${d.racha === 1 ? "día" : "días"} 🔥`
        : "Aún no hay comidas registradas hoy. Anótelas para saber cuántas calorías le quedan.",
      tag: "calorias",
    };
  }
  const quedan = Math.round(meta - d.kcal);
  const faltaProteina = Math.round(metaProteina - d.proteina);
  if (quedan > 0) {
    return {
      title: `🍽️ Le quedan ${fmt(quedan)} kcal`,
      body: faltaProteina > 0
        ? `Para completar su meta de hoy le quedan ${fmt(quedan)} kcal y ${fmt(faltaProteina)} g de proteína.`
        : `Para completar su meta de hoy le quedan ${fmt(quedan)} kcal. La proteína ya está cubierta 💪`,
      tag: "calorias",
    };
  }
  return {
    title: "✅ Hoy ya completó su meta",
    body: `Lleva ${fmt(d.kcal)} de ${fmt(meta)} kcal. Si tiene hambre, prefiera algo liviano y con proteína.`,
    tag: "calorias",
  };
}

async function suscripciones(userIds: string[]) {
  const { data } = await admin.from("push_subscriptions").select("id, user_id, endpoint, p256dh, auth").in("user_id", userIds);
  return data ?? [];
}

async function enviarA(subs: (Suscripcion & { id: string })[], mensaje: Mensaje) {
  const k = await claves();
  let enviados = 0;
  for (const s of subs) {
    try {
      const estado = await enviar(s, { ...mensaje, url: mensaje.url ?? "/" }, k);
      if (estado === 404 || estado === 410) {
        await admin.from("push_subscriptions").delete().eq("id", s.id); // el teléfono la anuló
      } else if (estado >= 200 && estado < 300) {
        enviados++;
      } else {
        console.error("Push rechazado:", estado, new URL(s.endpoint).host);
      }
    } catch (e) {
      console.error("Error enviando push:", e instanceof Error ? e.message : String(e));
    }
  }
  return enviados;
}

async function ejecutarProgramado() {
  const { data: perfiles, error } = await admin
    .from("profiles")
    .select("user_id, recordatorios, zona_horaria, metas_cache")
    .filter("recordatorios->>activo", "eq", "true");
  if (error) throw error;
  if (!perfiles?.length) return { revisados: 0, enviados: 0 };

  const subs = await suscripciones(perfiles.map((p) => p.user_id));
  let enviados = 0;
  for (const p of perfiles as Perfil[]) {
    const propias = subs.filter((s) => s.user_id === p.user_id);
    if (!propias.length) continue;
    const r = p.recordatorios ?? {};
    const { fecha, minutos } = ahoraLocal(p.zona_horaria || "America/Santiago");
    const tocaAgua = (r.agua ?? []).some((h) => toca(h, minutos));
    const tocaCalorias = toca(r.calorias, minutos);
    if (!tocaAgua && !tocaCalorias) continue;

    const metas = p.metas_cache ?? {};
    const d = await datosDelDia(p.user_id, fecha);
    if (tocaAgua && metas.agua) {
      const m = mensajeAgua(d.ml, metas.agua);
      if (m) enviados += await enviarA(propias, m);
    }
    if (tocaCalorias && metas.meta) {
      enviados += await enviarA(propias, mensajeCalorias(d, metas.meta, metas.proteina ?? 0));
    }
  }
  return { revisados: perfiles.length, enviados };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método no permitido." }, 405);
  try {
    const tokenCron = req.headers.get("x-cron-token");
    if (tokenCron) {
      if (tokenCron !== await secreto("comidia_cron_token")) return json({ error: "No autorizado." }, 401);
      const r = await ejecutarProgramado();
      console.log(JSON.stringify({ evento: "recordatorios", ...r }));
      return json(r);
    }

    // Prueba pedida por la propia persona desde Ajustes.
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: u } = await admin.auth.getUser(jwt);
    if (!u?.user) return json({ error: "Inicie sesión para probar los recordatorios." }, 401);
    const subs = await suscripciones([u.user.id]);
    if (!subs.length) return json({ error: "Este teléfono aún no tiene los recordatorios activados." }, 400);
    const enviados = await enviarA(subs, {
      title: "🔔 Recordatorios activados",
      body: "Así le llegarán los avisos de agua y de las calorías que le quedan.",
      tag: "prueba",
    });
    if (!enviados) return json({ error: "No se pudo entregar la notificación de prueba. Vuelva a activar los recordatorios." }, 502);
    return json({ enviados });
  } catch (e) {
    console.error("Error en send-reminders:", e instanceof Error ? e.message : String(e));
    return json({ error: "No se pudieron procesar los recordatorios." }, 500);
  }
});
