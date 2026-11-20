import { loginSchema, PASSWORD_MAX_LENGTH } from '@nexastack/shared';
import mongoose from 'mongoose';

import { AdminUser } from '../models/AdminUser.js';
import { hashPassword } from './password.js';

// The built-in unique _id index arbitrates concurrent first-account inserts, including
// operators using different emails. Later accounts keep ordinary generated ObjectIds.
const FIRST_ADMIN_ID = new mongoose.Types.ObjectId('6e657861737461636b000001');

export function seedCredentials(email: string | undefined, password: string | undefined) {
  const parsed = loginSchema.safeParse({ email, password });
  if (!parsed.success || Buffer.byteLength(parsed.data.password, 'utf8') > PASSWORD_MAX_LENGTH) {
    throw new Error('Invalid bootstrap credentials');
  }
  return { email: parsed.data.email.toLowerCase(), password: parsed.data.password };
}

export function adminTarget(client: mongoose.mongo.MongoClient) {
  const host = client.options.srvHost ?? client.options.hosts.map(String).join(',');
  return `${host}/${client.db().databaseName}`;
}

/** Called only after the operator's target matches. Recheck on the primary before hashing. */
export async function createFirstAdmin(credentials: ReturnType<typeof seedCredentials>) {
  if (await AdminUser.exists({}).read('primary')) return false;
  const passwordHash = await hashPassword(credentials.password);
  try {
    await AdminUser.create({
      _id: FIRST_ADMIN_ID,
      email: credentials.email,
      passwordHash,
      role: 'super_admin',
      status: 'active',
      mustChangePassword: false,
    });
    return true;
  } catch (error) {
    if (
      error instanceof mongoose.mongo.MongoServerError &&
      error.code === 11000 &&
      (await AdminUser.exists({ _id: FIRST_ADMIN_ID }).read('primary'))
    )
      return false;
    throw error;
  }
}
