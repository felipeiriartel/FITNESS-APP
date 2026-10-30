import { useEffect, useState } from 'react';
import { mensajeError, supabase } from '../lib/supabase.js';
import { compartirInvitacion, useSocial } from '../social.jsx';
import { ErrorBox, Icon, Spinner, useToast } from './ui.jsx';

const BOTON = {
  ninguna: { texto: 'Agregar', clase: 'primary' },
  enviada: { texto: 'Enviada', clase: '' },
  recibida: { texto: 'Aceptar', clase: 'primary' },
  amigo: { texto: 'Amigos', clase: '' },
};

/** Amigos: solicitudes recibidas, búsqueda por nombre, lista y enlace de invitación. */
export default function Amigos({ alCambiar }) {
  const { amigos, solicitudes, soloAmigos, sus, cargarAmigos } = useSocial();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [resultados, setResultados] = useState(null);
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState(null);
  const [abierto, setAbierto] = useState(false);
  const enviadas = amigos.filter((a) => a.relacion === 'enviada');

  useEffect(() => {
    const texto = q.trim();
    if (texto.length < 2) {
      setResultados(null);
      return;
    }
    setBuscando(true);
    const t = setTimeout(async () => {
      const { data, error: e } = await supabase.rpc('buscar_personas', { q: texto });
      setBuscando(false);
      if (e) return setError(e.message);
      setResultados(data ?? []);
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  async function despues() {
    await cargarAmigos();
    alCambiar?.();
  }

  async function solicitar(p) {
    setError(null);
    const { data, error: e } = await supabase.rpc('solicitar_amistad', { p_user: p.user_id });
    if (e) return setError(await mensajeError(e));
    toast(data === 'amigo' ? `Ahora es amigo de ${p.nombre}` : `Solicitud enviada a ${p.nombre}`);
    setResultados((r) => r?.map((x) => (x.user_id === p.user_id ? { ...x, relacion: data } : x)));
    despues();
  }

  async function responder(s, aceptar) {
    setError(null);
    const { error: e } = await supabase.rpc('responder_amistad', { p_id: s.solicitud_id, p_aceptar: aceptar });
    if (e) return setError(await mensajeError(e));
    toast(aceptar ? `Ahora es amigo de ${s.nombre}` : 'Solicitud rechazada');
    despues();
  }

  async function eliminar(a) {
    const pregunta = a.relacion === 'enviada' ? `¿Cancelar la solicitud a ${a.nombre}?` : `¿Quitar a ${a.nombre} de sus amigos? Dejarán de verse en el ranking.`;
    if (!confirm(pregunta)) return;
    const { error: e } = await supabase.rpc('eliminar_amistad', { p_user: a.user_id });
    if (e) return setError(await mensajeError(e));
    despues();
  }

  return (
    <section className="card stack amigos" aria-label="Amigos">
      <div className="card-head" style={{ marginBottom: 0 }}>
        <div className="section-title"><span className="badge"><Icon name="amigos" size={18} /></span><h2>Amigos</h2></div>
        <span className="muted num">{soloAmigos.length}</span>
      </div>

      {solicitudes.length > 0 && (
        <div className="alert info stack" style={{ gap: 8 }}>
          <b>{solicitudes.length === 1 ? 'Tiene una solicitud de amistad' : `Tiene ${solicitudes.length} solicitudes de amistad`}</b>
          {solicitudes.map((s) => (
            <div className="row" key={s.solicitud_id}>
              <span className="grow"><b>{s.nombre}</b></span>
              <button className="btn small ghost" onClick={() => responder(s, false)}>Rechazar</button>
              <button className="btn small primary" onClick={() => responder(s, true)}>Aceptar</button>
            </div>
          ))}
        </div>
      )}

      <label className="field buscar-amigo">
        Buscar por nombre
        <span className="input-icono">
          <Icon name="buscar" size={18} />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ej: Ignacia" autoComplete="off" enterKeyHint="search" />
        </span>
      </label>
      {buscando && <div className="row"><Spinner /> <small>Buscando…</small></div>}
      {resultados && !buscando && (
        <div className="list">
          {!resultados.length && <p className="muted">No encontramos a nadie con ese nombre. Mándele su enlace de invitación.</p>}
          {resultados.map((p) => {
            const b = BOTON[p.relacion] ?? BOTON.ninguna;
            const activo = p.relacion === 'ninguna' || p.relacion === 'recibida';
            return (
              <div className="list-item" key={p.user_id}>
                <span className="grow"><b>{p.nombre}</b></span>
                <button className={`btn small ${b.clase}`} disabled={!activo} onClick={() => solicitar(p)}>{b.texto}</button>
              </div>
            );
          })}
        </div>
      )}

      {sus?.codigo_invitacion && (
        <button className="btn block" onClick={() => compartirInvitacion(sus.codigo_invitacion, toast)}>
          <Icon name="regalo" size={20} /> Invitar por WhatsApp · +5 días gratis
        </button>
      )}

      {(soloAmigos.length > 0 || enviadas.length > 0) && (
        <>
          <button className="btn small ghost block" aria-expanded={abierto} onClick={() => setAbierto((v) => !v)}>
            {abierto ? 'Ocultar mis amigos' : `Ver mis amigos (${soloAmigos.length})`}
          </button>
          {abierto && (
            <div className="list">
              {[...soloAmigos, ...enviadas].map((a) => (
                <div className="list-item" key={a.solicitud_id}>
                  <span className="grow">
                    <b>{a.nombre}</b>
                    {a.relacion === 'enviada' && <small className="muted"> · solicitud enviada</small>}
                  </span>
                  <button className="icon-btn" aria-label={a.relacion === 'enviada' ? `Cancelar solicitud a ${a.nombre}` : `Quitar a ${a.nombre}`} onClick={() => eliminar(a)}>
                    <Icon name="x" size={18} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
      <ErrorBox>{error}</ErrorBox>
    </section>
  );
}
