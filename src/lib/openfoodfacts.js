// Consulta de productos envasados en Open Food Facts (base abierta y gratuita).
const CAMPOS = [
  'product_name', 'product_name_es', 'generic_name_es', 'brands', 'quantity',
  'serving_size', 'serving_quantity', 'image_front_small_url', 'nutriments',
].join(',');

const num = (v) => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? n : null;
};

/** Busca un producto por código de barras. Devuelve null si no existe en la base. */
export async function buscarProducto(codigo) {
  const limpio = String(codigo).replace(/\D/g, '');
  if (limpio.length < 6) throw new Error('El código debe tener al menos 6 dígitos.');
  let r;
  try {
    r = await fetch(`https://world.openfoodfacts.org/api/v2/product/${limpio}.json?fields=${CAMPOS}`);
  } catch {
    throw new Error('No se pudo conectar con la base de productos. Revise su conexión.');
  }
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`La base de productos no respondió (HTTP ${r.status}). Intente en un momento.`);
  const data = await r.json();
  if (data.status === 0 || !data.product) return null;
  const p = data.product;
  const n = p.nutriments ?? {};
  let kcal100 = num(n['energy-kcal_100g']);
  if (kcal100 == null && num(n.energy_100g) != null) kcal100 = num(n.energy_100g) / 4.184; // kJ → kcal
  return {
    codigo: limpio,
    nombre: p.product_name_es || p.product_name || p.generic_name_es || 'Producto sin nombre',
    marca: (p.brands || '').split(',')[0].trim(),
    cantidadEnvase: p.quantity || '',
    porcionTexto: p.serving_size || '',
    porcionGramos: num(p.serving_quantity),
    imagen: p.image_front_small_url || null,
    por100: {
      kcal: kcal100,
      proteina: num(n.proteins_100g),
      carbohidratos: num(n.carbohydrates_100g),
      grasas: num(n.fat_100g),
    },
  };
}

/** Tiene al menos las calorías por 100 g/ml. */
export const tieneNutricion = (p) => p?.por100?.kcal != null;
