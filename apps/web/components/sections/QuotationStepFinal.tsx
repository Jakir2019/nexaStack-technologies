import {
  BUDGET_RANGE_OPTIONS,
  DESIGN_REQUIREMENTS_OPTIONS,
  MAINTENANCE_OPTIONS,
  NUMBER_OF_PAGES_OPTIONS,
  PROJECT_TYPE_OPTIONS,
  REQUIRED_SERVICE_OPTIONS,
} from '@nexastack/shared';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Controller, useWatch } from 'react-hook-form';

import type { QuotationStepProps } from '@/components/sections/QuotationStepClient';
import { STEP_NAMES } from '@/components/sections/QuotationWizard';
import { Checkbox } from '@/components/ui/Checkbox';
import { FieldError } from '@/components/ui/FieldError';
import { QuotationAttachments } from '@/components/sections/QuotationAttachments';
import { Textarea } from '@/components/ui/Textarea';

const REQUIRED_MARK = (
  <span aria-hidden="true" className="text-error">
    {' '}
    *
  </span>
);
const LABEL_CLASSES = 'block text-label font-medium text-primary';

function labelFor(options: readonly { value: string; label: string }[], value: string | undefined): string {
  return options.find((option) => option.value === value)?.label ?? '—';
}

function yesNoLabel(value: boolean | undefined): string {
  return value === true ? 'Yes' : value === false ? 'No' : '—';
}

export interface QuotationStepFinalProps extends QuotationStepProps {
  onEditStep: (step: number) => void;
  onUploadsPending?: (pending: boolean) => void;
}

/** Step 5 — File attachments, consent, and a full review of steps 1–4 before submitting. */
export function QuotationStepFinal({ form, onEditStep, onUploadsPending }: QuotationStepFinalProps) {
  const {
    register,
    control,
    formState: { errors },
  } = form;
  const values = useWatch({ control });

  return (
    <div className="space-y-8">
      <div>
        <label htmlFor="attachments" className={LABEL_CLASSES}>
          File attachments (optional)
        </label>
        <div className="mt-2">
          <Controller
            control={control}
            name="attachments"
            render={({ field }) => (
              <QuotationAttachments
                id="attachments"
                initialUrls={field.value}
                onFilesChange={field.onChange}
                describedById="attachments-error"
                onUploadsPending={onUploadsPending}
              />
            )}
          />
        </div>
        <FieldError id="attachments-error" message={errors.attachments?.message} />
      </div>

      <div>
        <label htmlFor="additionalMessage" className={LABEL_CLASSES}>
          Additional message (optional)
        </label>
        <Textarea
          id="additionalMessage"
          rows={4}
          placeholder="Anything else we should know?"
          invalid={Boolean(errors.additionalMessage)}
          aria-describedby="additionalMessage-error"
          className="mt-2"
          {...register('additionalMessage')}
        />
        <FieldError id="additionalMessage-error" message={errors.additionalMessage?.message} />
      </div>

      <div className="flex gap-3">
        <Checkbox
          id="consent"
          invalid={Boolean(errors.consent)}
          aria-required="true"
          aria-describedby="consent-error"
          {...register('consent')}
        />
        <label htmlFor="consent" className="text-body text-secondary">
          I agree to be contacted about this request and understand my information will be handled
          per the{' '}
          <Link
            href="/privacy-policy"
            className="text-primary-blue underline underline-offset-4 hover:text-primary-blue-hover"
          >
            privacy policy
          </Link>
          .{REQUIRED_MARK}
        </label>
      </div>
      <FieldError id="consent-error" message={errors.consent?.message} />

      <div className="rounded-card border border-default bg-surface p-6">
        <h3 className="text-body-lg font-semibold text-primary">Review your request</h3>

        <ReviewGroup title={STEP_NAMES[0]} onEdit={() => onEditStep(1)} first>
          <ReviewItem label="Full name" value={values.fullName} />
          <ReviewItem label="Email" value={values.email} />
          <ReviewItem label="Telephone" value={values.telephone} />
          <ReviewItem label="Company" value={values.companyName} />
          <ReviewItem label="Country" value={values.country} />
        </ReviewGroup>

        <ReviewGroup title={STEP_NAMES[1]} onEdit={() => onEditStep(2)}>
          <ReviewItem label="Project type" value={labelFor(PROJECT_TYPE_OPTIONS, values.projectType)} />
          <ReviewItem
            label="Required services"
            value={(values.requiredServices ?? []).map((v) => labelFor(REQUIRED_SERVICE_OPTIONS, v)).join(', ')}
          />
          <ReviewItem label="Business objectives" value={values.businessObjectives} />
          <ReviewItem label="Target users" value={values.targetUsers} />
          <ReviewItem
            label="Project status"
            value={values.projectStatus === 'existing' ? 'Existing project' : values.projectStatus === 'new' ? 'New project' : undefined}
          />
        </ReviewGroup>

        <ReviewGroup title={STEP_NAMES[2]} onEdit={() => onEditStep(3)}>
          <ReviewItem label="Required features" value={values.requiredFeatures} />
          <ReviewItem label="Number of pages" value={labelFor(NUMBER_OF_PAGES_OPTIONS, values.numberOfPages)} />
          <ReviewItem
            label="Design requirements"
            value={labelFor(DESIGN_REQUIREMENTS_OPTIONS, values.designRequirements)}
          />
          <ReviewItem label="Admin dashboard needed" value={yesNoLabel(values.needsAdminDashboard)} />
          <ReviewItem label="Authentication needed" value={yesNoLabel(values.needsAuthentication)} />
          <ReviewItem label="Integrations" value={values.integrations || 'None specified'} />
          <ReviewItem
            label="Reference websites"
            value={(values.referenceWebsites ?? []).filter(Boolean).join(', ') || 'None'}
          />
        </ReviewGroup>

        <ReviewGroup title={STEP_NAMES[3]} onEdit={() => onEditStep(4)}>
          <ReviewItem label="Budget range" value={labelFor(BUDGET_RANGE_OPTIONS, values.budgetRange)} />
          <ReviewItem label="Preferred start date" value={values.preferredStartDate} />
          <ReviewItem label="Target completion date" value={values.targetCompletionDate || 'Not specified'} />
          <ReviewItem label="Maintenance required" value={labelFor(MAINTENANCE_OPTIONS, values.maintenanceRequired)} />
        </ReviewGroup>
      </div>
    </div>
  );
}

function ReviewGroup({
  title,
  onEdit,
  children,
  first,
}: {
  title: string;
  onEdit: () => void;
  children: ReactNode;
  first?: boolean;
}) {
  return (
    <div className={first ? 'mt-4' : 'mt-6 border-t border-default pt-6'}>
      <div className="flex items-center justify-between gap-4">
        <h4 className="text-body font-semibold text-primary">{title}</h4>
        <button
          type="button"
          onClick={onEdit}
          className="rounded-field px-2 py-1 text-label text-primary-blue underline underline-offset-4 focus-ring hover:text-primary-blue-hover"
        >
          Edit
        </button>
      </div>
      <dl className="mt-3 space-y-2">{children}</dl>
    </div>
  );
}

function ReviewItem({ label, value }: { label: string; value: string | undefined }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
      <dt className="shrink-0 text-label text-secondary sm:w-40">{label}</dt>
      <dd className="text-body text-primary">{value || '—'}</dd>
    </div>
  );
}
