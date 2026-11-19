import type { Project } from '@/config/projects';

import { ProjectCard } from './ProjectCard';

export interface ProjectGridProps {
  projects: readonly Project[];
  headingLevel?: 'h2' | 'h3';
}

/**
 * Count-aware layout, shared by the homepage Featured Portfolio section and `/portfolio`: one
 * project reads as a deliberate single case-study feature, not a grid missing items; two or
 * more tile into a responsive grid. Adding a project to `config/projects.ts` is the only change
 * needed to move from one state to the other — nothing here needs to be rewritten.
 */
export function ProjectGrid({ projects, headingLevel = 'h3' }: ProjectGridProps) {
  if (projects.length === 0) return null;

  if (projects.length === 1) {
    return <ProjectCard project={projects[0]!} layout="featured" headingLevel={headingLevel} />;
  }

  return (
    <ul className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
      {projects.map((project) => (
        <li key={project.slug}>
          <ProjectCard project={project} layout="tile" headingLevel={headingLevel} />
        </li>
      ))}
    </ul>
  );
}
