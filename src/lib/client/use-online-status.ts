'use client';

import { useEffect, useState } from 'react';

// Hook que devuelve si el navegador cree que está online. Escucha los
// eventos `online`/`offline` del window. `navigator.onLine` puede tener
// falsos positivos (el OS cree tener red pero la aplicación no alcanza
// el servidor), así que lo combinamos con un flag que los componentes
// pueden forzar cuando detectan un fallo de red explícito.

export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState<boolean>(() => {
    if (typeof navigator === 'undefined') return true;
    return navigator.onLine;
  });

  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);

  return online;
}
