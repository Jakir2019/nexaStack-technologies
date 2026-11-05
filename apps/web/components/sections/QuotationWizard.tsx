'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { quotationSchema, type ApiResponse, type QuotationInput } from '@nexastack/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useForm, useWatch, type Resolver } from 'react-hook-form';

import { QuotationConfirmation } from '@/components/sections/QuotationConfirmation';
import { QuotationProgress } from '@/components/sections/QuotationProgress';
import { QuotationStepBudget } from '@/components/sections/QuotationStepBudget';
import { QuotationStepClient } from '@/components/sections/QuotationStepClient';
import { QuotationStepFinal } from '@/components/sections/QuotationStepFinal';
import { QuotationStepProject } from '@/components/sections/QuotationStepProject';
import { QuotationStepRequirements } from '@/components/sections/QuotationStepRequirements';
import { Button } from '@/components/ui/Button';
import { TurnstileWidget } from '@/components/ui/Turnstile';

export interface QuotationFormFields {
  fullName: string;
  email: string;
  telephone: string;
  companyName: string;
  country: string;
  projectType: string;
  requiredServices: string[];
  businessObjectives: string;
  targetUsers: string;
  projectStatus: string;
  requiredFeatures: string;
  numberOfPages: string;
  designRequirements: string;
  needsAdminDashboard: boolean | undefined;
  needsAuthentication: boolean | undefined;
  integrations: string;
  referenceWebsites: string[];
  budgetRange: string;
  preferredStartDate: string;
  targetCompletionDate: string;
  maintenanceRequired: string;
  attachments: string[];
  additionalMessage: string;
  consent: boolean;
}

const DEFAULT_VALUES: QuotationFormFields = {
  fullName: '',
  email: '',
  telephone: '',
  companyName: '',
  country: '',
  projectType: '',
  requiredServices: [],
  businessObjectives: '',
  targetUsers: '',
  projectStatus: '',
  requiredFeatures: '',
  numberOfPages: '',
  designRequirements: '',
  needsAdminDashboard: undefined,
  needsAuthentication: undefined,
  integrations: '',
  referenceWebsites: [],
  budgetRange: '',
  preferredStartDate: '',
  targetCompletionDate: '',
  maintenanceRequired: '',
  attachments: [],
  additionalMessage: '',
  consent: false,
};

export const STEP_NAMES = [
  'Client information',
  'Project information',
  'Project requirements',
  'Budget and timeline',
  'Review and submit',
] as const;

const STEP_FIELDS: Record<number, (keyof QuotationFormFields)[]> = {
  1: ['fullName', 'email', 'telephone', 'companyName', 'country'],
  2: ['projectType', 'requiredServices', 'businessObjectives', 'targetUsers', 'projectStatus'],
  3: [
    'requiredFeatures',
    'numberOfPages',
    'designRequirements',
    'needsAdminDashboard',
    'needsAuthentication',
    'integrations',
    'referenceWebsites',
  ],
  4: ['budgetRange', 'preferredStartDate', 'targetCompletionDate', 'maintenanceRequired'],
  5: ['attachments', 'additionalMessage', 'consent'],
};

const STORAGE_KEY = 'nexastack-quotation-draft';
const TOTAL_STEPS = STEP_NAMES.length;

/**
 * The `/quotation` five-step wizard. Client Component: stateful, multi-step, needs a fetch
 * call. One `useForm` instance spans all five steps (root CLAUDE.md 10 — "keep step state
 * local; persist to the server only on final submit"); progression is gated per step with
 * `trigger(stepFields)` against a single resolver built from the full `quotationSchema` — the
 * standard React Hook Form + Zod multi-step pattern, and simpler than juggling five resolvers.
 */
