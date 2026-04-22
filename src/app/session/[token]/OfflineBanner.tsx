'use client';

import { useOnlineStatus } from '@/lib/client/use-online-status';

// Banner discreto que aparece arriba del chat cuando el navegador pierde
// conexión. El input sigue siendo editable (el borrador se guarda en
// localStorage), pero los botones de envío se deshabilitan desde el
// componente padre, que también consulta useOnlineStatus.
export function OfflineBanner() {
  const online = useOnlineStatus();
  if (online) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="mb-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900"
    >
      <strong className="font-medium">Sin conexión.</strong>{' '}
      No cierres la pestaña: tu texto se está guardando en este dispositivo
      y se enviará cuando vuelvas a tener red.
    </div>
  );
}
