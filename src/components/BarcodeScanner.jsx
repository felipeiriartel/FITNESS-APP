import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { TIPOS_COMIDA } from '../lib/calc.js';
import { buscarProducto, tieneNutricion } from '../lib/openfoodfacts.js';
import { fmt } from '../lib/format.js';
import { useData } from '../data.jsx';
import { tipoPorHora } from './MealForm.jsx';
import { ErrorBox, Modal, Spinner, useToast } from './ui.jsx';

const r1 = (n) => Math.round(n * 10) / 10;

/**
 * Escanea el código de barras con la cámara (o desde una foto, o escrito a mano),
 * busca el producto en Open Food Facts y registra la porción consumida.
 */
export default function BarcodeScanner({ fecha, onClose, abrir }) {
  const { userId, reload } = useData();
  const toast = useToast();
  const videoRef = useRef(null);
  const controlsRef = useRef(null);
  const fotoRef = useRef(null);
  const [fase, setFase] = useState('camara'); // camara | buscando | producto | noEncontrado
  const [camaraError, setCamaraError] = useState(null);
  const [codigoManual, setCodigoManual] = useState('');
  const [producto, setProducto] = useState(null);
  const [gramos, setGramos] = useState('100');
  const [tipo, setTipo] = useState(tipoPorHora());
  const [guardarFav, setGuardarFav] = useState(false);
  const [error, setError] = useState(null);
  const [ocupado, setOcupado] = useState(false);

  const detenerCamara = () => {
    controlsRef.current?.stop();
    controlsRef.current = null;
  };

  // Enciende la cámara mientras se está en la fase de escaneo.
  useEffect(() => {
    if (fase !== 'camara') return undefined;
    let cancelado = false;
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('sin-camara');
        const { BrowserMultiFormatReader } = await import('@zxing/browser');
        if (cancelado) return;
        const lector = new BrowserMultiFormatReader();
        const controls = await lector.decodeFromConstraints(
          { video: { facingMode: { ideal: 'environment' } } },
          videoRef.current,
          (resultado, _err, ctrl) => {
            if (resultado) {
              ctrl.stop();
              navigator.vibrate?.(60);
              consultar(resultado.getText());
            }
          },
        );
        if (cancelado) controls.stop();
        else controlsRef.current = controls;
      } catch (e) {
        if (!cancelado) {
          setCamaraError(
            e?.name === 'NotAllowedError'
              ? 'No hay permiso para usar la cámara. Puede permitirlo en la configuración del navegador, o escribir el código.'
              : 'No se pudo abrir la cámara. Puede fotografiar el código o escribirlo.',
          );
        }
      }
    })();
    return () => {
      cancelado = true;
      detenerCamara();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fase]);

  async function consultar(codigo) {
    detenerCamara();
    setError(null);
    setFase('buscando');
    try {
      const p = await buscarProducto(codigo);
      if (!p || !tieneNutricion(p)) {
        setProducto(p ? { ...p, sinNutricion: true } : { codigo: String(codigo).replace(/\D/g, '') });
        setFase('noEncontrado');
        return;
      }
      setProducto(p);
      setGramos(String(p.porcionGramos ? Math.round(p.porcionGramos) : 100));
      setFase('producto');
    } catch (e) {
      setError(e.message);
      setFase('camara');
    }
  }

  async function leerFoto(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(null);
    const url = URL.createObjectURL(file);
    try {
      const { BrowserMultiFormatReader } = await import('@zxing/browser');
      const resultado = await new BrowserMultiFormatReader().decodeFromImageUrl(url);
      consultar(resultado.getText());
    } catch {
      setError('No se pudo leer el código en la foto. Intente más cerca, con buena luz, o escríbalo.');
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  const g = Math.max(0, parseFloat(String(gramos).replace(',', '.')) || 0);
  const calc = producto?.por100
    ? {
      kcal: Math.round(((producto.por100.kcal ?? 0) * g) / 100),
      p: r1(((producto.por100.proteina ?? 0) * g) / 100),
      c: r1(((producto.por100.carbohidratos ?? 0) * g) / 100),
      gr: r1(((producto.por100.grasas ?? 0) * g) / 100),
    }
    : null;

  async function registrar() {
    if (!g) return setError('Indique cuántos gramos o ml consumió.');
    setOcupado(true);
    setError(null);
    const nombre = producto.marca ? `${producto.nombre} (${producto.marca})` : producto.nombre;
    const item = {
      nombre, cantidad: `${fmt(g)} g/ml`, gramos: g, kcal: calc.kcal,
      proteina_g: calc.p, carbohidratos_g: calc.c, grasas_g: calc.gr, codigo_barras: producto.codigo,
    };
    const fila = {
      user_id: userId, log_date: fecha, meal_type: tipo, description: `${nombre}, ${fmt(g)} g`,
      kcal: calc.kcal, protein_g: calc.p, carbs_g: calc.c, fat_g: calc.gr, items: [item], source: 'manual',
    };
    const { error: e1 } = await supabase.from('meals').insert(fila);
    if (!e1 && guardarFav) {
      await supabase.from('favorite_meals').insert({
        user_id: userId, name: fila.description, meal_type: tipo, kcal: fila.kcal,
        protein_g: fila.protein_g, carbs_g: fila.carbs_g, fat_g: fila.fat_g, items: [item],
      });
    }
    setOcupado(false);
    if (e1) return setError(e1.message);
    toast(`✅ ${producto.nombre}: ${calc.kcal} kcal registradas`);
    await reload();
    onClose();
  }

  return (
    <Modal title="Código de barras" onClose={onClose}>
      <div className="stack">
        {fase === 'camara' && (
          <>
            {!camaraError ? (
              <div className="scanner">
                <video ref={videoRef} muted playsInline />
                <div className="scanner-frame" aria-hidden="true" />
                <p className="scanner-hint">Apunte al código de barras del envase</p>
              </div>
            ) : (
              <div className="alert warn">{camaraError}</div>
            )}
            <ErrorBox>{error}</ErrorBox>
            <button className="btn block" onClick={() => fotoRef.current?.click()}>
              <span className="emoji" aria-hidden="true">🖼️</span> Leer el código desde una foto
            </button>
            <input ref={fotoRef} type="file" accept="image/*" hidden onChange={leerFoto} />
            <div className="row">
              <input inputMode="numeric" placeholder="O escriba el código (ej: 7801234567890)" value={codigoManual}
                onChange={(e) => setCodigoManual(e.target.value.replace(/\D/g, ''))} aria-label="Código de barras" />
              <button className="btn primary" disabled={codigoManual.length < 6} onClick={() => consultar(codigoManual)}>Buscar</button>
            </div>
          </>
        )}

        {fase === 'buscando' && (
          <div className="empty"><span className="emoji">🔎</span>Buscando el producto…</div>
        )}

        {fase === 'noEncontrado' && (
          <div className="stack">
            <div className="empty">
              <span className="emoji">🤔</span>
              {producto?.sinNutricion
                ? <>Encontramos <b>{producto.nombre}</b>, pero no tiene información nutricional registrada.</>
                : <>El código {producto?.codigo} no está en la base de productos.</>}
            </div>
            <p className="muted" style={{ textAlign: 'center' }}>
              Fotografíe la tabla nutricional del envase y la IA la leerá por usted.
            </p>
            <button className="btn primary big block" onClick={() => abrir('comida')}>
              <span className="emoji" aria-hidden="true">📷</span> Fotografiar la etiqueta
            </button>
            <button className="btn ghost block" onClick={() => { setProducto(null); setFase('camara'); }}>Escanear otro código</button>
          </div>
        )}

        {fase === 'producto' && producto && (
          <div className="stack">
            <div className="row" style={{ alignItems: 'flex-start' }}>
              {producto.imagen
                ? <img className="thumb" src={producto.imagen} alt="" style={{ objectFit: 'contain', background: '#fff' }} />
                : <div className="thumb" aria-hidden="true">📦</div>}
              <div className="grow">
                <h3>{producto.nombre}</h3>
                <small>{[producto.marca, producto.cantidadEnvase].filter(Boolean).join(', ')}</small>
              </div>
            </div>
            <small className="muted num">
              Por 100 g/ml: {fmt(producto.por100.kcal)} kcal, {fmt(producto.por100.proteina, 1)} g de proteína,
              {' '}{fmt(producto.por100.carbohidratos, 1)} g de carbohidratos y {fmt(producto.por100.grasas, 1)} g de grasas.
            </small>

            <label className="field">
              ¿Cuánto consumió? (g o ml)
              <input inputMode="decimal" value={gramos} onChange={(e) => setGramos(e.target.value)} />
            </label>
            <div className="chips">
              {producto.porcionGramos && (
                <button className="chip" onClick={() => setGramos(String(Math.round(producto.porcionGramos)))}>
                  {producto.porcionTexto || `1 porción (${Math.round(producto.porcionGramos)} g)`}
                </button>
              )}
              {[100, 200, 250].map((v) => (
                <button key={v} className="chip" onClick={() => setGramos(String(v))}>{v} g/ml</button>
              ))}
            </div>

            <div className="result-total">
              <div className="kpi"><b className="num">{fmt(calc.kcal)}</b><span>kcal</span></div>
              <div className="kpi"><b className="num" style={{ color: 'var(--ciruela)' }}>{fmt(calc.p)} g</b><span>Proteína</span></div>
              <div className="kpi"><b className="num" style={{ color: 'var(--zapallo)' }}>{fmt(calc.c)} g</b><span>Carbos</span></div>
              <div className="kpi"><b className="num" style={{ color: 'var(--aceite)' }}>{fmt(calc.gr)} g</b><span>Grasas</span></div>
            </div>

            <div className="chips" role="radiogroup" aria-label="Tipo de comida">
              {TIPOS_COMIDA.map((t) => (
                <button key={t.id} role="radio" aria-checked={tipo === t.id} className={`chip${tipo === t.id ? ' on' : ''}`} onClick={() => setTipo(t.id)}>
                  <span className="emoji" aria-hidden="true">{t.emoji}</span>{t.label}
                </button>
              ))}
            </div>
            <label className="check">
              <input type="checkbox" checked={guardarFav} onChange={(e) => setGuardarFav(e.target.checked)} />
              <span>Guardar como comida frecuente</span>
            </label>
            <ErrorBox>{error}</ErrorBox>
            <button className="btn primary big block" disabled={ocupado} onClick={registrar}>
              {ocupado ? <><Spinner /> Guardando…</> : 'Registrar'}
            </button>
            <button className="btn ghost block" onClick={() => { setProducto(null); setFase('camara'); }}>Escanear otro producto</button>
            <small className="muted" style={{ textAlign: 'center' }}>Datos de Open Food Facts, base abierta mantenida por voluntarios. Verifique con la etiqueta si algo no calza.</small>
          </div>
        )}
      </div>
    </Modal>
  );
}
