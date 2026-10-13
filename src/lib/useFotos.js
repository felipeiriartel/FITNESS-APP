import { useEffect, useState } from 'react';
import { supabase } from './supabase.js';

/** Devuelve { ruta: urlFirmada } para las fotos privadas indicadas (válidas por 1 hora). */
export function useFotos(paths) {
  const clave = paths.filter(Boolean).sort().join('|');
  const [urls, setUrls] = useState({});
  useEffect(() => {
    const lista = clave ? clave.split('|') : [];
    if (!lista.length) {
      setUrls({});
      return;
    }
    let vigente = true;
    supabase.storage.from('meal-photos').createSignedUrls(lista, 3600).then(({ data }) => {
      if (vigente) setUrls(Object.fromEntries((data ?? []).filter((u) => u.signedUrl).map((u) => [u.path, u.signedUrl])));
    });
    return () => {
      vigente = false;
    };
  }, [clave]);
  return urls;
}
