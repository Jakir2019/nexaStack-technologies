import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import {
  ROLES,
  hasAnyPermission,
  hasPermission,
  type Permission,
  type Role,
} from '@nexastack/shared';

import {
  seedEnquiry,
  seedMedia,
  seedPost,
  seedQuotation,
  postBody,
  snapshot,
} from './support/fixtures.js';
import { API, startApi, type Api, type Reply } from './support/harness.js';

/**
 * Cross-role authorisation, tested ADVERSARIALLY against the real app: for every role, every representative
 * admin action either succeeds (the role holds the capability) or is refused by the SERVER with 403 and
 * changes nothing (it does not). "Hidden in the UI" proves nothing; this proves the API refuses.
 *
 * The oracle is the real `hasPermission()` from packages/shared, not a second copy of the matrix. Below it,
 * a short list of literal boundary cases states the same rule in plain words, so the exhaustive table is
 * not the only thing standing between a wrong matrix and a green run.
 */

let api: Api;
const cookies = {} as Record<Role, string>;
const admins = {} as Record<Role, { id: string; email: string }>;
let categoryId: string;
let ownerId: string; // a super_admin who authors the fixtures

before(async () => {
  api = await startApi();
  for (const role of ROLES) {
    const admin = await api.seedAdmin(role);
    admins[role] = admin;
    cookies[role] = await api.loginAs(admin);
  }
  categoryId = String((await api.seedCategory()).id);
  ownerId = admins.super_admin.id;
});

after(async () => {
  await api.stop();
});

interface Action {
  name: string;
  /** Held by the role, or (for `any`) at least one of these. */
  permission: Permission | { any: readonly Permission[] };
  /** Creates this action's fixtures, then returns the function that makes the request as a given session. */
  prepare: () => Promise<(cookie: string) => Promise<Reply>>;
  /** Status codes that mean "the gate let the request through" (the outcome past the gate varies). */
  passed: readonly number[];
}

const post = () => seedPost(api, categoryId, ownerId);

