/**
 * Long-form detail content for `/portfolio/[slug]` — a companion to `config/projects.ts`, not
 * an extension of it, same relationship `config/service-details.ts` has to `config/services.ts`.
 *
 * Deliberately NOT duplicated here (read straight from `Project` on the page instead):
 * - `status` — gates the honest "still in progress" framing for screenshots/results/live-link.
 * - `tags` — rendered directly as the Technology stack chip row; a project's real stack lives
 *   in one place, not copied into a second field that could drift from it.
 * - `liveUrl` / `repoUrl` — already optional-and-real on `Project`; showing them here too would
 *   just be a second place for the "only render if populated" rule to go stale.
 *
 * A project does not need a case study to exist (`generateStaticParams` on the page only
 * builds slugs listed below) — the reverse would be dishonest (a case study describing a
 * project that isn't real), the forward direction is just "not written yet."
 *
 * Honesty rules (root CLAUDE.md section 22, carried over from `service-details.ts`):
 * - No invented metric, user count or percentage anywhere below — a real result gets a
 *   bracketed placeholder instead: `[add real result — metric, outcome, or feedback]`.
 * - No implied client relationship for a project that was actually self-directed.
 * - No architecture or security detail borrowed from NexaStack's own current stack (root
 *   CLAUDE.md section 5) unless it's confirmed as what that specific project actually used —
 *   an unconfirmed detail is bracketed, never upgraded to sound more finished.
 * - `technicalChallenges` / `challengeSolutions` only name what's genuinely known; an
 *   unresolved bug stays described as unresolved, not written up as already fixed.
 */

import { getProjectBySlug } from './projects';

export interface CaseStudy {
  slug: string;
  overview: string;
  businessProblem: string;
  objectives: readonly string[];
  targetUsers: string;
  proposedSolution: string;
  majorFeatures: readonly string[];
  /** Omit entirely (leave undefined) for a genuinely single-role project — don't invent roles. */
  userRoles?: readonly { role: string; description: string }[];
  systemArchitecture: string;
  developmentProcess?: string;
  workflows?: readonly string[];
  statusNote?: string;
  screenshotNote?: string;
  /** Index-matched with `challengeSolutions` — challenge N pairs with solution N. */
  technicalChallenges: readonly string[];
  challengeSolutions: readonly string[];
  securityApproach: string;
  /** Real image paths only. Empty is a valid, honest answer — the page renders a "coming soon" note. */
  screenshots: readonly { src: string; alt: string }[];
  projectResults: string;
  /** Slugs from `config/services.ts` genuinely used to build this project. */
  relatedServiceSlugs: readonly string[];
}

