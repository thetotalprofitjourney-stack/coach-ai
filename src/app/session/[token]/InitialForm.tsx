'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { formPayloadSchema, type FormPayload } from '@/lib/api/schemas';
import type { ResumeLinkData } from '@/lib/session/resume-link';
import { ResumeLinkNotice } from './ResumeLinkNotice';

// Clave de borrador en localStorage. El contenido es JSON parcial del
// FormPayload; si un corte de luz o crash del navegador rompe la sesión,
// al volver a abrir el enlace los campos se rehidratan. Se borra tras
// POST /form exitoso (ver onSubmit).
const DRAFT_KEY_PREFIX = 'coach-ai:draft:';
function draftKey(token: string) {
  return `${DRAFT_KEY_PREFIX}${token}:initial-form`;
}

type DraftShape = Partial<{
  name: string;
  age: number | '';
  familyContext: string;
  location: string;
  professionalMoment: string;
  trigger: string;
}>;

function readDraft(token: string): DraftShape | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(draftKey(token));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed as DraftShape;
  } catch {
    return null;
  }
}

function writeDraft(token: string, draft: DraftShape): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(draftKey(token), JSON.stringify(draft));
  } catch {
    // Quota / privado: silenciar.
  }
}

function clearDraft(token: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(draftKey(token));
  } catch {
    // Silenciar.
  }
}

// Opciones fijas de §2.3. "Otro" activa el input de texto libre; el valor
// enviado en ese caso es el texto que el usuario escriba.
const PROFESSIONAL_OPTIONS = [
  'En activo por cuenta ajena',
  'Autónomo',
  'Emprendedor',
  'Desempleado',
  'Próximo a jubilarse',
  'Otro',
] as const;

const OTHER = 'Otro';

type SubmitError =
  | { kind: 'not_found' }
  | { kind: 'generic'; message: string }
  | null;