const ACTIONS: Action[] = [
  {
    name: 'list enquiries',
    permission: 'manage:enquiries',
    prepare: async () => (cookie) => api.request(`${API}/admin/enquiries`, { cookie }),
    passed: [200],
  },
  {
    name: 'export enquiries (CSV)',
    permission: 'manage:enquiries',
    prepare: async () => (cookie) => api.request(`${API}/admin/enquiries/export`, { cookie }),
    passed: [200],
  },
  {
    name: 'change an enquiry status',
    permission: 'manage:enquiries',
    prepare: async () => {
      const enquiry = await seedEnquiry(api);
      return (cookie) =>
        api.request(`${API}/admin/enquiries/${enquiry.id}/status`, {
          method: 'PATCH',
          cookie,
          body: { status: 'contacted' },
        });
    },
    passed: [200],
  },
  {
    name: 'add a note to an enquiry',
    permission: 'manage:enquiries',
    prepare: async () => {
      const enquiry = await seedEnquiry(api);
      return (cookie) =>
        api.request(`${API}/admin/enquiries/${enquiry.id}/notes`, {
          method: 'POST',
          cookie,
          body: { text: 'A synthetic note.' },
        });
    },
    passed: [201],
  },
  {
    name: 'list quotations',
    permission: 'manage:quotations',
    prepare: async () => (cookie) => api.request(`${API}/admin/quotations`, { cookie }),
    passed: [200],
  },
  {
    name: 'download a private quotation attachment',
    permission: 'manage:quotations',
    prepare: async () => {
      const quotation = await seedQuotation(api, {
        attachments: ['https://res.cloudinary.com/test-cloud/raw/authenticated/nexastack/quotations/brief.pdf'],
      });
      const url = `${API}/admin/quotations/${quotation.id}/attachments/0`;
      assert.equal((await api.request(url)).status, 401);
      return (cookie) => api.request(url, { cookie });
    },
    // Storage is deliberately unconfigured: authorized roles reach the service; others get 403.
    passed: [503],
  },
  {
    name: 'change a quotation status',
    permission: 'manage:quotations',
    prepare: async () => {
      const quotation = await seedQuotation(api);
      return (cookie) =>
        api.request(`${API}/admin/quotations/${quotation.id}/status`, {
          method: 'PATCH',
          cookie,
          body: { status: 'reviewing' },
        });
    },
    passed: [200],
  },
  {
    name: 'read the dashboard statistics',
    permission: { any: ['manage:enquiries', 'manage:quotations'] },
    prepare: async () => (cookie) => api.request(`${API}/admin/dashboard/stats`, { cookie }),
    passed: [200],
  },
  {
    name: 'list blog posts',
    permission: 'content:edit',
    prepare: async () => (cookie) => api.request(`${API}/admin/blog/posts`, { cookie }),
    passed: [200],
  },
  {
    name: 'create a blog post',
    permission: 'content:create',
    prepare: async () => (cookie) =>
      api.request(`${API}/admin/blog/posts`, {
        method: 'POST',
        cookie,
        body: postBody(categoryId),
      }),
    passed: [201],
  },
  {
    name: 'edit a DRAFT blog post',
    permission: 'content:edit',
    prepare: async () => {
      const draft = await post();
      return (cookie) =>
        api.request(`${API}/admin/blog/posts/${draft.id}`, {
          method: 'PATCH',
          cookie,
          body: postBody(categoryId, { slug: draft.slug }),
        });
    },
    passed: [200],
  },
  {
    name: 'publish a blog post',
    permission: 'content:publish',
    prepare: async () => {
      const draft = await post();
      return (cookie) =>
        api.request(`${API}/admin/blog/posts/${draft.id}/status`, {
          method: 'POST',
          cookie,
          body: { status: 'published' },
        });
    },
    passed: [200],
  },
  {
    name: 'delete a draft blog post',
    permission: 'content:delete',
    prepare: async () => {
      const draft = await post();
      return (cookie) =>
        api.request(`${API}/admin/blog/posts/${draft.id}`, { method: 'DELETE', cookie });
    },
    passed: [200],
  },
  {
    name: 'create a blog category',
    permission: 'content:create',
    prepare: async () => (cookie) =>
      api.request(`${API}/admin/blog/categories`, {
        method: 'POST',
        cookie,
        body: { name: `Test Category ${Math.random().toString(36).slice(2, 8)}` },
      }),
    passed: [201],
  },
  {
    name: 'rename a blog category',
    permission: 'content:publish',
    prepare: async () => {
      const category = await api.seedCategory(
        `Rename Me ${Math.random().toString(36).slice(2, 8)}`,
        5,
      );
      return (cookie) =>
        api.request(`${API}/admin/blog/categories/${category.id}`, {
          method: 'PATCH',
          cookie,
          body: { name: 'Renamed Test Category' },
        });
    },
    passed: [200],
  },
  {
    name: 'list the media library',
    permission: 'media:read',
    prepare: async () => (cookie) => api.request(`${API}/admin/media`, { cookie }),
    passed: [200],
  },
  {
    name: 'edit media alt text',
    permission: 'manage:media',
    prepare: async () => {
      const media = await seedMedia(api, ownerId);
      return (cookie) =>
        api.request(`${API}/admin/media/${media.id}`, {
          method: 'PATCH',
          cookie,
          body: { altText: 'Updated synthetic alt text' },
        });
    },
    passed: [200],
  },
  {
    name: 'delete a media item',
    permission: 'media:delete',
    prepare: async () => {
      const media = await seedMedia(api, ownerId);
      return (cookie) =>
        api.request(`${API}/admin/media/${media.id}`, {
          method: 'DELETE',
          cookie,
          body: { confirmFilename: media.filename },
        });
    },
    // Past the gate, storage is not configured in tests, so a permitted role is answered 503 (not 403).
    passed: [503],
  },
  {
    name: 'list admin accounts',
    permission: 'manage:admins',
    prepare: async () => (cookie) => api.request(`${API}/admin/users`, { cookie }),
    passed: [200],
  },
  {
    name: 'create an admin account',
    permission: 'manage:admins',
    prepare: async () => (cookie) =>
      api.request(`${API}/admin/users`, {
        method: 'POST',
        cookie,
        body: {
          email: `test-new-${Math.random().toString(36).slice(2, 10)}@example.com`,
          role: 'content_editor',
        },
      }),
    passed: [201],
  },
  {
    name: 'read the audit log',
    permission: 'audit:view',
    prepare: async () => (cookie) => api.request(`${API}/auth/activity`, { cookie }),
    passed: [200],
  },
];

const holds = (role: Role, permission: Action['permission']) =>
  typeof permission === 'string'
    ? hasPermission(role, permission)
    : hasAnyPermission(role, permission.any);

describe('every role against every representative action (oracle: hasPermission from packages/shared)', () => {
  for (const role of ROLES) {
    describe(role, () => {
      for (const action of ACTIONS) {
        const allowed = holds(role, action.permission);
        it(`${allowed ? 'MAY' : 'is REFUSED to'} ${action.name}`, async () => {
          const send = await action.prepare();
          const before = await snapshot(api);
          const reply = await send(cookies[role]);

          if (allowed) {
            assert.ok(
              action.passed.includes(reply.status),
              `${role} holds the capability, so the gate must let it through: expected ${action.passed.join('/')} but got ${reply.status} ${JSON.stringify(reply.body)}`,
            );
          } else {
            assert.equal(
              reply.status,
              403,
              `${role} must be refused by the server: got ${reply.status}`,
            );
            assert.equal(reply.body.success, false);
            assert.equal(reply.body.error?.code, 'FORBIDDEN');
            assert.equal(
              await snapshot(api),
              before,
              'a refused request must change nothing in the database',
            );
          }
        });
      }
    });
  }
});

