# First administrator and live login

Run the PowerShell commands below from the repository root. Node 22.12+ and the workspace dependencies (including the built shared package) are required for the source commands.

## Check the local API

Copy `apps/api/.env.example` to `apps/api/.env.local` for a new installation. Keep an existing private file. Configure the full API environment, including `MONGODB_URI`, `JWT_SECRET`, `CORS_ORIGINS` and `WEB_APP_URL`. For first-account creation, temporarily supply `ADMIN_SEED_EMAIL` and `ADMIN_SEED_PASSWORD`. The diagnostic works without these two bootstrap variables.

The API dev, start, check-admin and seed-admin package scripts load the optional files `.env` followed by `.env.local` in the API directory. Later files take precedence. A variable already exported by the process wins over either file. Use a fresh shell if you previously exported a different URI or bootstrap password. On a hosting service, use its existing server environment. Other maintenance scripts retain their own loading rules.

```powershell
pnpm --filter api run check-admin
```

From `apps/api`, the equivalent command for this site loads the private local file directly.

```powershell
node --env-file=.env.local --import tsx scripts/seed-admin.ts --check
```

The command first prints the driver-selected host and database, then connects, pings and counts the model's collection on the primary. The read-only path never initializes collections or indexes. A missing database path can select the driver's default database (normally `test`). The authentication database in `authSource` serves a different purpose. Check the effective name against the intended Atlas database. A failed connection, ping or count leaves the count unknown.

On Windows with Node 22.23.1, passing `--env-file=.env.local` through the pnpm/Corepack command line from the monorepo root can fail in the outer Node process before pnpm selects the API directory. Putting the flags inside the package script starts Node in the intended workspace. The direct command above also starts in the correct directory.

## Compare the production API

1. In the login page's browser Network panel, inspect the failed `POST /api/v1/auth/login`. Use the Request URL to identify the API serving this build. Keep the payload, headers, cookies and session values private.
2. Open that API service in its hosting dashboard. Check its deployed revision and the matching frontend production build's `NEXT_PUBLIC_API_URL`. The frontend setting takes an HTTP(S) origin without a path. The web app also has its own MongoDB configuration for public content. The Express API owns administrator login.
3. In the **running API service's shell**, change to its API package directory. Once this version is deployed, run `node dist/cli/admin-bootstrap.js --check`. A ready response from `/health/ready` alone cannot identify the selected database.
4. On an existing deployment that predates this command, run the following read-only Node command in the API package directory. It uses the installed Mongoose driver and compiled model. It needs neither tsx nor a deployment. It prints only safe identifiers and the count.

```sh
node --input-type=module -e '
import mongoose from "mongoose";
import { AdminUser } from "./dist/models/AdminUser.js";
let client;
try {
  client = new mongoose.mongo.MongoClient(process.env.MONGODB_URI, {serverSelectionTimeoutMS:5000, connectTimeoutMS:5000, readPreference:"primary"});
  const db = client.db();
  console.log("Configured target", client.options.srvHost ?? client.options.hosts.map(String).join(","), db.databaseName);
  await client.connect();
  await db.command({ping:1}, {timeoutMS:5000});
  console.log("Administrator count", await db.collection(AdminUser.collection.name).countDocuments({}, {timeoutMS:10000}));
} catch {
  console.error("Verification failed. Administrator count unknown.");
  process.exitCode = 1;
} finally {
  await client?.close();
}'
```

Compare the production and local targets and counts. If the account count is positive, use the existing authorized administrator or an owner-approved recovery procedure. If DNS fails, check the client's SRV/TXT resolver. If connections time out, check outbound TCP to the Atlas hosts and the Atlas project's Network Access list for the actual client egress IP. If an entry is required, have the project owner authorize only the required IP or narrow network. An authentication failure calls for checking the database user, URI encoding and authentication source. An authorization failure on count calls for checking read privileges on the selected database.

## Create the first administrator after approval

Proceed only after the owner has reviewed the matching production target and a successful zero count, and explicitly approved creation. Substitute the **exact host/database** printed by the check.

```powershell
pnpm --filter api run seed-admin --target "HOST/DATABASE"
pnpm --filter api run check-admin
```

Use a private password manager for the password. The seed validates the shared login rules, caps the new password at bcrypt's 72 UTF-8 bytes, and preserves password whitespace. It creates one active `super_admin` with `mustChangePassword: false`. Concurrent bootstrap attempts use the same unique document ID. Repeating the command with any existing administrator skips creation. If interrupted or the result is ambiguous, run the read-only check again.

Expect one administrator after the first seed. Sign in at `/admin/login` on the verified site and open a protected admin page. After confirming access, remove `ADMIN_SEED_EMAIL` and `ADMIN_SEED_PASSWORD` from the private file and clear any shell copies.

```powershell
Remove-Item Env:ADMIN_SEED_EMAIL, Env:ADMIN_SEED_PASSWORD -ErrorAction SilentlyContinue
```

The running API does not need bootstrap credentials. Keep the account password in your password manager.

## Interpret the login result

| Observation | What to check |
| --- | --- |
| Login POST returns 401 with “Incorrect email or password.” | The API could not find the normalized email in its database, or bcrypt verification failed. Confirm the target and count first. |
| Login POST returns 403 | Check the response code/message for rejected origin/CSRF headers or a suspended account. |
| Login POST returns 429 | Wait for the rate-limit window. Repeated attempts prolong troubleshooting. |
| Login returns 503 mentioning the API cookie domain, or the dashboard reports a missing cookie | On Render, set `COOKIE_DOMAIN=nexastacktechnologies.com` and `WEB_APP_URL=https://nexastacktechnologies.com`. Netlify’s `NEXT_PUBLIC_API_URL` must be `https://api.nexastacktechnologies.com` at build time. Verify the login response's cookie attributes and that the web request carries the cookie by name. Keep cookie values private. |
| The dashboard received the cookie but the session check failed | Check the status of Render’s `GET /api/v1/auth/session`. For 401, verify expiry, revocation, account status, and that each API instance uses the same database and signing secret. For a service error, check API availability and the Netlify function’s connectivity to the API origin. |

Preserve CSRF, JWT verification, cookie security and server-side permissions when troubleshooting. Never paste a password, cookie, password hash, request body or full connection URI into an issue or log.
