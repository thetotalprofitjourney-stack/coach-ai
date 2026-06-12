'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { formPayloadSchema, type FormPayload } from '@/lib/api/schemas';
import type { ResumeLinkData } from '@/lib/session/resume-link';
const DRAFT_KEY_PREFIX = 'coach-ai:draft:';
function draftKey(token: string) {
  return `${DRAFT_KEY_PREFIX}${token}:initial-form`;
}

type DraftShape = Partial<{
  alias: string;
  age: number | '';
  familyContext: string;
  retoDominio: string;
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

const PROFESSIONAL_OPTIONS = [
  'Por cuenta ajena',
  'Autónomo',
  'Emprendedor',
  'Desempleado',
  'Próximo a jubilarme',
  'Otro',
] as const;

const FAMILY_OPTIONS = [
  'Soltero/a',
  'En pareja',
  'Casado/a o unión estable',
  'Familia con hijos',
  'Otra situación',
] as const;

const RETO_OPTIONS = [
  { value: 'personal', label: 'Personal' },
  { value: 'profesional', label: 'Profesional' },
  { value: 'general', label: 'Ambos' },
] as const;

const OTHER = 'Otro';
const OTHER_FAMILY = 'Otra situación';

type SubmitError =
  | { kind: 'not_found' }
  | { kind: 'generic'; message: string }
  | null;

export function InitialForm({
  token,
}: {
  token: string;
  resumeLink?: ResumeLinkData;
}) {
  const router = useRouter();
  const [professionalChoice, setProfessionalChoice] = useState<string>('');
  const [familyChoice, setFamilyChoice] = useState<string>('');
  const [submitError, setSubmitError] = useState<SubmitError>(null);

  const {
    register,
    handleSubmit,
    setValue,
    setError,
    setFocus,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormPayload>({
    resolver: zodResolver(formPayloadSchema),
    mode: 'onSubmit',
    defaultValues: {
      alias: '',
      familyContext: '',
      retoDominio: undefined,
      professionalMoment: '',
      trigger: '',
    },
  });

  useEffect(() => {
    setFocus('alias');
  }, [setFocus]);

  const hydratedRef = useRef(false);
  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    const draft = readDraft(token);
    if (!draft) return;
    if (typeof draft.alias === 'string') setValue('alias', draft.alias);
    if (typeof draft.age === 'number') setValue('age', draft.age);
    if (typeof draft.familyContext === 'string') {
      setValue('familyContext', draft.familyContext);
      const knownFamily = (FAMILY_OPTIONS as readonly string[]).includes(draft.familyContext);
      setFamilyChoice(
        draft.familyContext === '' ? '' : knownFamily ? draft.familyContext : OTHER_FAMILY,
      );
    }
    if (
      draft.retoDominio === 'personal' ||
      draft.retoDominio === 'profesional' ||
      draft.retoDominio === 'general'
    ) {
      setValue('retoDominio', draft.retoDominio);
    }
    if (typeof draft.professionalMoment === 'string') {
      setValue('professionalMoment', draft.professionalMoment);
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

  useEffect(() => {
    const subscription = watch((values) => {
      const id = setTimeout(() => {
        writeDraft(token, {
          alias: values.alias ?? '',
          age: typeof values.age === 'number' ? values.age : '',
          familyContext: values.familyContext ?? '',
          retoDominio: values.retoDominio ?? '',
          professionalMoment: values.professionalMoment ?? '',
          trigger: values.trigger ?? '',
        });
      }, 200);
      return () => clearTimeout(id);
    });
    return () => subscription.unsubscribe();
  }, [token, watch]);

  const isOtherProfessional = professionalChoice === OTHER;
  const isOtherFamily = familyChoice === OTHER_FAMILY;

  const onProfessionalChoice = (value: string) => {
    setProfessionalChoice(value);
    setValue('professionalMoment', value === OTHER ? '' : value, {
      shouldValidate: false,
    });
  };

  const onFamilyChoice = (value: string) => {
    setFamilyChoice(value);
    setValue('familyContext', value === OTHER_FAMILY ? '' : value, {
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
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-10">
        <h1 className="text-xl font-semibold tracking-tight text-neutral-900">
          Esta sesión ya no existe
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-neutral-600">
          El enlace ha dejado de ser válido. Si acabas de pagar, refresca la
          página; si no, inicia una nueva sesión.
        </p>
      </main>
    );
  }

  const fieldInput =
    'mt-1.5 block w-full rounded-lg border border-neutral-200 bg-white px-3 py-2.5 text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-stone-900 focus:ring-offset-0 aria-[invalid=true]:border-red-400 aria-[invalid=true]:ring-red-400 transition-shadow';

  const retoDominio = watch('retoDominio');

  return (
    <main className="mx-auto max-w-lg px-5 py-5">

      {/* Cabecera */}
      <header className="mb-4">
        <p className="text-xs font-medium uppercase tracking-[0.15em] text-neutral-400">
          Coach AI
        </p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight text-neutral-900">
          Cuéntame tu situación
        </h1>
      </header>

      <form noValidate onSubmit={handleSubmit(onSubmit)} className="space-y-4">

        {/* Fila 1: Alias + Edad */}
        <div className="grid grid-cols-[1fr_5rem] gap-4">
          <div>
            <label htmlFor="alias" className={labelClass}>
              ¿Cómo quieres que te llame?
            </label>
            <input
              id="alias"
              type="text"
              placeholder="Nombre o alias"
              autoComplete="off"
              className={fieldInput}
              aria-invalid={!!errors.alias}
              aria-describedby={errors.alias ? 'alias-error' : undefined}
              {...register('alias')}
            />
            {errors.alias && (
              <p id="alias-error" className={errorClass}>
                {errors.alias.message}
              </p>
            )}
          </div>
          <div>
            <label htmlFor="age" className={labelClass}>
              Edad
            </label>
            <input
              id="age"
              type="number"
              inputMode="numeric"
              min={14}
              max={120}
              className={fieldInput}
              aria-invalid={!!errors.age}
              aria-describedby={errors.age ? 'age-error' : undefined}
              {...register('age', { valueAsNumber: true })}
            />
            {errors.age && (
              <p id="age-error" className={errorClass}>
                {errors.age.message}
              </p>
            )}
          </div>
        </div>

        {/* Ámbito del reto */}
        <div>
          <p className={labelClass} id="reto-label">
            Ámbito del reto
          </p>
          <input type="hidden" {...register('retoDominio')} />
          <div className="mt-2 flex gap-2" role="group" aria-labelledby="reto-label">
            {RETO_OPTIONS.map((opt) => {
              const selected = retoDominio === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setValue('retoDominio', opt.value, { shouldValidate: false })}
                  aria-pressed={selected}
                  className={
                    selected
                      ? 'rounded-full bg-stone-900 px-4 py-1.5 text-sm font-medium text-white transition'
                      : 'rounded-full border border-neutral-200 bg-white px-4 py-1.5 text-sm text-neutral-700 transition hover:border-stone-400 hover:bg-stone-50'
                  }
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
          {errors.retoDominio && (
            <p id="reto-error" className={errorClass}>
              {errors.retoDominio.message}
            </p>
          )}
        </div>

        {/* Situación familiar — chips */}
        <div>
          <p className={labelClass} id="family-label">
            Situación familiar
          </p>
          <input type="hidden" {...register('familyContext')} />
          <div
            className="mt-2 flex flex-wrap gap-2"
            role="group"
            aria-labelledby="family-label"
          >
            {FAMILY_OPTIONS.map((opt) => {
              const selected = familyChoice === opt;
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => onFamilyChoice(opt)}
                  aria-pressed={selected}
                  className={
                    selected
                      ? 'rounded-full bg-stone-900 px-4 py-1.5 text-sm font-medium text-white transition'
                      : 'rounded-full border border-neutral-200 bg-white px-4 py-1.5 text-sm text-neutral-700 transition hover:border-stone-400 hover:bg-stone-50'
                  }
                >
                  {opt}
                </button>
              );
            })}
          </div>
          {isOtherFamily && (
            <input
              id="familyContextOther"
              type="text"
              placeholder="Describe brevemente tu situación familiar"
              className={`${fieldInput} mt-3`}
              aria-label="Describe brevemente tu situación familiar"
              aria-invalid={!!errors.familyContext}
              aria-describedby={errors.familyContext ? 'familyContext-error' : undefined}
              {...register('familyContext')}
            />
          )}
          {errors.familyContext && (
            <p id="familyContext-error" className={errorClass}>
              {errors.familyContext.message}
            </p>
          )}
        </div>

        {/* Momento profesional — chips */}
        <div>
          <p className={labelClass} id="prof-label">
            Momento profesional
          </p>
          <input type="hidden" {...register('professionalMoment')} />
          <div
            className="mt-2 flex flex-wrap gap-2"
            role="group"
            aria-labelledby="prof-label"
          >
            {PROFESSIONAL_OPTIONS.map((opt) => {
              const selected = professionalChoice === opt;
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => onProfessionalChoice(opt)}
                  aria-pressed={selected}
                  className={
                    selected
                      ? 'rounded-full bg-stone-900 px-4 py-1.5 text-sm font-medium text-white transition'
                      : 'rounded-full border border-neutral-200 bg-white px-4 py-1.5 text-sm text-neutral-700 transition hover:border-stone-400 hover:bg-stone-50'
                  }
                >
                  {opt}
                </button>
              );
            })}
          </div>
          {isOtherProfessional && (
            <input
              id="professionalMomentOther"
              type="text"
              placeholder="Describe tu situación profesional"
              className={`${fieldInput} mt-3`}
              aria-label="Describe tu situación profesional"
              aria-invalid={!!errors.professionalMoment}
              aria-describedby={
                errors.professionalMoment ? 'prof-error' : undefined
              }
              {...register('professionalMoment')}
            />
          )}
          {errors.professionalMoment && (
            <p id="prof-error" className={errorClass}>
              {errors.professionalMoment.message}
            </p>
          )}
        </div>

        {/* Decisión o dilema */}
        <div>
          <label htmlFor="trigger" className={labelClass}>
            ¿Qué decisión o dilema quieres trabajar hoy?
            <span className="ml-1.5 font-normal text-neutral-400 text-xs">Dos o tres frases, cuanto más concreto mejor.</span>
          </label>
          <textarea
            id="trigger"
            rows={2}
            className={`${fieldInput} resize-none overflow-hidden`}
            style={{ minHeight: '4.5rem' }}
            aria-invalid={!!errors.trigger}
            aria-describedby={errors.trigger ? 'trigger-error' : undefined}
            onInput={(e) => {
              const el = e.currentTarget;
              el.style.height = 'auto';
              el.style.height = `${el.scrollHeight}px`;
            }}
            {...register('trigger')}
          />
          {errors.trigger && (
            <p id="trigger-error" className={errorClass}>
              {errors.trigger.message}
            </p>
          )}
        </div>

        {submitError?.kind === 'generic' && (
          <p
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800"
          >
            {submitError.message}
          </p>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-lg bg-stone-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-stone-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-900 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? 'Enviando…' : 'Comenzar sesión'}
        </button>
      </form>
    </main>
  );
}

const labelClass = 'block text-sm font-medium text-neutral-800';
const errorClass = 'mt-1 text-xs text-red-600';
