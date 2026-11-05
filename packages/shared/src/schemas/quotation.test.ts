import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { issuesByPath, parseValid } from '../test-utils/issues.js';

import {
  ATTACHMENT_MAX_FILES,
  ATTACHMENT_MAX_SIZE_BYTES,
  attachmentSizeSchema,
  quotationSchema,
  quotationStep1Schema,
  quotationStep2Schema,
  quotationStep3Schema,
  quotationStep4Schema,
} from './quotation.js';

describe('quotation attachment size', () => {
  for (const size of [1, 4 * 1024 * 1024 - 1, 4 * 1024 * 1024]) {
    it(`accepts ${size} bytes`, () => assert.equal(attachmentSizeSchema.safeParse(size).success, true));
  }
  for (const size of [0, -1, 0.5, 4 * 1024 * 1024 + 1, 5 * 1024 * 1024, 10 * 1024 * 1024]) {
    it(`rejects ${size} bytes`, () => assert.equal(attachmentSizeSchema.safeParse(size).success, false));
  }
  it('uses the exact 4 MiB limit', () => assert.equal(ATTACHMENT_MAX_SIZE_BYTES, 4_194_304));
});

const validQuotation = {
  fullName: 'Test User',
  email: 'test@example.com',
  telephone: '+880 1000-000000',
  country: 'Bangladesh',
  projectType: 'new-website',
  requiredServices: ['business-websites'],
  businessObjectives: 'A synthetic objective for a test run.',
  targetUsers: 'Test customers',
  projectStatus: 'new',
  requiredFeatures: 'A synthetic feature list for a test run.',
  numberOfPages: '1-5',
  designRequirements: 'need-full-design',
  needsAdminDashboard: false,
  needsAuthentication: false,
  budgetRange: 'small',
  preferredStartDate: '2026-11-01',
  maintenanceRequired: 'no',
  consent: true,
};

