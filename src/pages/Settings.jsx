import { useRef, useState } from 'react';
import { supabase } from '../lib/supabase.js';
// El módulo de exportación (incluye la librería de Excel) se carga solo cuando se usa.
const exp = () => import('../lib/export.js');
import { fmt } from '../lib/format.js';
import { useData } from '../data.jsx';
import { ProfileForm } from '../components/forms.jsx';
import { ErrorBox, Icon, useToast } from '../components/ui.jsx';
import Reminders from '../components/Reminders.jsx';

const NOMBRES = {
  weight_logs: 'pesajes', meals: 'comidas', exercise_logs: 'ejercicios', water_logs: 'registros de agua', favorite_meals: 'comidas frecuentes',
};

export default function Settings({ email, volver }) {
  const { profile, favorites, userId, ctx, metas, reload } = useData();
  const toast = useToast();
  const [error, setError] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const fileRef = useRef(null);

  async function ejecutar(fn, ok) {
    setOcupado(true);
    setError(null);
    try {
      const r = await fn();
      if (ok) toast(typeof ok === 'function' ? ok(r) : ok);
    } catch (e) {
      setError(e.message ?? String(e));
    } finally {
      setOcupado(false);
    }
  }

  async function importar(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!confirm('Los datos del respaldo se agregarán a su cuenta actual. ¿Continuar?')) return;
    await ejecutar(async () => {
      const r = await (await exp()).importarJSON(userId, file);
      await reload();
      return r;
    }, (r) => `Importación completa: ${Object.entries(r).map(([t, n]) => `${n} ${NOMBRES[t] ?? t}`).join(', ') || 'sin registros'}.`);
  }

  async function borrarFavorita(f) {
    if (!confirm(`¿Eliminar "${f.name}" de las comidas frecuentes?`)) return;
    const { error: e } = await supabase.from('favorite_meals').delete().eq('id', f.id);
    if (e) return toast(e.message, 'error');
    if (f.photo_path) await supabase.storage.from('meal-photos').remove([f.photo_path]);
    toast('Comida frecuente eliminada');
    reload();
  }

  return (
    <div className="stack">
      <header className="page-head">
        <button className="icon-btn round" onClick={volver} aria-label="Volver"><Icon name="izq" /></button>
        <div className="titles" style={{ textAlign: 'left' }}><h1>Ajustes</h1></div>
      </header>

      <section className="card">
        <h2 style={{ marginBottom: 12 }}>Perfil y metas</h2>
        <ProfileForm inicial={profile} textoBoton="Guardar cambios" />
      </section>

      <Reminders />

      <section className="card stack">
        <h2>Exportar e importar</h2>
        <p className="muted">
          Descargue todos sus datos en Excel para revisarlos, o un respaldo JSON para trasladarlos a otra cuenta o a otra instalación de la app.
        </p>
        <div className="stack" style={{ gap: 8 }}>
          <button className="btn block" disabled={ocupado} onClick={() => ejecutar(async () => (await exp()).exportarExcel(userId, ctx, metas), 'Excel descargado')}><Icon name="descarga" /> Descargar Excel</button>
          <button className="btn block" disabled={ocupado} onClick={() => ejecutar(async () => (await exp()).exportarJSON(userId), 'Respaldo descargado')}><Icon name="descarga" /> Descargar respaldo</button>
          <button className="btn block ghost" disabled={ocupado} onClick={() => fileRef.current?.click()}>Importar respaldo</button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={importar} />
        </div>
        <ErrorBox>{error}</ErrorBox>
      </section>

      <section className="card">
        <h2 style={{ marginBottom: 8 }}>Comidas frecuentes</h2>
        {!favorites.length && <p className="muted">Aún no hay comidas frecuentes.</p>}
        <div className="list">
          {favorites.map((f) => (
            <div className="list-item" key={f.id}>
              <div className="grow">{f.name}</div>
              <small className="num">{fmt(f.kcal)} kcal</small>
              <button className="icon-btn" title="Eliminar" onClick={() => borrarFavorita(f)}><Icon name="basura" size={18} /></button>
            </div>
          ))}
        </div>
      </section>

      <section className="card row between">
        <div>
          <h2>Cuenta</h2>
          <small>{email}</small>
        </div>
        <button className="btn small danger" onClick={() => supabase.auth.signOut()}>Cerrar sesión</button>
      </section>

      <small>
        Comidia entrega estimaciones de apoyo y no reemplaza la evaluación de un nutricionista o médico.
      </small>
    </div>
  );
}