export const caseStudies: readonly CaseStudy[] = [
  {
    slug: 'careerbridge',
    overview:
      'CareerBridge is a full-stack job portal built to work through the real complexity of a multi-role application: four distinct role-based experiences — job seeker, employer, administrator and super-administrator — behind job listings, applications and role-gated dashboards, all under one authentication system. It is a self-directed project, still in active development, not a commissioned client build.',
    businessProblem:
      'There is no client behind this project — it was built independently, not commissioned. The problem it addresses is one common to any real job-portal product: coordinating job postings, applications and account management across four different kinds of users (job seekers, employers, administrators and super-administrators) without conflating their access, rather than solving a single shared-login CRUD app.',
    objectives: [
      'Build a working end-to-end job-portal flow: listings, applications, and a dashboard for each role',
      'Implement role-based access control across job seeker, employer, administrator and super-administrator accounts',
      'Practice a full stack end to end — a Next.js/React frontend backed by an Express/MongoDB API',
      '[add the original motivation in more detail — e.g. a specific gap in existing job-board tools, if there was one]',
    ],
    targetUsers:
      'Job seekers browsing and applying to listings, employers posting and managing listings and reviewing applications, administrators overseeing day-to-day platform operation, and a super-administrator managing administrator accounts and platform-level configuration — the four roles the dashboards and access control are built around.',
    proposedSolution:
      'A single Next.js/React application with four distinct experiences gated by role: a job-seeker-facing flow for browsing and applying to jobs, an employer-facing flow for posting, managing and reviewing applications against listings, an administrative view for platform oversight, and a super-administrator tier for managing administrator accounts and system configuration — backed by an Express REST API and a MongoDB database, with Firebase Authentication handling identity and a JWT-based session layer enforcing what each account type can see and do.',
    majorFeatures: [
      'End-to-end job-posting and application workflow — employers post and manage listings; job seekers search, browse and apply',
      'Employer-side application review, candidate shortlisting, and interview scheduling and management',
      'Four distinct role-gated dashboards — job seeker, employer, administrator, super-administrator',
      'Firebase Authentication for identity, paired with a JWT-based session layer for role-based authorization',
    ],
    userRoles: [
      {
        role: 'Job seeker',
        description:
          'Searches and browses job listings, applies to postings, tracks the status of submitted applications, and manages a personal profile from a job-seeker dashboard.',
      },
      {
        role: 'Employer',
        description:
          'Posts and manages job listings, reviews incoming applications, shortlists candidates, and schedules and manages interviews from an employer-facing dashboard.',
      },
      {
        role: 'Administrator',
        description:
          "Oversees the platform's day-to-day operation — managing user accounts and moderating job-listing content — from an administrative dashboard.",
      },
      {
        role: 'Super-administrator',
        description:
          'Sits above the Administrator tier: manages Administrator accounts and controls platform-level system configuration.',
      },
    ],
    systemArchitecture:
      "A Next.js/React frontend (deployed separately from the API — the live site is CareerBridge's 'client' deployment) talking to an Express.js REST API, with MongoDB as the database. Firebase Authentication handles user identity and sign-in; on successful sign-in, the Express API issues its own JWT, stored in a cookie, which governs session authorization. Role-based middleware on the API reads that JWT to enforce what each of the four account types — job seeker, employer, administrator, super-administrator — can access.",
    developmentProcess:
      'Built and iterated on independently rather than through the client-facing consultation-to-deployment process described on the homepage — a self-directed practice build, working through the frontend, backend and data model together. [add more detail on the actual build timeline or process if useful]',
    technicalChallenges: [
      'Authentication and redirect-flow issues — edge cases in the login/session flow not behaving as expected',
      'Incomplete role-based access control (RBAC) enforcement — role checks not yet fully applied across every route',
      'Integrating two separate authentication mechanisms — Firebase Authentication for identity and a custom JWT layer for session and role authorization — into one coherent sign-in and session flow',
    ],
    challengeSolutions: [
      'Still being worked on — not yet resolved. [add the fix once implemented, e.g. what specifically changed in the auth/redirect flow]',
      "Still being worked on — RBAC enforcement needs to be completed and re-verified across every protected route before this project moves from 'in development' to 'live'. [add the fix once implemented]",
      'Resolved by keeping the two systems cleanly separated: Firebase Authentication owns identity and sign-in, while the Express API issues and validates its own JWT for session and role authorization — each system does one job, rather than one trying to do both.',
    ],
    securityApproach:
      "Role-based authorization is enforced through server-side middleware rather than hidden UI alone — the same server-side-enforcement discipline NexaStack's own API follows (see root CLAUDE.md section 11.3) — governing what each of the four roles (job seeker, employer, administrator, super-administrator) can access. Firebase Authentication handles identity and credentials; the Express API's own JWT, stored in a cookie rather than localStorage, governs session authorization. Enforcement is not yet complete across every route, however — a known, open issue (see Technical challenges above), not a finished security posture. [add real detail on password handling and input validation actually implemented, once confirmed]",
    screenshots: [
      {
        src: '/images/portfolio/careerbridge.png',
        alt: 'CareerBridge job portal homepage featuring job search and career matching.',
      },
    ],
    projectResults:
      'CareerBridge is a working end-to-end job portal today — job listings, applications and role-gated dashboards function for all four roles — but it is not yet feature-complete or bug-free: the authentication/redirect and RBAC issues above are still open, which is why it is listed as in-development rather than live. [add real result — metric, outcome, or feedback if available once complete]',
    relatedServiceSlugs: ['mern-nextjs-applications', 'backend-and-apis', 'admin-dashboards'],
  },
  {
    slug: 'livetasker',
    overview:
      'LiveTasker brings workspaces, Kanban boards, task assignments and real-time collaboration together in a React and Express application.',
    businessProblem:
      'Team work becomes difficult to follow when responsibilities, deadlines and status updates are scattered. LiveTasker models a shared workspace where members can see the work and update its progress in context.',
    objectives: [
      'Organize work by workspace, board and task.',
      'Keep task status, responsibility and due dates visible to collaborators.',
      'Synchronize board activity across connected members.',
    ],
    targetUsers:
      'Teams coordinating shared projects, workspace owners organizing access, and members managing assigned work.',
    proposedSolution:
      'A workspace-based application with configurable Kanban columns, task editing and assignment, member management, and an activity timeline. A React dashboard communicates with an Express API, while Socket.IO distributes task events to authorized board and workspace rooms.',
    majorFeatures: [
      'Email/password registration and login, token refresh, profile editing and password changes.',
      'Workspace creation and editing, board management, and owner/admin/member membership.',
      'Task creation, editing and deletion, priorities, labels, assignees and due dates.',
      'Drag-and-drop board movement with pointer and keyboard sensors, optimistic updates and failure recovery.',
      'Socket.IO task events and workspace presence, with activity records for task changes.',
      'Task discussion and personal task views are represented by dedicated dashboard routes and API modules.',
    ],
    userRoles: [
      {
        role: 'Workspace owner',
        description:
          'Creates the workspace and can manage members and archive it. The owner cannot be removed or have their role changed through member management.',
      },
      {
        role: 'Workspace administrator',
        description:
          'Updates workspace details and manages non-owner members through server-side permission checks.',
      },
      {
        role: 'Member',
        description:
          'Works with tasks in joined workspaces. Task deletion is restricted to owners, administrators or the task creator.',
      },
    ],
    systemArchitecture:
      'The repository contains a Vite/React TypeScript client and a Node.js/Express TypeScript server. React Router organizes public and dashboard routes; TanStack Query handles server data and mutations; Zustand holds the in-memory authentication state. Mongoose models represent users, workspaces, boards, tasks, comments and activity logs. REST routes delegate to controllers and services, with Socket.IO rooms providing the real-time channel.',
    workflows: [
      'Register or sign in, then create or join a workspace.',
      'Create a board, organize its columns, and add tasks with priorities and due dates.',
      'Assign work, move tasks between columns, and review activity as connected clients receive updates.',
    ],
    technicalChallenges: [
      'Reconciling immediate board movement with server responses and repeated socket events.',
      'Restricting real-time subscriptions to members of the relevant workspace.',
    ],
    challengeSolutions: [
      'The board maintains local task ordering alongside the query cache, tracks recent move signatures to avoid duplicate updates, and invalidates data after mutations. This is an implemented synchronization approach, not a measured concurrency guarantee.',
      'Socket handshakes verify access tokens, and board/workspace room joins check workspace membership before subscribing the connection.',
    ],
    securityApproach:
      'The server hashes passwords with bcrypt at cost 12 and verifies JWT access tokens. Workspace services check membership and roles; task deletion has an explicit owner/admin/creator check. These are source-verified controls, not a security certification. The current join flow uses a workspace identifier rather than a separately expiring invitation token, so invitation hardening remains a consideration before production use.',
    screenshots: [
      {
        src: '/images/portfolio/livetasker-task-board.png',
        alt: 'LiveTasker repository screenshot showing tasks arranged across Todo, In Progress, Review and Done',
      },
    ],
    statusNote:
      'Demonstration project. Core application code is implemented; hosted authentication, persistence and multi-user synchronization were not exercised during this portfolio review. Email/push notifications, attachments and calendar integration are listed as future improvements in the README. A Gemini description-generation endpoint exists but its hosted operation is unverified.',
    projectResults:
      'The repository demonstrates a connected workspace and task-management architecture, including drag-and-drop interaction and event-driven updates. No customer adoption, productivity metrics or production-readiness claims have been established.',
    relatedServiceSlugs: ['mern-nextjs-applications', 'backend-and-apis', 'admin-dashboards'],
  },
  {
    slug: 'nextcart',
    overview:
      'NextCart is a Next.js commerce application with a Sanity catalog, persistent cart and wishlist, Clerk authentication, and Stripe checkout integration.',
    businessProblem:
      'An online storefront needs to connect product discovery, shopping state and order records while giving content editors a way to maintain the catalog. NextCart explores that workflow in a single application backed by managed services.',
    objectives: [
      'Publish products, categories, brands and editorial content from a structured CMS.',
      'Support product discovery and preserve cart and wishlist choices between visits.',
      'Connect checkout completion with order records and stock updates.',
    ],
    targetUsers:
      'Shoppers browsing and purchasing products, returning customers reviewing orders, and content editors maintaining the Sanity catalog.',
    proposedSolution:
      'A Next.js App Router storefront uses Sanity queries for product and blog content, Zustand for shopping state, Clerk for identity, and a server action to create Stripe Checkout sessions. A webhook handler creates Sanity orders and attempts stock adjustments after checkout completion.',
    majorFeatures: [
      'CMS-driven products, categories, brands, deals and product detail pages.',
      'Product search plus category, brand and price-range filters.',
      'Persistent cart quantities and wishlist toggles through Zustand persist.',
      'Clerk sign-in integration and a customer order page queried by Clerk user ID.',
      'Stripe Checkout session creation and signature-verified webhook processing for order creation, invoice references and stock updates.',
      'Sanity Studio at /studio with product, order, category, brand, blog and author schemas.',
      'Blog listings and article detail pages powered by Sanity content.',
    ],
    systemArchitecture:
      'Next.js 16 and React provide the storefront and server runtime in one repository. TypeScript types connect Sanity schemas, GROQ queries and the shopping store. Tailwind CSS and Radix-based UI components form the interface. Server actions create checkout sessions; a Route Handler processes Stripe events; Sanity stores catalog and order documents. There is no separate Express backend in this project.',
    workflows: [
      'Browse the shop, search products or narrow the catalog by category, brand and price.',
      'Save favorites, adjust cart quantities, then request a hosted Stripe checkout session.',
      'The checkout-completed webhook records an order and attempts stock updates; the customer order view displays stored status and invoice information.',
      'Editors maintain catalog and blog documents in the embedded Sanity Studio.',
    ],
    technicalChallenges: [
      'Keeping shopping selections across reloads without coupling the cart to every page.',
      'Connecting a payment event to catalog references and customer order history.',
    ],
    challengeSolutions: [
      'A shared Zustand store persists cart items and favorites and centralizes quantity, removal and reset operations.',
      'Checkout metadata carries product and customer references. The signature-verified webhook maps Stripe line items to Sanity product references and creates an order with invoice data. Duplicate-event handling and atomic stock changes still need hardening.',
    ],
    securityApproach:
      'Clerk supplies identity and the Stripe webhook verifies its signature against the raw request body. Production hardening remains necessary: the reviewed checkout action accepts submitted product prices and customer metadata, and the route-protection middleware continues after caught errors. These code paths do not establish production-safe authorization or payment integrity.',
    screenshots: [
      {
        src: '/images/portfolio/nextcart.png',
        alt: 'NextCart e-commerce homepage featuring promotional products and shopping categories.',
      },
    ],
    statusNote:
      'Demonstration project with implemented commerce integrations and unresolved production-hardening work. Live payment completion, webhook delivery, Sanity permissions and deployed availability were not verified. Order statuses are stored CMS values, not evidence of a carrier tracking integration.',
    projectResults:
      'NextCart demonstrates the integration of content management, shopping state, identity and payment-related server code. The portfolio does not claim real sales, completed production payments, business results or a production security review.',
    relatedServiceSlugs: ['mern-nextjs-applications', 'backend-and-apis'],
  },
] as const;

// Defensive check, same spirit as `service-details.ts`: catches a case study referencing a
// project slug that doesn't exist (typo, or the project was removed) at build time. The reverse
// isn't checked — not every project needs a case study yet.
for (const detail of caseStudies) {
  if (!getProjectBySlug(detail.slug)) {
    throw new Error(`config/case-studies.ts references unknown project slug: ${detail.slug}`);
  }
}

export function getCaseStudyBySlug(slug: string): CaseStudy | undefined {
  return caseStudies.find((detail) => detail.slug === slug);
}
