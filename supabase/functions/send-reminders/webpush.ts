// Envío de notificaciones Web Push (RFC 8291 + VAPID, RFC 8292) usando solo WebCrypto.
// Funciona igual en Deno (Supabase) y en Node 20+.

const enc = new TextEncoder();

export function b64urlEncode(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function b64urlDecode(texto: string): Uint8Array {
  const b64 = texto.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((texto.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function concat(...partes: Uint8Array[]): Uint8Array {
  const total = partes.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let i = 0;
  for (const p of partes) {
    out.set(p, i);
    i += p.length;
  }
  return out;
}

async function hmac(clave: Uint8Array, datos: Uint8Array): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey("raw", clave, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, datos));
}

export type Suscripcion = { endpoint: string; p256dh: string; auth: string };
export type ClavesVapid = { publica: string; privadaJwk: JsonWebKey; contacto: string };

/** Cifra el contenido para un navegador (aes128gcm, un solo registro). */
export async function cifrar(sub: Suscripcion, mensaje: string): Promise<Uint8Array> {
  const uaPublic = b64urlDecode(sub.p256dh);
  const authSecret = b64urlDecode(sub.auth);

  const efimera = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey("raw", efimera.publicKey));
  const uaKey = await crypto.subtle.importKey("raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, efimera.privateKey, 256));

  const prkKey = await hmac(authSecret, ecdhSecret);
  const keyInfo = concat(enc.encode("WebPush: info\0"), uaPublic, asPublic, new Uint8Array([1]));
  const ikm = await hmac(prkKey, keyInfo);

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const prk = await hmac(salt, ikm);
  const cek = (await hmac(prk, concat(enc.encode("Content-Encoding: aes128gcm\0"), new Uint8Array([1])))).slice(0, 16);
  const nonce = (await hmac(prk, concat(enc.encode("Content-Encoding: nonce\0"), new Uint8Array([1])))).slice(0, 12);

  const claveAes = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const texto = concat(enc.encode(mensaje), new Uint8Array([2])); // 0x02: último registro
  const cifrado = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, claveAes, texto));

  const rs = new Uint8Array([0, 0, 16, 0]); // tamaño de registro 4096
  return concat(salt, rs, new Uint8Array([asPublic.length]), asPublic, cifrado);
}

/** Token VAPID (JWT ES256) para el servicio de push del navegador. */
export async function tokenVapid(endpoint: string, claves: ClavesVapid): Promise<string> {
  const aud = new URL(endpoint).origin;
  const cabecera = b64urlEncode(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const cuerpo = b64urlEncode(enc.encode(JSON.stringify({
    aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: claves.contacto,
  })));
  const privada = await crypto.subtle.importKey(
    "jwk", { ...claves.privadaJwk, key_ops: ["sign"], ext: true }, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"],
  );
  const firma = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, privada, enc.encode(`${cabecera}.${cuerpo}`)));
  return `${cabecera}.${cuerpo}.${b64urlEncode(firma)}`;
}

/** Envía una notificación. Devuelve el estado HTTP (404/410 = suscripción vencida). */
export async function enviar(sub: Suscripcion, contenido: unknown, claves: ClavesVapid, ttl = 3600): Promise<number> {
  const cuerpo = await cifrar(sub, JSON.stringify(contenido));
  const jwt = await tokenVapid(sub.endpoint, claves);
  const r = await fetch(sub.endpoint, {
    method: "POST",
    headers: {
      Authorization: `vapid t=${jwt}, k=${claves.publica}`,
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: String(ttl),
      Urgency: "normal",
    },
    body: cuerpo,
  });
  await r.body?.cancel();
  return r.status;
}
