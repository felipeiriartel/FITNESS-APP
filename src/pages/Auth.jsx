import { useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { ErrorBox } from '../components/ui.jsx';

export default function Auth() {
  const [modo, setModo] = useState('entrar'); // entrar | registrar | recuperar
  const [email, setEmail] = useState('');
  const [clave, setClave] = useState('');
  const [error, setError] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [ocupado, setOcupado] = useState(false);

  async function enviar(e) {
    e.preventDefault();
    setError(null);
    setAviso(null);
    setOcupado(true);
    const redirectTo = window.location.origin;
    let r;
    if (modo === 'entrar') r = await supabase.auth.signInWithPassword({ email, password: clave });
    else if (modo === 'registrar') r = await supabase.auth.signUp({ email, password: clave, options: { emailRedirectTo: redirectTo } });
    else r = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    setOcupado(false);
    if (r.error) return setError(traducir(r.error.message));
    if (modo === 'registrar' && !r.data.session) setAviso('Cuenta creada. Revise su correo para confirmarla y luego ingrese.');
    if (modo === 'recuperar') setAviso('Le enviamos un correo con un enlace para crear una nueva contraseña.');
  }

  return (
    <div className="center-page">
      <form className="auth card stack" onSubmit={enviar}>
        <div className="brand">
          <img src="/icon.svg" alt="" />
          <div>
            <h1>Comidia</h1>
            <small>Fotografíe su plato y sepa cuánto comió</small>
          </div>
        </div>
        <div className="seg">
          <button type="button" className={modo === 'entrar' ? 'on' : ''} onClick={() => setModo('entrar')}>Ingresar</button>
          <button type="button" className={modo === 'registrar' ? 'on' : ''} onClick={() => setModo('registrar')}>Crear cuenta</button>
        </div>
        <label className="field">
          Correo
          <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        {modo !== 'recuperar' && (
          <label className="field">
            Contraseña
            <input type="password" autoComplete={modo === 'entrar' ? 'current-password' : 'new-password'} required minLength={6}
              value={clave} onChange={(e) => setClave(e.target.value)} />
          </label>
        )}
        <ErrorBox>{error}</ErrorBox>
        {aviso && <div className="alert info">{aviso}</div>}
        <button className="btn primary big block" disabled={ocupado}>
          {ocupado ? 'Un momento…' : modo === 'entrar' ? 'Ingresar' : modo === 'registrar' ? 'Crear cuenta' : 'Enviar enlace'}
        </button>
        {modo === 'entrar' && (
          <button type="button" className="btn ghost small" onClick={() => setModo('recuperar')}>Olvidé mi contraseña</button>
        )}
      </form>
    </div>
  );
}

export function NuevaClave({ onDone }) {
  const [clave, setClave] = useState('');
  const [error, setError] = useState(null);
  async function guardar(e) {
    e.preventDefault();
    const { error: err } = await supabase.auth.updateUser({ password: clave });
    if (err) return setError(traducir(err.message));
    onDone();
  }
  return (
    <div className="center-page">
      <form className="auth card stack" onSubmit={guardar}>
        <h1>Nueva contraseña</h1>
        <input type="password" minLength={6} required value={clave} onChange={(e) => setClave(e.target.value)} autoComplete="new-password" />
        <ErrorBox>{error}</ErrorBox>
        <button className="btn primary big block">Guardar contraseña</button>
      </form>
    </div>
  );
}

function traducir(m) {
  if (/invalid login/i.test(m)) return 'Correo o contraseña incorrectos.';
  if (/already registered/i.test(m)) return 'Ese correo ya tiene una cuenta.';
  if (/email not confirmed/i.test(m)) return 'Debe confirmar su correo antes de ingresar.';
  if (/at least 6/i.test(m)) return 'La contraseña debe tener al menos 6 caracteres.';
  return m;
}