export function InitialForm({
  token,
  resumeLink,
}: {
  token: string;
  resumeLink: ResumeLinkData;
}) {
  const router = useRouter();
  const [professionalChoice, setProfessionalChoice] = useState<string>('');
  const [submitError, setSubmitError] = useState<SubmitError>(null);

  const {
    register,
    handleSubmit,
    setValue,
    setError,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormPayload>({
    resolver: zodResolver(formPayloadSchema),
    mode: 'onSubmit',
    defaultValues: {
      name: '',
      familyContext: '',
      location: '',
      professionalMoment: '',
      trigger: '',
    },
  });

  // Rehidrata el borrador al montar. Si existen valores, setValue en
  // cada campo presente. No pisamos valores ya puestos por defaultValues
  // porque estos están vacíos; la primera renderización muestra los
  // campos vacíos y a los pocos ms se rellenan con el borrador. Mejor
  // un flash mínimo que un hydration mismatch SSR.
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    const draft = readDraft(token);
    if (!draft) return;
    if (typeof draft.name === 'string') setValue('name', draft.name);
    if (typeof draft.age === 'number') setValue('age', draft.age);
    if (typeof draft.familyContext === 'string')
      setValue('familyContext', draft.familyContext);
    if (typeof draft.location === 'string') setValue('location', draft.location);
    if (typeof draft.professionalMoment === 'string') {
      setValue('professionalMoment', draft.professionalMoment);
      // Reconstruye el select: si el texto coincide con una opción
      // cerrada, se selecciona esa opción; si no, es "Otro" con texto
      // libre.
      const closed = (PROFESSIONAL_OPTIONS as readonly string[]).includes(
        draft.professionalMoment,
      );
      setProfessionalChoice(
        draft.professionalMoment === ''
          ? ''
          : closed
            ? draft.professionalMoment
            : OTHER,
      );
    }
    if (typeof draft.trigger === 'string') setValue('trigger', draft.trigger);
  }, [token, setValue]);

  // Persiste el borrador con debounce cada vez que cambian los valores.
  // Usamos `watch()` como fuente. No guardamos la elección del select
  // aparte: si el usuario eligió "Otro" y escribió texto, professional
  // Moment ya contiene ese texto — al rehidratar lo reconocemos como
  // "Otro" porque no está en la lista cerrada.
  useEffect(() => {
    const subscription = watch((values) => {
      // Debounce ligero con requestIdleCallback o setTimeout.
      // El cuerpo es barato (stringify), así que un timeout de 200ms
      // sobra. Persistimos TODO el objeto incluso con un único cambio.
      const id = setTimeout(() => {
        writeDraft(token, {
          name: values.name ?? '',
          age: typeof values.age === 'number' ? values.age : '',
          familyContext: values.familyContext ?? '',
          location: values.location ?? '',
          professionalMoment: values.professionalMoment ?? '',
          trigger: values.trigger ?? '',
        });
      }, 200);
      return () => clearTimeout(id);
    });
    return () => subscription.unsubscribe();
  }, [token, watch]);

  const isOther = professionalChoice === OTHER;

  const onChoiceChange = (value: string) => {
    setProfessionalChoice(value);
    // Si es una opción cerrada, el valor final coincide con la opción.
    // Si es "Otro", limpiamos para que el usuario rellene el texto libre.
    setValue('professionalMoment', value === OTHER ? '' : value, {
      shouldValidate: false,
    });
  };

  const onSubmit = async (data: FormPayload) => {
    setSubmitError(null);

    let res: Response;
    try {
      res = await fetch(`/api/session/${token}/form`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
    } catch {
      setSubmitError({
        kind: 'generic',
        message: 'No se pudo enviar el formulario. Inténtalo de nuevo.',
      });
      return;
    }

    if (res.ok) {
      clearDraft(token);
      router.refresh();
      return;
    }

    // Los errores del backend siguen el contrato de src/lib/api/response.ts.
    const body = (await res.json().catch(() => null)) as
      | { error?: { code?: string; details?: { fieldErrors?: Record<string, string[]> } } }
      | null;
    const code = body?.error?.code;

    if (res.status === 400 && code === 'INVALID_INPUT') {
      const fieldErrors = body?.error?.details?.fieldErrors ?? {};
      let mapped = false;
      for (const [field, messages] of Object.entries(fieldErrors)) {
        if (messages?.[0] && field in data) {
          setError(field as keyof FormPayload, {
            type: 'server',
            message: messages[0],
          });
          mapped = true;
        }
      }
      if (!mapped) {
        setSubmitError({
          kind: 'generic',
          message: 'Algunos datos no son válidos. Revisa el formulario.',
        });
      }
      return;
    }

    if (res.status === 409) {
      // La sesión ya no admite el formulario (otra pestaña envió antes).
      // Refrescamos para que el server component pinte la siguiente pantalla.
      router.refresh();
      return;
    }

    if (res.status === 404) {
      setSubmitError({ kind: 'not_found' });
      return;
    }

    setSubmitError({
      kind: 'generic',
      message: 'No se pudo enviar el formulario. Inténtalo de nuevo.',
    });
  };

  if (submitError?.kind === 'not_found') {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-10 text-base md:text-[17px]">
        <h1 className="text-2xl font-semibold tracking-tight">
          Esta sesión ya no existe
        </h1>
        <p className="mt-4 text-neutral-600">
          El enlace ha dejado de ser válido. Si acabas de pagar, refresca la
          página; si no, inicia una nueva sesión.
        </p>
      </main>
    );
  }

  const fieldClass =
    'mt-1 block w-full rounded border border-neutral-300 bg-white px-3 py-2 text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-0 aria-[invalid=true]:border-red-600';

  return (
    <main className="mx-auto max-w-md px-6 py-10 text-base md:text-[17px]">
      <header className="mb-8">
        <p className="text-sm uppercase tracking-wide text-neutral-500">
          Coach AI
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Antes de empezar
        </h1>
        <p className="mt-3 text-neutral-600">
          Unos datos básicos para que el coach pueda acompañarte. Tardarás
          dos o tres minutos.
        </p>
      </header>

      <ResumeLinkNotice url={resumeLink.url} expiresAt={resumeLink.expiresAt} />

      <form
        noValidate
        onSubmit={handleSubmit(onSubmit)}
        className="space-y-6"
      >
        <Field
          id="name"
          label="Nombre"
          error={errors.name?.message}
        >
          <input
            id="name"
            type="text"
            autoComplete="given-name"
            className={fieldClass}
            aria-invalid={!!errors.name}
            aria-describedby={errors.name ? 'name-error' : undefined}
            {...register('name')}
          />
        </Field>

        <Field id="age" label="Edad" error={errors.age?.message}>
          <input
            id="age"
            type="number"
            inputMode="numeric"
            min={14}
            max={120}
            className={fieldClass}
            aria-invalid={!!errors.age}
            aria-describedby={errors.age ? 'age-error' : undefined}
            {...register('age', { valueAsNumber: true })}
          />
        </Field>

        <Field
          id="familyContext"
          label="Estado civil y situación familiar"
          hint='Una línea corta. Por ejemplo: "casado, dos hijos de 10 y 13".'
          error={errors.familyContext?.message}
        >
          <input
            id="familyContext"
            type="text"
            className={fieldClass}
            aria-invalid={!!errors.familyContext}
            aria-describedby={
              errors.familyContext
                ? 'familyContext-error familyContext-hint'
                : 'familyContext-hint'
            }
            {...register('familyContext')}
          />
        </Field>

        <Field
          id="location"
          label="Zona geográfica"
          hint="Ciudad o área."
          error={errors.location?.message}
        >
          <input
            id="location"
            type="text"
            autoComplete="address-level2"
            className={fieldClass}
            aria-invalid={!!errors.location}
            aria-describedby={
              errors.location ? 'location-error location-hint' : 'location-hint'
            }
            {...register('location')}
          />
        </Field>

        <Field
          id="professionalChoice"
          label="Momento profesional actual"
          error={errors.professionalMoment?.message}
        >
          <select
            id="professionalChoice"
            className={fieldClass}
            value={professionalChoice}
            onChange={(e) => onChoiceChange(e.target.value)}
            aria-invalid={!!errors.professionalMoment}
            aria-describedby={
              errors.professionalMoment ? 'professionalChoice-error' : undefined
            }
          >
            <option value="" disabled>
              Selecciona una opción
            </option>
            {PROFESSIONAL_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
          {isOther && (
            <input
              id="professionalMomentOther"
              type="text"
              placeholder="Describe tu momento profesional"
              className={`${fieldClass} mt-2`}
              aria-label="Describe tu momento profesional"
              aria-invalid={!!errors.professionalMoment}
              aria-describedby={
                errors.professionalMoment ? 'professionalChoice-error' : undefined
              }
              {...register('professionalMoment')}
            />
          )}
        </Field>

        <Field
          id="trigger"
          label="¿Qué decisión o dilema quieres trabajar hoy?"
          hint="Cuéntalo en dos o tres frases, ábrete y cuéntamela, es la mejor manera de ayudarte."
          error={errors.trigger?.message}
        >
          <textarea
            id="trigger"
            rows={5}
            className={fieldClass}
            aria-invalid={!!errors.trigger}
            aria-describedby={
              errors.trigger ? 'trigger-error trigger-hint' : 'trigger-hint'
            }
            {...register('trigger')}
          />
        </Field>

        {submitError?.kind === 'generic' && (
          <p
            role="alert"
            className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800"
          >
            {submitError.message}
          </p>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded bg-neutral-900 px-4 py-3 text-white transition hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? 'Enviando…' : 'Comenzar sesión'}
        </button>
      </form>
    </main>
  );
}

function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="block font-medium text-neutral-900">
        {label}
      </label>
      {hint && (
        <p id={`${id}-hint`} className="mt-1 text-sm text-neutral-600">
          {hint}
        </p>
      )}
      {children}
      {error && (
        <p id={`${id}-error`} className="mt-1 text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
