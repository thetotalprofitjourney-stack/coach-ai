'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// Hook de borrador persistente en localStorage. Pensado para sobrevivir a
// un corte de luz, cierre accidental de pestaña o crash del navegador:
// el texto que el usuario estaba tecleando se restaura al volver a abrir
// el enlace. El borrador se borra explícitamente llamando a `clear()`
// (típicamente tras un envío con éxito).
//
// El key debe ser único por sesión + campo, p. ej.
// `coach-ai:draft:{token}:phase2:input`. Si el `window` no existe (SSR)
// devuelve siempre el initial.

const PREFIX = 'coach-ai:draft:';

function safeRead(fullKey: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  try {
    const v = window.localStorage.getItem(fullKey);
    return v ?? fallback;
  } catch {
    return fallback;
  }
}

function safeWrite(fullKey: string, value: string): void {
  if (typeof window === 'undefined') return;
  try {
    if (value.length === 0) {
      window.localStorage.removeItem(fullKey);
    } else {
      window.localStorage.setItem(fullKey, value);
    }
  } catch {
    // Quota excedida o modo privado con storage deshabilitado: mejor
    // silenciar que romper el flujo. El usuario pierde la resiliencia
    // pero el input sigue funcionando.
  }
}

function safeRemove(fullKey: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(fullKey);
  } catch {
    // Ver safeWrite.
  }
}

export interface UseInputDraftResult {
  value: string;
  setValue: (next: string) => void;
  clear: () => void;
}

export function useInputDraft(
  key: string,
  initial = '',
): UseInputDraftResult {
  const fullKey = PREFIX + key;
  const initialRef = useRef(initial);
  const [value, setValueState] = useState<string>(initial);

  // Hidrata desde localStorage en el primer efecto. No se hace en
  // useState(() => ...) porque rompería SSR (el servidor no tiene
  // localStorage) y forzaría marcar el componente como no-SSR.
  useEffect(() => {
    const stored = safeRead(fullKey, initialRef.current);
    if (stored !== initialRef.current) setValueState(stored);
  }, [fullKey]);

  const setValue = useCallback(
    (next: string) => {
      setValueState(next);
      safeWrite(fullKey, next);
    },
    [fullKey],
  );

  const clear = useCallback(() => {
    setValueState('');
    safeRemove(fullKey);
  }, [fullKey]);

  return { value, setValue, clear };
}
