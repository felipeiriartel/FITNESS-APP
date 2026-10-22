import { useRef, useState } from 'react';
import { supabase, mensajeError } from '../lib/supabase.js';
import { comprimirImagen } from '../lib/image.js';
import { TIPOS_COMIDA } from '../lib/calc.js';
import { fmt, uuid } from '../lib/format.js';
import { useData } from '../data.jsx';
import { ErrorBox, Icon, Modal, Spinner, useToast } from './ui.jsx';
import CameraCapture from './CameraCapture.jsx';

const PREPARACION = [
  { id: 'sin', label: 'Sin aceite ni mantequilla', texto: 'sin aceite ni mantequilla' },
  { id: 'poco', label: 'Con poco aceite', texto: 'con poco aceite o mantequilla (alrededor de una cucharadita)' },
  { id: 'bastante', label: 'Frito o con bastante aceite', texto: 'frito o con bastante aceite o mantequilla' },
  { id: 'nose', label: 'No sé', texto: null },
];

/** Texto extra para la IA: escala de la foto guiada y forma de preparación. */
function contextoExtra(foto, prep) {
  const partes = [];
  const g = foto?.guia;
  if (g) {
    partes.push(g.platoCm
      ? `Foto tomada desde arriba con guía: el plato ocupa el círculo central y mide ${g.platoCm} cm de diámetro; el ancho total de la imagen equivale a unos ${g.anchoCm} cm. Use esa escala para estimar el tamaño y el volumen de cada porción.`
      : 'Foto tomada desde arriba con el plato centrado y ocupando casi toda la imagen.');
  }
  const t = PREPARACION.find((x) => x.id === prep)?.texto;
  if (t) partes.push(`Preparación indicada por la persona: ${t}.`);
  return partes.join(' ');
}

export function tipoPorHora(d = new Date()) {
  const h = d.getHours();
  if (h < 11) return 'desayuno';
  if (h < 16) return 'almuerzo';
  if (h < 20) return 'once';
  return 'cena';
}

const itemVacio = () => ({ nombre: '', cantidad: '', gramos: 0, kcal: 0, proteina_g: 0, carbohidratos_g: 0, grasas_g: 0 });
const n = (v) => {
  const x = parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(x) && x >= 0 ? x : 0;
};

/**
 * Registro de una comida.
 * modo: 'foto' (por defecto) o 'texto' (escribir lo que comió).
 * inicial: valores precargados (desde el escáner o una sugerencia).
 * La foto solo se usa para el análisis; se guarda únicamente si la comida
 * se guarda como frecuente.
 */
/** Convierte una comida guardada en los valores iniciales del formulario de edición. */
function desdeComida(c) {
  const items = Array.isArray(c.items) && c.items.length
    ? c.items
    : [{ nombre: c.description, cantidad: '', gramos: 0, kcal: c.kcal, proteina_g: c.protein_g, carbohidratos_g: c.carbs_g, grasas_g: c.fat_g }];
  return {
    titulo: 'Editar comida', tipo: c.meal_type, nombre: c.description,
    items: items.map((it) => ({ ...itemVacio(), ...it })),
  };
}

