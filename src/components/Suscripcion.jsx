import { useState } from 'react';
import { mensajeError, supabase } from '../lib/supabase.js';
import { fmt } from '../lib/format.js';
import { PRECIO, compartirInvitacion, diasRestantes, irAPagar, useSocial } from '../social.jsx';
import { ErrorBox, Icon, Logo, Spinner, useToast } from './ui.jsx';

const fecha = (iso) => new Date(iso).toLocaleDateString('es-CL', { day: 'numeric', month: 'long' });
const precio = `$${fmt(PRECIO)}`;

function BotonPagar({ texto = `Suscribirme · ${precio} al mes`, big }) {
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState(null);
  async function pagar() {
    setOcupado(true);
    setError(null);
    try {
      await irAPagar();
    } catch (e) {
      setError(e.message);
      setOcupado(false);
    }
  }
  return (
    <>
      <button className={`btn primary block${big ? ' big' : ''}`} disabled={ocupado} onClick={pagar}>
        {ocupado ? <><Spinner /> Abriendo Flow…</> : texto}
      </button>
      <ErrorBox>{error}</ErrorBox>
    </>
  );
}

/** Tarjeta en Ajustes: estado, pago, cancelación e invitación. */
export function SuscripcionCard() {
  const { sus, cargarSus } = useSocial();
  const toast = useToast();
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState(null);
  if (!sus || sus.sinDatos) return null;

  const quedan = diasRestantes(sus.prueba_hasta);
  const enPrueba = quedan > 0;

  async function cancelar() {
    if (!confirm(`¿Cancelar la suscripción? Seguirá teniendo acceso hasta el ${fecha(sus.pagado_hasta ?? new Date())} y no se harán más cobros.`)) return;
    setOcupado(true);
    setError(null);
    const { error: e } = await supabase.functions.invoke('flow', { body: { accion: 'cancelar' } });
    setOcupado(false);
    if (e) return setError(await mensajeError(e));
    toast('Suscripción cancelada');
    cargarSus();
  }

  let cuerpo;
  if (sus.estado === 'gratis') {
    cuerpo = <p>Su cuenta es <b>gratis para siempre</b>. Gracias por ser parte de Comidia desde el comienzo.</p>;
  } else if (sus.estado === 'activa') {
    cuerpo = (
      <>
        <p><b>Suscripción activa</b> · {precio} al mes con su tarjeta en Flow.{sus.pagado_hasta && <> Próximo cobro: {fecha(sus.pagado_hasta)}.</>}</p>
        {enPrueba && <small>Su primer cobro se hace cuando termine su prueba gratis.</small>}
        <button className="btn small ghost danger" disabled={ocupado} onClick={cancelar}>{ocupado ? 'Cancelando…' : 'Cancelar suscripción'}</button>
      </>
    );
  } else if (sus.estado === 'morosa') {
    cuerpo = (
      <>
        <div className="alert warn">No pudimos cobrar su tarjeta. Flow lo volverá a intentar; también puede registrar otra tarjeta.</div>
        <BotonPagar texto="Registrar otra tarjeta" />
      </>
    );
  } else if (sus.estado === 'cancelada' && sus.pagado_hasta && new Date(sus.pagado_hasta) > new Date()) {
    cuerpo = (
      <>
        <p>Canceló su suscripción. Tiene acceso hasta el <b>{fecha(sus.pagado_hasta)}</b>.</p>
        <BotonPagar texto="Volver a suscribirme" />
      </>
    );
  } else {
    cuerpo = (
      <>
        <p>
          {enPrueba
            ? <>Le quedan <b>{quedan} {quedan === 1 ? 'día' : 'días'}</b> de prueba gratis (hasta el {fecha(sus.prueba_hasta)}).</>
            : <>Su prueba gratis terminó.</>}
          {' '}Después, Comidia cuesta <b>{precio} al mes</b>.
        </p>
        <BotonPagar />
        <small>Se paga con tarjeta de crédito, débito o prepago a través de Flow. Si se suscribe durante la prueba, el primer cobro se hace cuando termine. Puede cancelar cuando quiera.</small>
      </>
    );
  }

  return (
    <section className="card stack">
      <h2>Suscripción</h2>
      {cuerpo}
      <ErrorBox>{error}</ErrorBox>
      {sus.estado !== 'gratis' && sus.codigo_invitacion && (
        <div className="invitar stack" style={{ gap: 8 }}>
          <p className="muted">
            Invite a sus amigos: ellos parten con 15 días gratis y usted suma 5 días de prueba por cada uno que se registre (hasta 30).
            {sus.dias_bonus > 0 && <> Ya ganó <b>{sus.dias_bonus} días</b>.</>}
          </p>
          <button className="btn block" onClick={() => compartirInvitacion(sus.codigo_invitacion, toast)}><Icon name="regalo" size={20} /> Invitar amigos</button>
        </div>
      )}
    </section>
  );
}

/** Aviso en Hoy cuando quedan 3 días o menos de prueba. */
export function AvisoPrueba({ irAAjustes }) {
  const { sus } = useSocial();
  if (!sus || sus.sinDatos || sus.estado !== 'prueba') return null;
  const quedan = diasRestantes(sus.prueba_hasta);
  if (quedan > 3 || quedan <= 0) return null;
  return (
    <button className="alert warn aviso-prueba" onClick={irAAjustes}>
      <span className="grow">
        <b>{quedan === 1 ? 'Mañana termina' : `Quedan ${quedan} días de`} su prueba gratis.</b> Suscríbase por {precio} al mes para no perder su racha.
      </span>
      <Icon name="der" size={18} />
    </button>
  );
}

/** Pantalla completa cuando terminó la prueba y no hay suscripción. */
export function Paywall() {
  const { sus } = useSocial();
  const toast = useToast();
  return (
    <div className="center-page paywall">
      <div className="card stack" style={{ maxWidth: 420, width: '100%' }}>
        <div className="brand"><Logo alto={44} /></div>
        <h1 className="paywall-titulo">{sus?.estado === 'morosa' ? 'No pudimos cobrar su tarjeta' : 'Su prueba gratis terminó'}</h1>
        <p className="muted">
          Sus registros siguen guardados. Para seguir registrando con foto, ver su meta del día y competir en el ranking,
          suscríbase por <b>{precio} al mes</b>.
        </p>
        <ul className="paywall-lista">
          <li><Icon name="camara" size={18} /> Registro con foto e IA, sin límite</li>
          <li><Icon name="trofeo" size={18} /> Ranking mensual con sus amigos</li>
          <li><Icon name="progreso" size={18} /> Meta diaria que se ajusta a su peso real</li>
        </ul>
        <BotonPagar big texto={sus?.estado === 'morosa' ? 'Registrar otra tarjeta' : 'Suscribirme'} />
        <small className="muted">Pago con tarjeta a través de Flow. Puede cancelar cuando quiera desde Ajustes.</small>
        {sus?.codigo_invitacion && (
          <button className="btn block ghost" onClick={() => compartirInvitacion(sus.codigo_invitacion, toast)}>
            <Icon name="regalo" size={20} /> Invitar a un amigo y ganar 5 días
          </button>
        )}
        <button className="btn small ghost block" onClick={() => supabase.auth.signOut()}>Cerrar sesión</button>
      </div>
    </div>
  );
}
