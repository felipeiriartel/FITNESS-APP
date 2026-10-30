import { useEffect, useState } from 'react';
import { mensajeError, supabase } from '../lib/supabase.js';
import { compartirInvitacion, useSocial } from '../social.jsx';
import { ErrorBox, Icon, Modal, Spinner, useToast } from './ui.jsx';

const BOTON = {
  ninguna: { texto: 'Agregar', clase: 'primary' },
  enviada: { texto: 'Enviada', clase: '' },
  recibida: { texto: 'Aceptar', clase: 'primary' },
  amigo: { texto: 'Amigos', clase: '' },
};

/** Hoja para agregar amigos, accesible desde Hoy, Ranking y el menú +. */
export function AmigosSheet({ onClose, alCambiar }) {
  return (
    <Modal title="Amigos" onClose={onClose}>
      <Amigos alCambiar={alCambiar} enHoja />
    </Modal>
  );
}

/** Amigos: solicitudes recibidas, búsqueda por nombre, lista y enlace de invitación. */
export default function Amigos({ alCambiar, enHoja }) {
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
    <section className={enHoja ? 'stack amigos' : 'card stack amigos'} aria-label="Amigos">
      {!enHoja && (
        <div className="card-head" style={{ marginBottom: 0 }}>
          <div className="section-title"><span className="badge"><Icon name="amigos" size={18} /></span><h2>Amigos</h2></div>
          <span className="muted num">{soloAmigos.length}</span>
        </div>
      )}
      {enHoja && <p className="muted">Compita en el ranking solo con sus amigos y compártales lo que comieron juntos.</p>}

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
        Agregar amigo por nombre
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

      {(soloAmigos.length > 0 || enviadas.length > 0) && !enHoja && (
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
      {enHoja && (soloAmigos.length > 0 || enviadas.length > 0) && (
        <div className="stack" style={{ gap: 4 }}>
          <span className="field-label">Mis amigos ({soloAmigos.length})</span>
          <div className="list">
            {[...soloAmigos, ...enviadas].map((a) => (
              <div className="list-item" key={a.solicitud_id}>
                <span className="grow"><b>{a.nombre}</b>{a.relacion === 'enviada' && <small className="muted"> · solicitud enviada</small>}</span>
                <button className="icon-btn" aria-label={a.relacion === 'enviada' ? `Cancelar solicitud a ${a.nombre}` : `Quitar a ${a.nombre}`} onClick={() => eliminar(a)}>
                  <Icon name="x" size={18} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      <ErrorBox>{error}</ErrorBox>
    </section>
  );
}

/** Aviso en Hoy: solicitudes pendientes o invitación a agregar amigos si tiene pocos. */
export function AmigosAviso({ abrir }) {
  const { sus, solicitudes, soloAmigos, cargarAmigos } = useSocial();
  const toast = useToast();
  if (!sus) return null;

  async function aceptar(s) {
    const { error } = await supabase.rpc('responder_amistad', { p_id: s.solicitud_id, p_aceptar: true });
    if (error) return toast(error.message, 'error');
    toast(`Ahora es amigo de ${s.nombre}`);
    cargarAmigos();
  }

  if (solicitudes.length) {
    const s = solicitudes[0];
    return (
      <section className="card amigos-aviso" aria-label="Solicitud de amistad">
        <span className="badge"><Icon name="amigos" size={18} /></span>
        <span className="grow">
          <b>{s.nombre.split(' ')[0]}</b> quiere ser su amigo{solicitudes.length > 1 && <> y {solicitudes.length - 1} más</>}
        </span>
        {solicitudes.length > 1
          ? <button className="btn small primary" onClick={() => abrir('amigos')}>Ver</button>
          : <button className="btn small primary" onClick={() => aceptar(s)}>Aceptar</button>}
      </section>
    );
  }
  if (soloAmigos.length >= 2) return null;
  return (
    <button className="card amigos-aviso invitar" onClick={() => abrir('amigos')}>
      <span className="badge"><Icon name="amigos" size={18} /></span>
      <span className="grow">
        <b>Compita con sus amigos</b>
        <small>Agréguelos para el ranking del mes y compartir comidas</small>
      </span>
      <span className="btn small primary" aria-hidden="true"><Icon name="mas" size={18} /> Agregar</span>
    </button>
  );
}
