import mongoose from 'mongoose';

import { env } from '../config/env.js';
import { adminTarget, createFirstAdmin, seedCredentials } from '../lib/adminBootstrap.js';
import { AdminUser } from '../models/AdminUser.js';

function failureReason(error: unknown): string {
  if (error instanceof mongoose.mongo.MongoServerError) {
    if (error.code === 13) return 'database user lacks permission';
    if (error.code === 18 || error.codeName === 'AuthenticationFailed')
      return 'authentication failed';
  }
  if (error instanceof Error) {
    // Driver errors may contain configuration or credentials. Classify privately and print
    // only these fixed messages, including when Atlas wraps auth failures in code 8000.
    const message = error.message;
    if (/authentication failed|bad auth/i.test(message)) return 'authentication failed';
    if (/querySrv|queryTxt|getaddrinfo/i.test(message)) return 'DNS lookup failed';
    if (/certificate|TLS|SSL/i.test(message))
      return 'TLS handshake or certificate verification failed';
    if (/server selection|timed out|ECONNREFUSED|ETIMEDOUT/i.test(message)) {
      return 'server unavailable or timed out (check connectivity and Atlas network access)';
    }
  }
  return 'operation failed';
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const check = args.length === 1 && args[0] === '--check';
  if (!check && !(args.length === 2 && args[0] === '--target')) {
    console.error('Run check-admin first. After approval, use seed-admin --target HOST/DATABASE.');
    process.exitCode = 1;
    return;
  }

  let stage = 'Parse MongoDB configuration';
  let client: mongoose.mongo.MongoClient | undefined;
  try {
    client = new mongoose.mongo.MongoClient(env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 5000,
      readPreference: 'primary',
    });
    const target = adminTarget(client);
    console.log(`Configured target: ${target}`);
    if (!check && args[1] !== target) {
      console.error(
        'The requested target differs from the configured target. Run check-admin again.',
      );
      process.exitCode = 1;
      return;
    }
    stage =
      'Validate ADMIN_SEED_EMAIL and ADMIN_SEED_PASSWORD (login rules and 72 UTF-8 bytes maximum)';
    const credentials = check
      ? undefined
      : seedCredentials(process.env.ADMIN_SEED_EMAIL, process.env.ADMIN_SEED_PASSWORD);

    stage = 'Connect to MongoDB';
    await client.connect();
    const db = client.db();
    // Also compare after SRV/TXT resolution, before any Mongoose model is attached.
    if (adminTarget(client) !== target) throw new Error('Target changed');
    stage = 'Ping selected database';
    await db.command({ ping: 1 }, { timeoutMS: 5000 });
    console.log(`Connected and pinged: ${adminTarget(client)}`);

    stage = 'Count administrator records';
    const collection = AdminUser.collection.name;
    const count = await db.collection(collection).countDocuments({}, { timeoutMS: 10000 });
    console.log(`${collection}: ${count} administrator record(s).`);
    if (count > 0) {
      console.log('First-account creation skipped because an administrator exists.');
      return;
    }
    if (!credentials) return;

    // Attach the connected client only on the approved write path. Model initialization can
    // create collections and indexes, so the read-only path uses the native driver above.
    stage = 'Initialize administrator model';
    mongoose.connection.setClient(client);
    await AdminUser.init();
    stage = 'Create first administrator';
    console.log(
      (await createFirstAdmin(credentials))
        ? 'Created the active super_admin account.'
        : 'An administrator already exists. Creation skipped.',
    );
  } catch (error) {
    console.error(`${stage}: ${failureReason(error)}. Run check-admin before any seed attempt.`);
    process.exitCode = 1;
  } finally {
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
    else await client?.close();
  }
}

main().catch(() => {
  console.error(
    'Admin command failed during cleanup. Verify the administrator count before retrying.',
  );
  process.exitCode = 1;
});