describe('quotationSchema (full request)', () => {
  it('accepts a complete valid request and leaves optional fields undefined', () => {
    const data = parseValid(quotationSchema, validQuotation);
    assert.equal(data.companyName, undefined);
    assert.equal(data.targetCompletionDate, undefined);
    assert.equal(data.attachments, undefined);
  });

  const rejected: [string, Record<string, unknown>, string, RegExp][] = [
    ['a one-character name', { fullName: 'T' }, 'fullName', /at least 2 characters/],
    ['a malformed email', { email: 'nope' }, 'email', /valid email address/],
    ['a 5-character telephone', { telephone: '12345' }, 'telephone', /at least 6 characters/],
    [
      'a 31-character telephone',
      { telephone: '1'.repeat(31) },
      'telephone',
      /30 characters or fewer/,
    ],
    [
      'a country not in the list',
      { country: 'Atlantis' },
      'country',
      /choose a country from the list/,
    ],
    [
      'an unknown project type',
      { projectType: 'spaceship' },
      'projectType',
      /choose a project type/,
    ],
    ['no services chosen', { requiredServices: [] }, 'requiredServices', /at least one service/],
    ['an unknown service', { requiredServices: ['time-travel'] }, 'requiredServices.0', /./],
    [
      'short business objectives',
      { businessObjectives: 'short' },
      'businessObjectives',
      /at least 10 characters/,
    ],
    [
      'a 2-character target-users answer',
      { targetUsers: 'ab' },
      'targetUsers',
      /at least 3 characters/,
    ],
    ['an unknown project status', { projectStatus: 'maybe' }, 'projectStatus', /new or existing/],
    [
      'short required features',
      { requiredFeatures: 'short' },
      'requiredFeatures',
      /at least 10 characters/,
    ],
    ['an unknown page count', { numberOfPages: '9000' }, 'numberOfPages', /number of pages/],
    [
      'an unknown design option',
      { designRequirements: 'yes' },
      'designRequirements',
      /design requirements/,
    ],
    [
      'a string where a boolean is required',
      { needsAuthentication: 'yes' },
      'needsAuthentication',
      /yes or no/,
    ],
    ['an unknown budget', { budgetRange: 'free' }, 'budgetRange', /budget range/],
    [
      'a start date not in YYYY-MM-DD form',
      { preferredStartDate: '01/11/2026' },
      'preferredStartDate',
      /date picker/,
    ],
    [
      'an unknown maintenance answer',
      { maintenanceRequired: 'perhaps' },
      'maintenanceRequired',
      /yes, no, or not sure/,
    ],
    ['consent = false', { consent: false }, 'consent', /confirm you agree/],
    [
      'a malformed reference website',
      { referenceWebsites: ['not a url'] },
      'referenceWebsites.0',
      /valid URL/,
    ],
    [
      'more than 5 reference websites',
      { referenceWebsites: Array.from({ length: 6 }, (_, i) => `https://example.com/${i}`) },
      'referenceWebsites',
      /5 or fewer/,
    ],
    [
      `more than ${ATTACHMENT_MAX_FILES} attachments`,
      {
        attachments: Array.from(
          { length: ATTACHMENT_MAX_FILES + 1 },
          (_, i) => `https://example.com/f${i}.pdf`,
        ),
      },
      'attachments',
      /files or fewer/,
    ],
    [
      'an additional message over 2,000 characters',
      { additionalMessage: 'a'.repeat(2001) },
      'additionalMessage',
      /2,000/,
    ],
    [
      'integrations over 1,000 characters',
      { integrations: 'a'.repeat(1001) },
      'integrations',
      /1,000/,
    ],
  ];
  for (const [label, override, path, message] of rejected) {
    it(`rejects ${label}`, () => {
      const issues = issuesByPath(quotationSchema, { ...validQuotation, ...override });
      assert.match(issues[path]?.[0] ?? '', message);
    });
  }

  it('accepts a target completion date on or after the start date, rejects one before it', () => {
    parseValid(quotationSchema, { ...validQuotation, targetCompletionDate: '2026-11-01' });
    parseValid(quotationSchema, { ...validQuotation, targetCompletionDate: '2027-01-15' });
    const issues = issuesByPath(quotationSchema, {
      ...validQuotation,
      targetCompletionDate: '2026-10-31',
    });
    assert.match(issues['targetCompletionDate']?.[0] ?? '', /on or after the preferred start date/);
  });

  it('treats a blank target completion date as not provided', () => {
    const data = parseValid(quotationSchema, { ...validQuotation, targetCompletionDate: '' });
    assert.equal(data.targetCompletionDate, undefined);
  });

  it('rejects an impossible calendar date, not just a malformed one', () => {
    // The API is the security boundary: `2026-02-31` and `2026-13-45` match YYYY-MM-DD but are not dates.
    for (const date of ['2026-02-31', '2026-13-45', '2026-00-10']) {
      const result = quotationSchema.safeParse({ ...validQuotation, preferredStartDate: date });
      assert.equal(result.success, false, `${date} should be refused`);
    }
  });

  it('reference websites must be http(s) web addresses: script, file, data and ftp schemes are refused', () => {
    for (const url of [
      'https://example.com',
      'http://example.com/a?b=c',
      '  https://example.org  ',
    ]) {
      parseValid(quotationSchema, { ...validQuotation, referenceWebsites: [url] });
    }
    for (const url of [
      'javascript:alert(1)',
      'javascript:alert(1)x',
      'JaVaScRiPt:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'file:///etc/passwd',
      'ftp://example.com/file',
      'mailto:test@example.com',
      'vbscript:msgbox(1)',
    ]) {
      const issues = issuesByPath(quotationSchema, { ...validQuotation, referenceWebsites: [url] });
      assert.match(issues['referenceWebsites.0']?.[0] ?? '', /valid URL/, url);
    }
  });

  it('accepts every documented service value and "not-sure"', () => {
    parseValid(quotationSchema, {
      ...validQuotation,
      requiredServices: [
        'business-websites',
        'mern-nextjs-applications',
        'admin-dashboards',
        'backend-and-apis',
        'maintenance-and-bug-fixing',
        'performance-seo-audits',
        'not-sure',
      ],
    });
  });

  it('drops unknown keys, so a client cannot set server-owned fields (status, referenceNumber, archived)', () => {
    const data = parseValid(quotationSchema, {
      ...validQuotation,
      status: 'accepted',
      referenceNumber: 'NXQ-00000000',
      archived: true,
    }) as Record<string, unknown>;
    assert.equal('status' in data, false);
    assert.equal('referenceNumber' in data, false);
    assert.equal('archived' in data, false);
  });
});

describe('per-step quotation schemas (the wizard validates one step at a time)', () => {
  it('step 1 accepts client information and refuses a missing country', () => {
    parseValid(quotationStep1Schema, validQuotation);
    const { country: _country, ...withoutCountry } = validQuotation;
    assert.match(
      issuesByPath(quotationStep1Schema, withoutCountry)['country']?.[0] ?? '',
      /choose your country/,
    );
  });

  it('step 2 requires at least one service and a project status', () => {
    parseValid(quotationStep2Schema, validQuotation);
    const issues = issuesByPath(quotationStep2Schema, {
      ...validQuotation,
      requiredServices: [],
      projectStatus: undefined,
    });
    assert.ok(issues['requiredServices']);
    assert.ok(issues['projectStatus']);
  });

  it('step 3 requires features, pages and the two yes/no answers', () => {
    parseValid(quotationStep3Schema, validQuotation);
    const issues = issuesByPath(quotationStep3Schema, {});
    for (const field of [
      'requiredFeatures',
      'numberOfPages',
      'designRequirements',
      'needsAdminDashboard',
      'needsAuthentication',
    ]) {
      assert.ok(issues[field], `${field} should be required in step 3`);
    }
  });

  it('step 4 requires budget, a start date and maintenance', () => {
    parseValid(quotationStep4Schema, validQuotation);
    const issues = issuesByPath(quotationStep4Schema, {});
    for (const field of ['budgetRange', 'preferredStartDate', 'maintenanceRequired']) {
      assert.ok(issues[field], `${field} should be required in step 4`);
    }
  });
});
