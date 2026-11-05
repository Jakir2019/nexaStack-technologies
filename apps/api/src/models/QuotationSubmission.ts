import { QUOTATION_STATUS, QUOTATION_STATUSES } from '@nexastack/shared';
import mongoose, { type InferSchemaType, type Model } from 'mongoose';

// See AdminUser.ts's comment: named imports from 'mongoose' don't reliably resolve under
// Node's raw ESM loader in this pure-Node project.
const { Schema, model, models } = mongoose;

/**
 * Read + admin-update mirror of `apps/web/lib/models/QuotationSubmission.ts` — that file
 * remains the canonical, write-owning schema for CREATING a submission (the public `/quotation`
 * form persists through apps/web's own Route Handler, not through this API). Both apps point at
 * the same MongoDB database and the same model name, so this resolves to the identical
 * `quotationsubmissions` collection. Keep the two schemas in step.
 *
 * Quotation workflow (Quotation Management task):
 * - `status` is the six-state sales pipeline (`QUOTATION_STATUSES`). Legacy rows may still hold the
 *   old value `responded` until `scripts/migrate-quotation-status.ts` has run; every read in
 *   `adminQuotations.service.ts` tolerates that.
 * - `archived` is an orthogonal flag, not a seventh status. Legacy rows may lack the field, so
 *   queries treat "missing" as not archived (`archived: { $ne: true }`).
 * - `notes` are internal, append-only admin commentary. Never shown to the client.
 */
const noteSchema = new Schema({
  authorAdminId: { type: Schema.Types.ObjectId, ref: 'AdminUser', required: true },
  text: { type: String, required: true, trim: true, maxlength: 2000 },
  createdAt: { type: Date, required: true, default: Date.now },
});

const quotationSubmissionSchema = new Schema(
  {
    referenceNumber: { type: String, required: true, unique: true },

    fullName: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, trim: true, maxlength: 254 },
    telephone: { type: String, required: true, trim: true, maxlength: 30 },
    companyName: { type: String, trim: true, maxlength: 160 },
    country: { type: String, required: true, trim: true },

    projectType: { type: String, required: true },
    requiredServices: { type: [String], required: true },
    businessObjectives: { type: String, required: true, trim: true, maxlength: 2000 },
    targetUsers: { type: String, required: true, trim: true, maxlength: 500 },
    projectStatus: { type: String, required: true, enum: ['new', 'existing'] },

    requiredFeatures: { type: String, required: true, trim: true, maxlength: 2000 },
    numberOfPages: { type: String, required: true },
    designRequirements: { type: String, required: true },
    needsAdminDashboard: { type: Boolean, required: true },
    needsAuthentication: { type: Boolean, required: true },
    integrations: { type: String, trim: true, maxlength: 1000 },
    referenceWebsites: { type: [String], default: undefined },

    budgetRange: { type: String, required: true },
    preferredStartDate: { type: String, required: true },
    targetCompletionDate: { type: String },
    maintenanceRequired: { type: String, required: true, enum: ['yes', 'no', 'not-sure'] },

    attachments: { type: [String], default: undefined },
    additionalMessage: { type: String, trim: true, maxlength: 2000 },
    consent: { type: Boolean, required: true },

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

// Same reasoning as ContactSubmission: the "active" list filters `archived $ne true` and sorts by
// `createdAt`, which the standalone `createdAt` index serves. Kept identical to the web mirror.
quotationSubmissionSchema.index({ createdAt: -1 });
quotationSubmissionSchema.index({ attachments: 1 });
quotationSubmissionSchema.index({ archived: 1, status: 1, createdAt: -1 });

export type QuotationSubmissionDocument = InferSchemaType<typeof quotationSubmissionSchema>;

// Explicit Model<T> on both sides of `??` — see AdminUser.ts's comment for why.
export const QuotationSubmission =
  (models.QuotationSubmission as Model<QuotationSubmissionDocument> | undefined) ??
  model<QuotationSubmissionDocument>('QuotationSubmission', quotationSubmissionSchema);
