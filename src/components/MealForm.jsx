import { useRef, useState } from 'react';
import { supabase, mensajeError } from '../lib/supabase.js';
import { comprimirImagen } from '../lib/image.js';
import { TIPOS_COMIDA } from '../lib/calc.js';
import { fmt, uuid } from '../lib/format.js';
import { useData } from '../data.jsx';
import { ErrorBox, Icon, Modal } from './ui.jsx';

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

export default function MealForm({ fecha, onClose }) {
  const { userId, reload } = useData();
  const [tipo, setTipo] = useState(tipoPorHora());
  const [foto, setFoto] = useState(null); // { blob, base64, preview }
  const [descripcion, setDescripcion] = useState('');
  const [respuestas, setRespuestas] = useState('');
  const [resultado, setResultado] = useState(null); // respuesta de la IA
  const [items, setItems] = useState([]);
  const [nombre, setNombre] = useState('');
  const [guardarFav, setGuardarFav] = useState(false);
  const [estado, setEstado] = useState('editando'); // editando | analizando | guardando
  const [error, setError] = useState(null);
  const inputRef = useRef(null);

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
    if (!file) return;
    setError(null);
    try {
      setFoto(await comprimirImagen(file));
    } catch (err) {
      setError(err.message);
    }
  }

  async function analizar(conRespuestas = false) {
    if (!foto && !descripcion.trim()) {
      setError('Agregue una foto o describa el alimento.');
      return;
    }
    setEstado('analizando');
    setError(null);
    const { data, error: err } = await supabase.functions.invoke('analyze-meal', {
      body: {
        image_base64: foto?.base64,
        media_type: 'image/jpeg',
        description: descripcion,
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
      let photo_path = null;
      if (foto?.blob) {
        photo_path = `${userId}/${uuid()}.jpg`;
        const up = await supabase.storage.from('meal-photos').upload(photo_path, foto.blob, { contentType: 'image/jpeg' });
        if (up.error) photo_path = null; // si falla la foto, igual se guarda el registro
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
        ai_confidence: resultado?.confianza ?? null,
        source: resultado ? 'ia' : 'manual',
        photo_path,
      };
      const { error: e1 } = await supabase.from('meals').insert(fila);
      if (e1) throw e1;
      if (guardarFav) {
        const { error: e2 } = await supabase.from('favorite_meals').insert({
          user_id: userId, name: desc, meal_type: tipo, kcal: fila.kcal,
          protein_g: fila.protein_g, carbs_g: fila.carbs_g, fat_g: fila.fat_g, items: limpios,
        });
        if (e2) throw e2;
      }
      await reload();
      onClose(true);
    } catch (e) {
      setError(e.message ?? String(e));
      setEstado('editando');
    }
  }

  const ocupado = estado !== 'editando';

  return (
    <Modal title="Registrar comida o bebida" onClose={() => onClose(false)}>
      <div className="stack">
        <div className="seg" role="tablist" style={{ flexWrap: 'wrap' }}>
          {TIPOS_COMIDA.map((t) => (
            <button key={t.id} className={tipo === t.id ? 'on' : ''} onClick={() => setTipo(t.id)}>{t.label}</button>
          ))}
        </div>

        {foto ? (
          <div className="stack" style={{ gap: 6 }}>
            <img src={foto.preview} alt="Foto de la comida" className="preview-img" />
            <button className="btn small ghost" onClick={() => setFoto(null)}>Quitar foto</button>
          </div>
        ) : (
          <button className="btn block" onClick={() => inputRef.current?.click()} style={{ minHeight: 64 }}>
            <span className="row" style={{ justifyContent: 'center' }}><Icon name="camara" /> Tomar o elegir foto</span>
          </button>
        )}
        <input ref={inputRef} type="file" accept="image/*" capture="environment" hidden onChange={elegirFoto} />

        <label className="field">
          Datos relevantes (porción, gramos, preparación, marca)
          <textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)}
            placeholder="Ej: arroz con pollo al horno, 1 taza de arroz, pechuga de 150 g, una cucharada de aceite" />
        </label>

        <div className="row wrap">
          <button className="btn primary grow" disabled={ocupado} onClick={() => analizar(false)}>
            {estado === 'analizando' ? 'Analizando…' : 'Analizar con IA'}
          </button>
          {!items.length && (
            <button className="btn" disabled={ocupado} onClick={() => setItems([itemVacio()])}>Ingresar a mano</button>
          )}
        </div>

        <ErrorBox>{error}</ErrorBox>

        {resultado && (
          <div className="card stack" style={{ gap: 8 }}>
            <div className="row between">
              <h3>{resultado.plato}</h3>
              <span className={`pill ${resultado.confianza >= 0.75 ? 'ok' : resultado.confianza >= 0.5 ? 'leve' : 'exceso'}`}>
                Confianza {fmt(resultado.confianza * 100)}%
              </span>
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
                <button className="btn small" disabled={ocupado || !respuestas.trim()} onClick={() => analizar(true)}>
                  Volver a calcular con mis respuestas
                </button>
              </div>
            )}
          </div>
        )}

        {items.length > 0 && (
          <div className="card stack" style={{ gap: 8 }}>
            <label className="field">
              Nombre del registro
              <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: Almuerzo casero" />
            </label>
            <div className="item-edit head">
              <span>Alimento</span><span>kcal</span><span>Prot.</span><span>Carb.</span><span>Grasa</span><span />
            </div>
            {items.map((it, i) => (
              <div className="item-edit" key={i}>
                <input value={it.nombre} placeholder={it.cantidad || 'Alimento'} aria-label="Alimento"
                  onChange={(e) => editarItem(i, 'nombre', e.target.value)} title={it.cantidad} />
                <input inputMode="decimal" value={it.kcal} aria-label="Calorías" onChange={(e) => editarItem(i, 'kcal', e.target.value)} />
                <input inputMode="decimal" value={it.proteina_g} aria-label="Proteína" onChange={(e) => editarItem(i, 'proteina_g', e.target.value)} />
                <input inputMode="decimal" value={it.carbohidratos_g} aria-label="Carbohidratos" onChange={(e) => editarItem(i, 'carbohidratos_g', e.target.value)} />
                <input inputMode="decimal" value={it.grasas_g} aria-label="Grasas" onChange={(e) => editarItem(i, 'grasas_g', e.target.value)} />
                <button className="icon-btn" aria-label="Quitar" onClick={() => setItems((p) => p.filter((_, j) => j !== i))}>
                  <Icon name="x" size={16} />
                </button>
              </div>
            ))}
            {items.some((it) => it.cantidad) && (
              <small>Porciones estimadas: {items.filter((it) => it.cantidad).map((it) => `${it.nombre} (${it.cantidad})`).join(' · ')}</small>
            )}
            <button className="btn small" onClick={() => setItems((p) => [...p, itemVacio()])}>+ Agregar alimento</button>
            <div className="grid3" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
              <div className="kpi"><b className="num">{fmt(total.kcal)}</b><span>kcal</span></div>
              <div className="kpi"><b className="num">{fmt(total.p, 1)} g</b><span>Proteína</span></div>
              <div className="kpi"><b className="num">{fmt(total.c, 1)} g</b><span>Carbohidratos</span></div>
              <div className="kpi"><b className="num">{fmt(total.g, 1)} g</b><span>Grasas</span></div>
            </div>
            <label className="row" style={{ gap: 8 }}>
              <input type="checkbox" checked={guardarFav} onChange={(e) => setGuardarFav(e.target.checked)} style={{ width: 18, minHeight: 18 }} />
              <span>Guardar como comida frecuente</span>
            </label>
            <button className="btn primary block" disabled={ocupado} onClick={guardar}>
              {estado === 'guardando' ? 'Guardando…' : 'Guardar registro'}
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}
