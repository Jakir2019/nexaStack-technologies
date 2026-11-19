/**
 * Portfolio projects — the single source of truth. Read by the homepage Featured Portfolio
 * section, `/portfolio` and `/portfolio/[slug]`. Never hardcode a project in a component.
 *
 * Only real, shipped-or-in-progress work belongs here. No placeholder or "coming soon"
 * entries — a fake project card is fabricated social proof, same as a fake testimonial.
 */

export type ProjectStatus = 'live' | 'in-development' | 'demonstration';

export interface Project {
  slug: string;
  title: string;
  summary: string;
  /** Local screenshot; supply imageAlt only after the asset has been verified. */
  image?: string;
  imageAlt?: string;
  category?: string;
  tags: readonly string[];
  status: ProjectStatus;
  liveUrl?: string;
  repoUrl?: string;
  caseStudyHref: `/${string}`;
  /** Shown in the homepage section. A future project can be added here without appearing there. */
  featured: boolean;
}

export const projects: readonly Project[] = [
  {
    slug: 'careerbridge',
    title: 'CareerBridge',
    summary:
      'A full-stack job portal with separate candidate, employer and admin experiences — job listings, applications, and role-based dashboards.',
    image: '/images/portfolio/careerbridge.png',
    imageAlt: 'CareerBridge job portal homepage featuring job search and career matching.',
    tags: [
      'Next.js',
      'React',
      'TypeScript',
      'Tailwind CSS',
      'Express',
      'MongoDB',
      'Firebase Authentication',
      'JWT',
    ],
    // Known bugs: authentication/redirect flow issues, incomplete RBAC enforcement. Flip to
    // 'live' once those are fixed — nothing else needs to change.
    status: 'in-development',
    liveUrl: 'https://careerbridge-client.vercel.app',
    repoUrl: 'https://github.com/Jakirhossain80/careerbridge',
    caseStudyHref: '/portfolio/careerbridge',
    featured: true,
  },
  {
    slug: 'livetasker',
    title: 'LiveTasker',
    summary:
      'A team collaboration application with shared workspaces, drag-and-drop task boards, member management, and real-time updates.',
    category: 'Team collaboration',
    image: '/images/portfolio/livetasker-task-board.png',
    imageAlt: 'LiveTasker task board with Todo, In Progress, Review and Done columns',
    tags: [
      'React',
      'TypeScript',
      'Tailwind CSS',
      'Express',
      'MongoDB',
      'Socket.IO',
      'TanStack Query',
      'Zustand',
    ],
    status: 'demonstration',
    repoUrl: 'https://github.com/Jakirhossain80/live-tasker',
    caseStudyHref: '/portfolio/livetasker',
    featured: true,
  },
  {
    slug: 'nextcart',
    title: 'NextCart',
    summary:
      'A Next.js commerce application connecting a Sanity product catalog with shopping filters, a persistent cart and wishlist, and Stripe checkout integration.',
    category: 'E-commerce',
    image: '/images/portfolio/nextcart.png',
    imageAlt:
      'NextCart e-commerce homepage featuring promotional products and shopping categories.',
    tags: [
      'Next.js',
      'React',
      'TypeScript',
      'Tailwind CSS',
      'Sanity',
      'Clerk',
      'Stripe',
      'Zustand',
    ],
    status: 'demonstration',
    repoUrl: 'https://github.com/Jakirhossain80/next-cart',
    caseStudyHref: '/portfolio/nextcart',
    featured: true,
  },
] as const;

export function getFeaturedProjects(): readonly Project[] {
  return projects.filter((project) => project.featured);
}

export function getProjectBySlug(slug: string): Project | undefined {
  return projects.find((project) => project.slug === slug);
}
