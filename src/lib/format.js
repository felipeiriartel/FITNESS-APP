export const fmt = (n, dec = 0) =>
  n == null || Number.isNaN(n) ? '—' : Number(n).toLocaleString('es-CL', { maximumFractionDigits: dec, minimumFractionDigits: dec });

export const fmtKg = (n, dec = 1) => (n == null ? '—' : `${fmt(n, dec)} kg`);

export const fmtSigno = (n, dec = 1) => (n == null ? '—' : `${n > 0 ? '+' : ''}${fmt(n, dec)}`);

export const uuid = () =>
  (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