export default function MealForm({ fecha, onClose, modo = 'foto', inicial: inicialProp, editar }) {
  const inicial = inicialProp ?? (editar ? desdeComida(editar) : undefined);
  const { userId, reload } = useData();
  const toast = useToast();
  const [tipo, setTipo] = useState(inicial?.tipo ?? tipoPorHora());
  const [conFoto, setConFoto] = useState(modo !== 'texto');
  const [foto, setFoto] = useState(null); // { blob, base64, preview }
  const [descripcion, setDescripcion] = useState('');
  const [respuestas, setRespuestas] = useState('');
  const [resultado, setResultado] = useState(null); // respuesta de la IA
  const [items, setItems] = useState(inicial?.items ?? []);
  const [nombre, setNombre] = useState(inicial?.nombre ?? '');
  const [guardarFav, setGuardarFav] = useState(false);
  const [estado, setEstado] = useState('editando'); // editando | analizando | guardando
  const [error, setError] = useState(null);
  const [camara, setCamara] = useState(false); // cámara propia con círculo guía
  const [camaraNativa, setCamaraNativa] = useState(false); // si la propia falló
  const [prep, setPrep] = useState(null);
  const camaraRef = useRef(null);
  const galeriaRef = useRef(null);

  const total = items.reduce(
    (a, it) => ({
      kcal: a.kcal + n(it.kcal),
      p: a.p + n(it.proteina_g),
      c: a.c + n(it.carbohidratos_g),
      g: a.g + n(it.grasas_g),
    }),
    { kcal: 0, p: 0, c: 0, g: 0 },
  );

  async function elegirFoto(e) {
    const file = e.target.files?.[0];
    e.target.value = ''; // permite volver a elegir la misma foto
    if (!file) return;
    setError(null);
    try {
      setFoto(await comprimirImagen(file));
    } catch (err) {
      setError(err.message);
    }
  }

  function abrirCamara() {
    if (camaraNativa) camaraRef.current?.click();
    else setCamara(true);
  }

  async function analizar(conRespuestas = false) {
    if (!foto && !descripcion.trim()) {
      setError(conFoto ? 'Agregue una foto o describa el alimento.' : 'Escriba qué comió y en qué cantidad.');
      return;
    }
    setEstado('analizando');
    setError(null);
    const { data, error: err } = await supabase.functions.invoke('analyze-meal', {
      body: {
        image_base64: foto?.base64,
        media_type: 'image/jpeg',
        description: [descripcion.trim(), contextoExtra(foto, prep)].filter(Boolean).join('\n'),
        meal_type: TIPOS_COMIDA.find((t) => t.id === tipo)?.label,
        answers: conRespuestas ? respuestas : undefined,
      },
    });
    setEstado('editando');
    if (err || data?.error) {
      setError(data?.error ?? (await mensajeError(err)));
      return;
    }
    setResultado(data);
    setItems(data.items.length ? data.items : [itemVacio()]);
    setNombre(data.plato);
    setRespuestas('');
  }

  function editarItem(i, campo, valor) {
    setItems((prev) => prev.map((it, j) => (j === i ? { ...it, [campo]: valor } : it)));
  }

  async function guardar() {
    const validos = items.filter((it) => it.nombre.trim() || n(it.kcal) > 0);
    if (!validos.length) {
      setError('Agregue al menos un alimento con calorías.');
      return;
    }
    setEstado('guardando');
    setError(null);
    try {
      // La foto solo se conserva en las comidas frecuentes.
      let fotoFavorita = null;
      if (guardarFav && foto?.blob) {
        fotoFavorita = `${userId}/frecuentes/${uuid()}.jpg`;
        const up = await supabase.storage.from('meal-photos').upload(fotoFavorita, foto.blob, { contentType: 'image/jpeg' });
        if (up.error) fotoFavorita = null; // si falla la foto, igual se guarda la comida
      }
      const limpios = validos.map((it) => ({
        ...it,
        kcal: Math.round(n(it.kcal)),
        proteina_g: n(it.proteina_g),
        carbohidratos_g: n(it.carbohidratos_g),
        grasas_g: n(it.grasas_g),
      }));
      const desc = nombre.trim() || limpios.map((it) => it.nombre).join(', ') || 'Comida';
      const fila = {
        user_id: userId,
        log_date: fecha,
        meal_type: tipo,
        description: desc,
        kcal: Math.round(total.kcal),
        protein_g: Math.round(total.p * 10) / 10,
        carbs_g: Math.round(total.c * 10) / 10,
        fat_g: Math.round(total.g * 10) / 10,
        items: limpios,
        ai_confidence: resultado?.confianza ?? inicial?.confianza ?? null,
        source: resultado || inicial?.fuente === 'ia' ? 'ia' : 'manual',
        photo_path: null,
      };
      const { error: e1 } = editar
        ? await supabase.from('meals').update({
          meal_type: fila.meal_type, description: fila.description, kcal: fila.kcal,
          protein_g: fila.protein_g, carbs_g: fila.carbs_g, fat_g: fila.fat_g, items: fila.items,
        }).eq('id', editar.id)
        : await supabase.from('meals').insert(fila);
      if (e1) throw e1;
      if (guardarFav) {
        const { error: e2 } = await supabase.from('favorite_meals').insert({
          user_id: userId, name: desc, meal_type: tipo, kcal: fila.kcal,
          protein_g: fila.protein_g, carbs_g: fila.carbs_g, fat_g: fila.fat_g, items: limpios,
          photo_path: fotoFavorita,
        });
        if (e2) throw e2;
      }
      toast(editar ? `✅ ${desc} actualizada` : `✅ ${desc}: ${fila.kcal} kcal registradas`);
      await reload();
      onClose(true);
    } catch (e) {
      setError(e.message ?? String(e));
      setEstado('editando');
    }
  }

  async function eliminar() {
    if (!confirm(`¿Eliminar "${editar.description}"?`)) return;
    setEstado('guardando');
    const { error: e } = await supabase.from('meals').delete().eq('id', editar.id);
    if (e) {
      setError(e.message);
      setEstado('editando');
      return;
    }
    if (editar.photo_path) await supabase.storage.from('meal-photos').remove([editar.photo_path]);
    toast('Comida eliminada');
    await reload();
    onClose(true);
  }

  const ocupado = estado !== 'editando';

  // Botón principal fijo abajo, al alcance del pulgar.
  let pie = null;
  if (items.length) {
    pie = (
      <button className="btn primary big block" disabled={ocupado} onClick={guardar}>
        {estado === 'guardando' ? <><Spinner /> Guardando…</> : <>{editar ? 'Guardar cambios' : 'Guardar'} · <span className="num">{fmt(total.kcal)} kcal</span></>}
      </button>
    );
  } else if (!inicial) {
    pie = (
      <button className="btn primary big block" disabled={ocupado} onClick={() => analizar(false)}>
        {estado === 'analizando'
          ? <><Spinner /> {conFoto ? 'Analizando su plato…' : 'Calculando…'}</>
          : <><span className="emoji" aria-hidden="true">✨</span> {conFoto ? 'Analizar con IA' : 'Calcular con IA'}</>}
      </button>
    );
  }

  return (
    <Modal title={inicial?.titulo ?? (conFoto ? 'Registrar con foto' : 'Escribir lo que comí')} onClose={() => onClose(false)} footer={pie}>
      <div className="stack">
        <div className="chips scroll" role="radiogroup" aria-label="Tipo de comida">
          {TIPOS_COMIDA.map((t) => (
            <button key={t.id} role="radio" aria-checked={tipo === t.id} className={`chip${tipo === t.id ? ' on' : ''}`} onClick={() => setTipo(t.id)}>
              <span className="emoji" aria-hidden="true">{t.emoji}</span>{t.label}
            </button>
          ))}
        </div>

        {!inicial && conFoto && (foto ? (
          <div className="stack" style={{ gap: 6 }}>
            <img src={foto.preview} alt="Foto de la comida" className="preview-img" />
            <div className="photo-change">
              <button className="btn small ghost" disabled={ocupado} onClick={abrirCamara}>📷 Otra foto</button>
              <button className="btn small ghost" disabled={ocupado} onClick={() => galeriaRef.current?.click()}>🖼️ De la galería</button>
            </div>
          </div>
        ) : (
          <div className="stack" style={{ gap: 6 }}>
            <div className="photo-picks">
              <button className="photo-pick" onClick={abrirCamara}>
                <span className="emoji" aria-hidden="true">📷</span>
                <b>Tomar foto</b>
              </button>
              <button className="photo-pick" onClick={() => galeriaRef.current?.click()}>
                <span className="emoji" aria-hidden="true">🖼️</span>
                <b>Elegir de la galería</b>
              </button>
            </div>
            <small className="muted" style={{ textAlign: 'center' }}>Si hay etiqueta nutricional, fotografíela también</small>
          </div>
        ))}
        {!inicial && (conFoto || descripcion.trim()) && (
          <div className="stack" style={{ gap: 6 }}>
            <small className="muted">¿Cómo se preparó? (el aceite no se ve en la foto)</small>
            <div className="chips prep-chips" role="radiogroup" aria-label="Preparación">
              {PREPARACION.map((x) => (
                <button key={x.id} role="radio" aria-checked={prep === x.id} className={`chip${prep === x.id ? ' on' : ''}`}
                  disabled={ocupado} onClick={() => setPrep(prep === x.id ? null : x.id)}>{x.label}</button>
              ))}
            </div>
          </div>
        )}
        {camara && (
          <CameraCapture
            onClose={() => setCamara(false)}
            onCapture={(f) => { setFoto(f); setError(null); setCamara(false); }}
            onFallback={() => {
              setCamara(false);
              setCamaraNativa(true);
              setError('No se pudo abrir la cámara con guía. Toque "Tomar foto" otra vez para usar la cámara del teléfono.');
            }}
          />
        )}
        <input ref={camaraRef} type="file" accept="image/*" capture="environment" hidden onChange={elegirFoto} />
        <input ref={galeriaRef} type="file" accept="image/*" hidden onChange={elegirFoto} />

        {!inicial && (
          <>
            <label className="field">
              {conFoto ? 'Datos relevantes (porción, gramos, preparación, marca)' : '¿Qué comió o bebió, y cuánto?'}
              <textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} autoFocus={!conFoto}
                placeholder={conFoto
                  ? 'Ej: arroz con pollo al horno, 1 taza de arroz, pechuga de 150 g, una cucharada de aceite'
                  : 'Ej: 2 huevos revueltos, una marraqueta con media palta y un café con leche'} />
            </label>

            <div className="stack" style={{ gap: 8 }}>
              {items.length > 0 && (
                <button className="btn block" disabled={ocupado} onClick={() => analizar(false)}>
                  {estado === 'analizando' ? <><Spinner /> Analizando…</> : <><span className="emoji" aria-hidden="true">✨</span> {resultado ? 'Volver a analizar' : 'Analizar con IA'}</>}
                </button>
              )}
              {!items.length && (
                <div className="row" style={{ justifyContent: 'center', gap: 4, flexWrap: 'wrap' }}>
                  {!conFoto && <button className="btn small ghost" disabled={ocupado} onClick={() => setConFoto(true)}>Agregar una foto</button>}
                  <button className="btn small ghost" disabled={ocupado} onClick={() => setItems([itemVacio()])}>Ingresar los valores a mano</button>
                </div>
              )}
            </div>
          </>
        )}

        <ErrorBox>{error}</ErrorBox>

        {resultado && (
          <div className="card stack" style={{ gap: 8 }}>
            <div className="row between">
              <h3 style={{ fontSize: '1.2rem' }}>{resultado.plato}</h3>
              <span className={`pill ${resultado.confianza >= 0.75 ? 'ok' : resultado.confianza >= 0.5 ? 'leve' : 'exceso'}`}>
                Confianza {fmt(resultado.confianza * 100)}%
              </span>
            </div>
            <div className="result-total">
              <div className="kpi"><b className="num">{fmt(resultado.total.kcal)}</b><span>kcal</span></div>
              <div className="kpi"><b className="num" style={{ color: 'var(--ciruela)' }}>{fmt(resultado.total.proteina_g)} g</b><span>Proteína</span></div>
              <div className="kpi"><b className="num" style={{ color: 'var(--zapallo)' }}>{fmt(resultado.total.carbohidratos_g)} g</b><span>Carbos</span></div>
              <div className="kpi"><b className="num" style={{ color: 'var(--aceite)' }}>{fmt(resultado.total.grasas_g)} g</b><span>Grasas</span></div>
            </div>
            {resultado.supuestos.length > 0 && (
              <div>
                <small><b>Supuestos de la IA:</b></small>
                <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                  {resultado.supuestos.map((s) => <li key={s}><small>{s}</small></li>)}
                </ul>
              </div>
            )}
            {resultado.preguntas.length > 0 && (
              <div className="alert warn stack" style={{ gap: 6 }}>
                <b>Para mejorar la precisión:</b>
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {resultado.preguntas.map((q) => <li key={q}>{q}</li>)}
                </ul>
                <textarea value={respuestas} onChange={(e) => setRespuestas(e.target.value)} placeholder="Escriba sus respuestas aquí" />
                <button className="btn primary" disabled={ocupado || !respuestas.trim()} onClick={() => analizar(true)}>
                  {estado === 'analizando' ? <><Spinner /> Recalculando…</> : 'Volver a calcular con mis respuestas'}
                </button>
              </div>
            )}
          </div>
        )}

        {items.length > 0 && (
          <div className="card stack" style={{ gap: 8 }}>
            {!editar && <h3>Revise y ajuste si es necesario</h3>}
            <label className="field">
              Nombre del registro
              <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: Almuerzo casero" />
            </label>
            {items.map((it, i) => (
              <div className="item-card" key={i}>
                <div className="item-name">
                  <input value={it.nombre} placeholder="Alimento" aria-label="Alimento"
                    onChange={(e) => editarItem(i, 'nombre', e.target.value)} />
                  <button className="icon-btn" aria-label="Quitar alimento" onClick={() => setItems((p) => p.filter((_, j) => j !== i))}>
                    <Icon name="x" size={18} />
                  </button>
                </div>
                {it.cantidad && <span className="porcion">Porción estimada: {it.cantidad}</span>}
                <div className="item-nums">
                  <label>kcal<input inputMode="decimal" value={it.kcal} onChange={(e) => editarItem(i, 'kcal', e.target.value)} onFocus={(e) => e.target.select()} /></label>
                  <label style={{ color: 'var(--ciruela)' }}>Prot. g<input inputMode="decimal" value={it.proteina_g} onChange={(e) => editarItem(i, 'proteina_g', e.target.value)} onFocus={(e) => e.target.select()} /></label>
                  <label style={{ color: 'var(--zapallo)' }}>Carb. g<input inputMode="decimal" value={it.carbohidratos_g} onChange={(e) => editarItem(i, 'carbohidratos_g', e.target.value)} onFocus={(e) => e.target.select()} /></label>
                  <label style={{ color: 'var(--aceite)' }}>Grasa g<input inputMode="decimal" value={it.grasas_g} onChange={(e) => editarItem(i, 'grasas_g', e.target.value)} onFocus={(e) => e.target.select()} /></label>
                </div>
              </div>
            ))}
            <button className="btn small" onClick={() => setItems((p) => [...p, itemVacio()])}><Icon name="mas" size={18} /> Agregar alimento</button>
            <div className="result-total">
              <div className="kpi"><b className="num">{fmt(total.kcal)}</b><span>kcal</span></div>
              <div className="kpi"><b className="num" style={{ color: 'var(--ciruela)' }}>{fmt(total.p)} g</b><span>Proteína</span></div>
              <div className="kpi"><b className="num" style={{ color: 'var(--zapallo)' }}>{fmt(total.c)} g</b><span>Carbos</span></div>
              <div className="kpi"><b className="num" style={{ color: 'var(--aceite)' }}>{fmt(total.g)} g</b><span>Grasas</span></div>
            </div>
            <label className="check">
              <input type="checkbox" checked={guardarFav} onChange={(e) => setGuardarFav(e.target.checked)} />
              <span>Guardar como comida frecuente{foto ? ' (con su foto)' : ''}</span>
            </label>
            {foto && !guardarFav && <small>La foto solo se usó para el análisis y no quedará guardada.</small>}
            {editar && (
              <button className="btn ghost danger block" disabled={ocupado} onClick={eliminar}>Eliminar comida</button>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
