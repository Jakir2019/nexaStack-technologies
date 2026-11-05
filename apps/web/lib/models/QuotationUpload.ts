import mongoose, { type Model } from 'mongoose';
import type { QuotationInput } from '@nexastack/shared';
import { connectToDatabase } from '../mongodb';

export interface UploadAsset {
  id: string;
  cloudName: string;
  publicId: string;
  resourceType: 'image';
  deliveryType: 'authenticated';
  size: number;
  mime: string;
  url?: string;
  status: 'uploading' | 'uploaded' | 'cleanup_pending' | 'deleted' | 'committed';
  expiresAt: Date;
}
export interface UploadSession {
  _id: mongoose.Types.ObjectId;
  tokenHash: string;
  purpose: 'quotation-upload';
  status: 'active' | 'finalizing' | 'submitted' | 'cleaning' | 'revoked';
  expiresAt: Date;
  retainUntil: Date;
  createdAt: Date;
  leaseUntil: Date;
  leaseOwner?: string;
  attempts: number;
  usedBytes: number;
  assets: UploadAsset[];
  payload?: QuotationInput;
  payloadHash?: string;
  quotationId?: mongoose.Types.ObjectId;
  referenceNumber?: string;
  cleanupFailures: number;
  purgeAt?: Date;
}
const asset = new mongoose.Schema<UploadAsset>(
  {
    cloudName: { type: String, required: true },
    id: { type: String, required: true },
    publicId: { type: String, required: true },
    resourceType: { type: String, enum: ['image'], required: true },
    deliveryType: { type: String, enum: ['authenticated'], required: true },
    size: { type: Number, min: 1, required: true },
    mime: { type: String, required: true },
    url: String,
    status: {
      type: String,
      enum: ['uploading', 'uploaded', 'cleanup_pending', 'deleted', 'committed'],
      required: true,
    },
    expiresAt: { type: Date, required: true },
  },
  { _id: false },
);
const schema = new mongoose.Schema<UploadSession>({
  tokenHash: { type: String, required: true, select: false },
  purpose: { type: String, enum: ['quotation-upload'], required: true },
  status: {
    type: String,
    enum: ['active', 'finalizing', 'submitted', 'cleaning', 'revoked'],
    required: true,
  },
  expiresAt: { type: Date, required: true },
  retainUntil: { type: Date, required: true },
  createdAt: { type: Date, required: true },
  leaseUntil: { type: Date, required: true },
  leaseOwner: String,
  attempts: { type: Number, min: 0, required: true },
  usedBytes: { type: Number, min: 0, required: true },
  assets: { type: [asset], default: [] },
  payload: { type: mongoose.Schema.Types.Mixed, select: false },
  payloadHash: String,
  quotationId: mongoose.Schema.Types.ObjectId,
  referenceNumber: String,
  cleanupFailures: { type: Number, default: 0 },
  purgeAt: Date,
});
schema.index({ tokenHash: 1 }, { unique: true });
schema.index({ status: 1, retainUntil: 1, leaseUntil: 1 });
// Empty sessions and fully reconciled records receive purgeAt. Reservation removes the
// empty-session TTL before remote I/O. Never TTL an unconfirmed asset deletion.
schema.index({ purgeAt: 1 }, { expireAfterSeconds: 0 });
export const QuotationUpload =
  (mongoose.models.QuotationUpload as Model<UploadSession> | undefined) ??
  mongoose.model<UploadSession>('QuotationUpload', schema);

const limitSchema = new mongoose.Schema({
  _id: String,
  count: { type: Number, required: true },
  expiresAt: { type: Date, required: true },
});
limitSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const UploadLimit =
  mongoose.models.UploadLimit ?? mongoose.model('UploadLimit', limitSchema);

export async function ensureUploadDatabase(): Promise<void> {
  await connectToDatabase();
  await Promise.all([QuotationUpload.init(), UploadLimit.init()]);
}
export const uploadSessions = () =>
  mongoose.connection.db!.collection<UploadSession>('quotationuploads');
export const uploadLimits = () =>
  mongoose.connection.db!.collection<{ _id: string; count: number; expiresAt: Date }>(
    'uploadlimits',
  );
