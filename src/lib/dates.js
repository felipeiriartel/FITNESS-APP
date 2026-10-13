// Fechas locales en formato ISO (YYYY-MM-DD). Se usa mediodía para evitar
// problemas con el cambio de horario en Chile.
const pad = (n) => String(n).padStart(2, '0');

export const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function fromISO(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}

export const todayISO = () => toISO(new Date());

export function addDays(iso, n) {
  const d = fromISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

/** Días entre a y b (b - a). */
export const diffDays = (a, b) => Math.round((fromISO(b) - fromISO(a)) / 86400000);

/** Lunes de la semana de la fecha dada. */
export function startOfWeek(iso) {
  const d = fromISO(iso);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return toISO(d);
}

export function ageOn(birthISO, onISO) {
  const b = fromISO(birthISO);
  const o = fromISO(onISO);
  let age = o.getFullYear() - b.getFullYear();
  if (o.getMonth() < b.getMonth() || (o.getMonth() === b.getMonth() && o.getDate() < b.getDate())) age--;
  return age;
}

export const DIAS_CORTOS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
export const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio',
  'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

export const formatLargo = (iso) =>
  fromISO(iso).toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' });

export const formatCorto = (iso) =>
  fromISO(iso).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' });
