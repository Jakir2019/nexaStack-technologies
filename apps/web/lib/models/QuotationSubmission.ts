import { QUOTATION_STATUS, QUOTATION_STATUSES } from '@nexastack/shared';
import mongoose, { type InferSchemaType } from 'mongoose';

// Default import, then destructure: named value imports from 'mongoose' resolve under Next's bundler but not under
// Node's own ESM loader (mongoose is CommonJS), which the integration tests use. Same objects, same behaviour.
const { Schema, model, models } = mongoose;

/**
 * Internal admin commentary on a request (Quotation Management). Never shown to the client. The
 * public form only ever creates a request, so the admin fields below are set by their defaults.
 */
const noteSchema = new Schema({
  authorAdminId: { type: Schema.Types.ObjectId, ref: 'AdminUser', required: true },
  text: { type: String, required: true, trim: true, maxlength: 2000 },
  createdAt: { type: Date, required: true, default: Date.now },
});

/**
 * A validated `/quotation` page submission. Fields mirror `quotationSchema` from
 * `@nexastack/shared` exactly — Zod is the security boundary (validated before this document
 * is constructed); these constraints are the second layer required by root CLAUDE.md 11.5.
 * Keep in step with `apps/api/src/models/QuotationSubmission.ts`.
 */
const quotationSubmissionSchema = new Schema(
  {
    // Traceable to the confirmation number shown to the submitter — derived from this same
    // document's real _id at insert time (see apps/web/app/api/quotation/route.ts).
    referenceNumber: { type: String, required: true, unique: true },

    // Step 1 — Client information
    fullName: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, trim: true, maxlength: 254 },
    telephone: { type: String, required: true, trim: true, maxlength: 30 },
    companyName: { type: String, trim: true, maxlength: 160 },
    country: { type: String, required: true, trim: true },

    // Step 2 — Project information
    projectType: { type: String, required: true },
    requiredServices: { type: [String], required: true },
    businessObjectives: { type: String, required: true, trim: true, maxlength: 2000 },
    targetUsers: { type: String, required: true, trim: true, maxlength: 500 },
    projectStatus: { type: String, required: true, enum: ['new', 'existing'] },

    // Step 3 — Project requirements
    requiredFeatures: { type: String, required: true, trim: true, maxlength: 2000 },
    numberOfPages: { type: String, required: true },
    designRequirements: { type: String, required: true },
    needsAdminDashboard: { type: Boolean, required: true },
    needsAuthentication: { type: Boolean, required: true },
    integrations: { type: String, trim: true, maxlength: 1000 },
    referenceWebsites: { type: [String], default: undefined },

    // Step 4 — Budget and timeline
    budgetRange: { type: String, required: true },
    preferredStartDate: { type: String, required: true },
    targetCompletionDate: { type: String },
    maintenanceRequired: { type: String, required: true, enum: ['yes', 'no', 'not-sure'] },

    // Step 5 — Final submission
    attachments: { type: [String], default: undefined },
    additionalMessage: { type: String, trim: true, maxlength: 2000 },
    consent: { type: Boolean, required: true },

    // Sales-pipeline workflow (Quotation Management). A new submission is always `new`; every later
    // change is made through apps/api's admin routes. Legacy rows may still hold `responded` until
    // `apps/api/scripts/migrate-quotation-status.ts` has run.
    status: {
      type: String,
      required: true,
      enum: QUOTATION_STATUSES,
      default: QUOTATION_STATUS.NEW,
    },
    archived: { type: Boolean, required: true, default: false },
    archivedAt: { type: Date, default: null },
    notes: { type: [noteSchema], default: [] },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

quotationSubmissionSchema.index({ createdAt: -1 });
quotationSubmissionSchema.index({ attachments: 1 });
quotationSubmissionSchema.index({ archived: 1, status: 1, createdAt: -1 });

export type QuotationSubmissionDocument = InferSchemaType<typeof quotationSubmissionSchema>;

// `models.QuotationSubmission` is reused across hot reloads in development so Mongoose doesn't
// throw "Cannot overwrite model once compiled".
export const QuotationSubmission =
  models.QuotationSubmission ?? model('QuotationSubmission', quotationSubmissionSchema);
