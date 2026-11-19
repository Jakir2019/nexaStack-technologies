import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import { caseStudies } from '@/config/case-studies';
import { getFeaturedProjects, projects } from '@/config/projects';
import { services } from '@/config/services';

test('portfolio entries, case studies and homepage links stay in sync', () => {
  const expected = ['careerbridge', 'livetasker', 'nextcart'];
  assert.deepEqual(
    projects.map((project) => project.slug),
    expected,
  );
  assert.deepEqual(
    caseStudies.map((study) => study.slug),
    expected,
  );
  assert.deepEqual(
    getFeaturedProjects().map((project) => project.slug),
    expected,
  );
  for (const project of projects) {
    assert.equal(project.caseStudyHref, `/portfolio/${project.slug}`);
    for (const href of [project.repoUrl, project.liveUrl].filter(Boolean)) {
      assert.equal(new URL(href!).protocol, 'https:');
    }
    if (project.imageAlt) {
      assert.ok(project.image);
      assert.ok(existsSync(path.join(import.meta.dirname, '../public', project.image)));
    }
  }
  for (const study of caseStudies) {
    assert.equal(study.technicalChallenges.length, study.challengeSolutions.length);
    for (const slug of study.relatedServiceSlugs) {
      assert.ok(services.some((service) => service.slug === slug));
    }
    for (const screenshot of study.screenshots) {
      assert.ok(screenshot.alt.trim());
      assert.ok(existsSync(path.join(import.meta.dirname, '../public', screenshot.src)));
    }
  }
});

test('new case studies disclose verification limits without placeholder claims', () => {
  for (const study of caseStudies.filter((item) => item.slug !== 'careerbridge')) {
    assert.ok(study.statusNote);
    assert.ok(study.workflows?.length);
    assert.doesNotMatch(JSON.stringify(study), /\[add |coming soon/i);
  }
});

test('CareerBridge and NextCart have valid card images and matching case-study screenshots', () => {
  for (const project of projects.filter((item) =>
    ['careerbridge', 'nextcart'].includes(item.slug),
  )) {
    assert.ok(project.image, `${project.slug} card image`);
    assert.ok(project.imageAlt?.trim(), `${project.slug} card image alt text`);
    const imagePath = path.join(import.meta.dirname, '../public', project.image);
    assert.ok(existsSync(imagePath), `${project.slug} image does not exist: ${project.image}`);

    const study = caseStudies.find((item) => item.slug === project.slug);
    assert.ok(study, `${project.slug} case study`);
    assert.ok(
      study.screenshots.some(
        (screenshot) => screenshot.src === project.image && screenshot.alt === project.imageAlt,
      ),
      `${project.slug} case study does not reuse its configured main image`,
    );
  }
});
