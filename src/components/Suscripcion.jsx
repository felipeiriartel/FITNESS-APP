import { useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { fmt } from '../lib/format.js';
import { PLANES, PRECIO, compartirInvitacion, diasRestantes, irAPagar, useSocial } from '../social.jsx';
import { ErrorBox, Icon, Logo, Spinner, useToast } from './ui.jsx';

const fecha = (iso) => new Date(iso).toLocaleDateString('es-CL', { day: 'numeric', month: 'long' });
const precio = `$${fmt(PRECIO)}`;

const pesos = (n) => `$${fmt(n)}`;

/** Selector de plan (1, 3 o 6 meses) y botón que abre Webpay. */
function ElegirPlan({ big, otro }) {
  const [meses, setMeses] = useState(1);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState(null);
  const plan = PLANES.find((p) => p.meses === meses);
  const ahorro = PRECIO * meses - plan.precio;
  async function pagar() {
    setOcupado(true);
    setError(null);
    try {
      await irAPagar(meses);
    } catch (e) {
      setError(e.message);
      setOcupado(false);
    }
  }
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="seg planes" role="radiogroup" aria-label="Plan">
        {PLANES.map((p) => (
          <button key={p.meses} role="radio" aria-checked={p.meses === meses} className={p.meses === meses ? 'on' : ''} onClick={() => setMeses(p.meses)}>
            <span>{p.meses === 1 ? '1 mes' : `${p.meses} meses`}</span>
            <small>{pesos(p.precio)}</small>
          </button>
        ))}
      </div>
      {ahorro > 0 && <small className="muted">Equivale a {pesos(Math.round(plan.precio / meses))} al mes · ahorra {pesos(ahorro)}.</small>}
      <button className={`btn primary block${big ? ' big' : ''}`} disabled={ocupado} onClick={pagar}>
        {ocupado ? <><Spinner /> Abriendo Webpay…</> : `${otro ? 'Sumar' : 'Pagar'} ${meses === 1 ? '1 mes' : `${meses} meses`} · ${pesos(plan.precio)}`}
      </button>
      <ErrorBox>{error}</ErrorBox>
    </div>
  );
}

/** Tarjeta en Ajustes: estado, pago e invitación. */
export function SuscripcionCard() {
  const { sus, cargarSus } = useSocial();
  const toast = useToast();
  const [error, setError] = useState(null);
  if (!sus || sus.sinDatos) return null;

  const quedan = diasRestantes(sus.prueba_hasta);
  const enPrueba = quedan > 0;

  let cuerpo;
  if (sus.estado === 'gratis') {
    cuerpo = <p>Su cuenta es <b>gratis para siempre</b>. Gracias por ser parte de Comidia desde el comienzo.</p>;
  } else if (sus.estado === 'activa') {
    const queda = diasRestantes(sus.pagado_hasta);
    cuerpo = (
      <>
        <p><b>Plan activo</b> hasta el <b>{fecha(sus.pagado_hasta)}</b>.</p>
        <small>No hay cobros automáticos. {queda <= 5 ? 'Pague para no perder el acceso:' : 'Puede pagar más meses cuando quiera; se suman al final.'}</small>
        <ElegirPlan otro />
      </>
    );
  } else {
    cuerpo = (
      <>
        <p>
          {enPrueba
            ? <>Le quedan <b>{quedan} {quedan === 1 ? 'día' : 'días'}</b> de prueba gratis (hasta el {fecha(sus.prueba_hasta)}).</>
            : <>Su prueba gratis terminó.</>}
          {' '}Después, Comidia cuesta <b>{precio} al mes</b>, o menos en planes de 3 y 6 meses.
        </p>
        <ElegirPlan />
        <small>Pago único con Webpay (crédito, débito o prepago) a través de Flow. Si paga durante la prueba, el plan parte cuando ella termine. No hay cobros automáticos.</small>
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
        <b>{quedan === 1 ? 'Mañana termina' : `Quedan ${quedan} días de`} su prueba gratis.</b> Elija un plan desde {precio} al mes para no perder su racha.
      </span>
      <Icon name="der" size={18} />
    </button>
  );
}

/** Pantalla completa cuando terminó la prueba o el mes pagado. */
export function Paywall() {
  const { sus } = useSocial();
  const toast = useToast();
  return (
    <div className="center-page paywall">
      <div className="card stack" style={{ maxWidth: 420, width: '100%' }}>
        <div className="brand"><Logo alto={44} /></div>
        <h1 className="paywall-titulo">{sus?.pagado_hasta ? 'Su mes pagado terminó' : 'Su prueba gratis terminó'}</h1>
        <p className="muted">
          Sus registros siguen guardados. Para seguir registrando con foto, ver su meta del día y competir en el ranking,
          elija un plan desde <b>{precio} al mes</b>.
        </p>
        <ul className="paywall-lista">
          <li><Icon name="camara" size={18} /> Registro con foto e IA, sin límite</li>
          <li><Icon name="trofeo" size={18} /> Ranking mensual con sus amigos</li>
          <li><Icon name="progreso" size={18} /> Meta diaria que se ajusta a su peso real</li>
        </ul>
        <ElegirPlan big />
        <small className="muted">Pago único con Webpay a través de Flow. No hay cobros automáticos.</small>
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