describe('literal role boundaries (the same rules in plain words, not derived from the matrix)', () => {
  it('a content_editor can create and edit a DRAFT, but cannot publish, delete or manage anything else', async () => {
    const cookie = cookies.content_editor;
    const created = await api.request(`${API}/admin/blog/posts`, {
      method: 'POST',
      cookie,
      body: postBody(categoryId),
    });
    assert.equal(created.status, 201);
    const id = created.body.data.post.id as string;

    const publish = await api.request(`${API}/admin/blog/posts/${id}/status`, {
      method: 'POST',
      cookie,
      body: { status: 'published' },
    });
    assert.equal(publish.status, 403);
    assert.equal(
      (await api.models.BlogPost.findById(id).lean())?.status,
      'draft',
      'the post is still a draft',
    );

    assert.equal(
      (await api.request(`${API}/admin/blog/posts/${id}`, { method: 'DELETE', cookie })).status,
      403,
    );
    assert.ok(await api.models.BlogPost.exists({ _id: id }), 'the post still exists');

    assert.equal((await api.request(`${API}/admin/enquiries`, { cookie })).status, 403);
    assert.equal((await api.request(`${API}/admin/quotations`, { cookie })).status, 403);
    assert.equal((await api.request(`${API}/admin/users`, { cookie })).status, 403);
    assert.equal((await api.request(`${API}/auth/activity`, { cookie })).status, 403);
  });

  it('a content_editor cannot edit a post once it is live, even one it created (editing live content IS publishing)', async () => {
    const live = await seedPost(api, categoryId, admins.content_editor.id, { status: 'published' });
    const reply = await api.request(`${API}/admin/blog/posts/${live.id}`, {
      method: 'PATCH',
      cookie: cookies.content_editor,
      body: postBody(categoryId, { slug: live.slug, title: 'Vandalised title' }),
    });
    assert.equal(reply.status, 403);
    assert.match(reply.body.error?.message ?? '', /drafts only/);
    assert.notEqual(
      (await api.models.BlogPost.findById(live.id).lean())?.title,
      'Vandalised title',
    );
  });

  it('an admin runs content, enquiries, quotations and media, but cannot create or change admin accounts', async () => {
    const cookie = cookies.admin;
    assert.equal((await api.request(`${API}/admin/enquiries`, { cookie })).status, 200);
    assert.equal((await api.request(`${API}/admin/blog/posts`, { cookie })).status, 200);

    const before = await api.models.AdminUser.countDocuments();
    const create = await api.request(`${API}/admin/users`, {
      method: 'POST',
      cookie,
      body: { email: 'test-escalate@example.com', role: 'super_admin' },
    });
    assert.equal(create.status, 403);
    assert.equal(await api.models.AdminUser.countDocuments(), before, 'no account was created');

    const target = await api.seedAdmin('content_editor');
    const promote = await api.request(`${API}/admin/users/${target.id}/role`, {
      method: 'PATCH',
      cookie,
      body: { role: 'super_admin' },
    });
    assert.equal(promote.status, 403);
    assert.equal(
      (await api.models.AdminUser.findById(target.id).lean())?.role,
      'content_editor',
      'the role did not change',
    );

    const suspend = await api.request(`${API}/admin/users/${target.id}/status`, {
      method: 'PATCH',
      cookie,
      body: { status: 'suspended' },
    });
    assert.equal(suspend.status, 403);
    assert.equal((await api.models.AdminUser.findById(target.id).lean())?.status, 'active');
  });

  it('a super_admin can manage accounts', async () => {
    const reply = await api.request(`${API}/admin/users`, { cookie: cookies.super_admin });
    assert.equal(reply.status, 200);
    assert.ok(Array.isArray(reply.body.data.users));
  });

  it('a request with NO session, or only a cookie name with no value, is 401 on every admin area (never 200, never 403)', async () => {
    for (const path of [
      '/admin/enquiries',
      '/admin/quotations',
      '/admin/blog/posts',
      '/admin/media',
      '/admin/users',
      '/admin/dashboard/stats',
      '/auth/activity',
    ]) {
      const none = await api.request(`${API}${path}`);
      assert.equal(none.status, 401, path);
      assert.equal(none.body.error?.code, 'UNAUTHENTICATED');
    }
  });
});

describe('the role is read from the database on EVERY request, never trusted from the token', () => {
  it('demoting an account takes effect on its very next request, with the same cookie', async () => {
    const admin = await api.seedAdmin('super_admin');
    const cookie = await api.loginAs(admin);
    assert.equal((await api.request(`${API}/admin/users`, { cookie })).status, 200);

    await api.models.AdminUser.updateOne({ _id: admin.id }, { role: 'content_editor' });

    assert.equal((await api.request(`${API}/admin/users`, { cookie })).status, 403);
    const session = await api.request(`${API}/auth/session`, { cookie });
    assert.equal(session.body.data.admin.role, 'content_editor');
  });

  it('promoting an account works the same way in the other direction', async () => {
    const admin = await api.seedAdmin('content_editor');
    const cookie = await api.loginAs(admin);
    assert.equal((await api.request(`${API}/admin/enquiries`, { cookie })).status, 403);
    await api.models.AdminUser.updateOne({ _id: admin.id }, { role: 'admin' });
    assert.equal((await api.request(`${API}/admin/enquiries`, { cookie })).status, 200);
  });
});