export function QuotationWizard() {
  const [currentStep, setCurrentStep] = useState(1);
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success'>('idle');
  const [serverError, setServerError] = useState<string | null>(null);
  const [uploadsPending, setUploadsPending] = useState(false);
  const [referenceNumber, setReferenceNumber] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | undefined>(undefined);
  // A Turnstile token is single-use, so after any failed submit the widget is remounted (new key)
  // to issue a fresh one; re-sending the spent token would be refused until a page reload.
  const [turnstileKey, setTurnstileKey] = useState(0);
  const handleTurnstileVerify = useCallback((token: string) => setTurnstileToken(token), []);
  const handleTurnstileExpire = useCallback(() => setTurnstileToken(undefined), []);
  const resetTurnstile = useCallback(() => {
    setTurnstileToken(undefined);
    setTurnstileKey((key) => key + 1);
  }, []);
  const announcement = `Step ${currentStep} of ${TOTAL_STEPS}: ${STEP_NAMES[currentStep - 1]}`;
  const hasRestored = useRef(false);
  const submissionId = useRef<string | undefined>(undefined);

  const form = useForm<QuotationFormFields, unknown, QuotationInput>({
    resolver: zodResolver(quotationSchema) as unknown as Resolver<
      QuotationFormFields,
      unknown,
      QuotationInput
    >,
    defaultValues: DEFAULT_VALUES,
    // `onChange`, not `onBlur`: step progression is gated by manually calling `trigger()` on
    // Next (see handleNext below), not by `handleSubmit`. React Hook Form only auto-clears a
    // field's error on change once `reValidateMode` is active, which itself only turns on after
    // `handleSubmit` has run once — with a multi-step wizard, that's step 5. Under `onBlur`,
    // an error `trigger()` set on Step 2 would never clear as the user corrected the field, even
    // though the value became valid. `onChange` validates continuously instead, so corrections
    // are reflected immediately at every step.
    mode: 'onChange',
  });
  const { handleSubmit, trigger, control, reset, formState } = form;

  // Restore an in-progress draft once on mount. Throwaway convenience only — never the source
  // of truth submission is validated against, which is always the live form state re-validated
  // against `quotationSchema` at submit time.
  useEffect(() => {
    if (hasRestored.current) return;
    hasRestored.current = true;
    try {
      submissionId.current ??= window.sessionStorage.getItem(`${STORAGE_KEY}-submission`) ?? crypto.randomUUID();
      window.sessionStorage.setItem(`${STORAGE_KEY}-submission`, submissionId.current);
      const saved = window.sessionStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<QuotationFormFields>;
        reset({ ...DEFAULT_VALUES, ...parsed });
      }
    } catch {
      // Storage unavailable (private mode, disabled) or corrupt JSON — start with a blank form.
    }
  }, [reset]);

  const watchedValues = useWatch({ control });
  useEffect(() => {
    if (status === 'success') return;
    const timeout = setTimeout(() => {
      try {
        window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(watchedValues));
      } catch {
        // Quota exceeded or storage disabled — draft persistence is best-effort only.
      }
    }, 400);
    return () => clearTimeout(timeout);
  }, [watchedValues, status]);

  const goToStep = useCallback((step: number) => {
    setCurrentStep(Math.min(Math.max(step, 1), TOTAL_STEPS));
    // Steps vary a lot in length (Step 3 and the Step 5 review are long); without this, Back/
    // Next/Edit can leave the viewport scrolled past the new step's heading and fields.
    window.scrollTo(0, 0);
  }, []);

  const handleNext = useCallback(async () => {
    const fields = STEP_FIELDS[currentStep] ?? [];
    const valid = await trigger(fields);
    if (valid) goToStep(currentStep + 1);
  }, [currentStep, trigger, goToStep]);

  const handleBack = useCallback(() => goToStep(currentStep - 1), [currentStep, goToStep]);

  const onSubmit = handleSubmit(async (data) => {
    if (uploadsPending) { setServerError('Please wait for your attachments to finish uploading.'); return; }
    setServerError(null);
    setStatus('submitting');

    try {
      const response = await fetch('/api/quotation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Submission-Id': submissionId.current ??= crypto.randomUUID() },
        body: JSON.stringify({ ...data, turnstileToken }),
      });
      const body = (await response.json()) as ApiResponse<{ referenceNumber: string }>;

      if (!body.success) {
        setServerError(body.error.message);
        setStatus('idle');
        resetTurnstile();
        window.scrollTo(0, 0);
        return;
      }

      setReferenceNumber(body.data.referenceNumber);
      setStatus('success');
      window.scrollTo(0, 0);
      try {
        window.sessionStorage.removeItem(STORAGE_KEY);
        window.sessionStorage.removeItem(`${STORAGE_KEY}-submission`);
      } catch {
        // Nothing to clean up if storage was never available.
      }
    } catch {
      setServerError(
        'Something went wrong sending your request. Please check your connection and try again.',
      );
      setStatus('idle');
      resetTurnstile();
      window.scrollTo(0, 0);
    }
  });

  if (status === 'success' && referenceNumber) {
    return <QuotationConfirmation referenceNumber={referenceNumber} form={form} />;
  }

  return (
    <div className="mx-auto max-w-2xl">
      <QuotationProgress steps={STEP_NAMES} currentStep={currentStep} />
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

      <form onSubmit={onSubmit} noValidate className="space-y-8">
        <h2 id="quotation-step-heading" className="text-card font-semibold tracking-tight text-primary">
          {STEP_NAMES[currentStep - 1]}
        </h2>

        {serverError && (
          <p role="alert" className="rounded-field border border-error bg-surface px-4 py-3 text-body text-error">
            {serverError}
          </p>
        )}

        {/* `key={currentStep}` remounts this wrapper on every step change, replaying the
            `animate-hero-in` entrance (an existing token — fade + small upward move, 250ms
            ease-out) already used elsewhere for section entrances (root CLAUDE.md 7.6). The
            global reduced-motion rule in styles/globals.css zeroes its duration automatically,
            so reduced-motion users get an instant step change with no extra code here.
            Unmounting inactive steps (rather than hiding them) is safe: React Hook Form keeps a
            field's value after its input unmounts (`shouldUnregister` defaults to `false`). */}
        <div key={currentStep} className="animate-hero-in space-y-8">
          {currentStep === 1 && <QuotationStepClient form={form} />}
          {currentStep === 2 && <QuotationStepProject form={form} />}
          {currentStep === 3 && <QuotationStepRequirements form={form} />}
          {currentStep === 4 && <QuotationStepBudget form={form} />}
          {currentStep === 5 && <QuotationStepFinal form={form} onUploadsPending={setUploadsPending} onEditStep={(step) => { if (!uploadsPending) goToStep(step); }} />}
        </div>

        {/* Bot check on the final step only; renders nothing until a Turnstile site key is set. */}
        {currentStep === TOTAL_STEPS && (
          <TurnstileWidget
            key={turnstileKey}
            onVerify={handleTurnstileVerify}
            onExpire={handleTurnstileExpire}
          />
        )}

        <div className="flex items-center justify-between gap-4 border-t border-default pt-6">
          <Button
            type="button"
            variant="secondary"
            onClick={handleBack}
            disabled={currentStep === 1 || formState.isSubmitting || uploadsPending}
            className={currentStep === 1 ? 'invisible' : undefined}
          >
            Back
          </Button>

          {currentStep < TOTAL_STEPS ? (
            <Button type="button" onClick={handleNext}>
              Next
            </Button>
          ) : (
            <Button type="submit" disabled={formState.isSubmitting || uploadsPending}>
              {formState.isSubmitting ? 'Submitting…' : 'Submit request'}
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}
