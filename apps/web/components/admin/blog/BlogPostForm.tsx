'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  BLOG_EXCERPT_MAX,
  BLOG_TAGS_MAX,
  CONTENT_STATUS,
  blogPostFormSchema,
  type BlogCategoryAdmin,
  type BlogPostAdminDetail,
  type BlogPostInput,
} from '@nexastack/shared';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Controller, useForm, useWatch, type Resolver } from 'react-hook-form';

import { BlogCoverField, type CoverMode } from '@/components/admin/blog/BlogCoverField';
import { ConfirmDeleteButton } from '@/components/admin/content/ConfirmDeleteButton';
import { FormField } from '@/components/admin/content/FormField';
import { StatusActionBar } from '@/components/admin/content/StatusActionBar';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { adminRequest } from '@/lib/adminRequest';
import { expireBlogCache } from '@/lib/expireBlogCache';
import type { PickerItem } from '@/lib/mediaActions';

export interface BlogPostFormProps {
  categories: readonly BlogCategoryAdmin[];
  /** Omit to create a new post. */
  post?: BlogPostAdminDetail;
  /**
   * What this admin may do, decided on the server from their role. `canPublish` (`content:publish`)
   * covers every status change and editing a post that is no longer a draft; `canDelete`
   * (`content:delete`) covers deleting. Hiding what a role cannot do is a courtesy: the API refuses it.
   */
  canPublish: boolean;
  canDelete: boolean;
}

interface PostFormFields {
  title: string;
  slug: string;
  excerpt: string;
  categoryId: string;
  tags: string[];
  coverImage: string;
  coverMediaId: string;
  coverImageAlt: string;
  contentMarkdown: string;
  featured: boolean;
}

const FIELD_NAMES: readonly string[] = [
  'title',
  'slug',
  'excerpt',
  'categoryId',
  'tags',
  'coverImage',
  'coverMediaId',
  'coverImageAlt',
  'contentMarkdown',
  'featured',
];

const BLOG_API = '/api/v1/admin/blog';
const CARD_CLASSES = 'rounded-card border border-default bg-surface p-4 md:p-5';

function toFields(post: BlogPostAdminDetail | undefined): PostFormFields {
  return {
    title: post?.title ?? '',
    slug: post?.slug ?? '',
    excerpt: post?.excerpt ?? '',
    categoryId: post?.category?.id ?? '',
    tags: post?.tags ?? [],
    // For a library cover, `coverImage` on the post is the library URL, which the API sets itself: the
    // form holds it only in `coverMediaId` (sending both is rejected). It is a typed path otherwise.
    coverImage: post?.coverMediaId ? '' : (post?.coverImage ?? ''),
    coverMediaId: post?.coverMediaId ?? '',
    coverImageAlt: post?.coverImageAlt ?? '',
    contentMarkdown: post?.contentMarkdown ?? '',
    featured: post?.featured ?? false,
  };
}

/** "a, b ,, c" → ["a", "b", "c"]. The schema trims, de-duplicates and enforces the limits. */
function parseTags(text: string): string[] {
  return text
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
}

/**
 * The blog post editor: create and edit share this one form. Validation is the shared
 * `blogPostFormSchema` (the same schema the API enforces, which is the security boundary). Saving
 * never changes status: publishing, unpublishing, archiving and restoring are the separate
 * `StatusActionBar`, and are disabled while there are unsaved edits so a click can never publish
 * something other than what is on screen.
 */
export function BlogPostForm({ categories, post, canPublish, canDelete }: BlogPostFormProps) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [tagsText, setTagsText] = useState((post?.tags ?? []).join(', '));
  // What to show for a library cover: an image just picked (with its file name), or, for a post saved
  // earlier, the URL the API stored (the file name is not part of the post).
  const [coverPreview, setCoverPreview] = useState<{ url: string; name?: string } | null>(
    post?.coverMediaId && post.coverImage ? { url: post.coverImage } : null,
  );
  // "Use a site image path instead" was chosen (or the post already has one).
  const [pathMode, setPathMode] = useState(Boolean(post?.coverImage && !post.coverMediaId));

  const isEditing = post !== undefined;
  const isArchived = post?.status === CONTENT_STATUS.ARCHIVED;
  const slugLocked = Boolean(post?.publishedAt);
  // A role without `content:publish` (a content editor) edits DRAFTS only: changing a post that is live,
  // unpublished or archived is publishing work. The API enforces the same rule.
  const lockedForRole = isEditing && !canPublish && post.status !== CONTENT_STATUS.DRAFT;
  const isReadOnly = isArchived || lockedForRole;

  const {
    register,
    control,
    handleSubmit,
    reset,
    setError,
    setValue,
    clearErrors,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<PostFormFields, unknown, BlogPostInput>({
    resolver: zodResolver(blogPostFormSchema) as unknown as Resolver<
      PostFormFields,
      unknown,
      BlogPostInput
    >,
    defaultValues: toFields(post),
  });

  // `useWatch`, not `watch()`: the latter cannot be memoized by the React Compiler.
  const excerptLength = useWatch({ control, name: 'excerpt' }).length;
  const [coverMediaId, coverImage, coverImageAlt] = useWatch({
    control,
    name: ['coverMediaId', 'coverImage', 'coverImageAlt'],
  });

  const coverMode: CoverMode = coverMediaId ? 'library' : pathMode || coverImage ? 'path' : 'none';

  // Editing the cover marks the form dirty (so the status actions lock until it is saved) and clears any
  // stale cover errors.
  const coverChange = { shouldDirty: true, shouldTouch: true } as const;

  function pickCover(item: PickerItem) {
    setValue('coverMediaId', item.id, coverChange);
    setValue('coverImage', '', coverChange);
    // The image's alt text is the starting point for this post's; it can then differ per use.
    setValue('coverImageAlt', item.altText ?? '', coverChange);
    clearErrors(['coverMediaId', 'coverImage', 'coverImageAlt']);
    setCoverPreview({ url: item.url, name: item.filename });
    setPathMode(false);
  }

  function removeCover() {
    setValue('coverMediaId', '', coverChange);
    setValue('coverImage', '', coverChange);
    setValue('coverImageAlt', '', coverChange);
    clearErrors(['coverMediaId', 'coverImage', 'coverImageAlt']);
    setCoverPreview(null);
    setPathMode(false);
  }

  function useSitePath() {
    setValue('coverMediaId', '', coverChange);
    clearErrors(['coverMediaId']);
    setCoverPreview(null);
    setPathMode(true);
  }

  const onSubmit = handleSubmit(async (data) => {
    setServerError(null);
    setSavedMessage(null);

    const result = isEditing
      ? await adminRequest<{ post: BlogPostAdminDetail }>(
          'PATCH',
          `${BLOG_API}/posts/${post.id}`,
          data,
        )
      : await adminRequest<{ post: BlogPostAdminDetail }>('POST', `${BLOG_API}/posts`, data);

    if (!result.ok) {
      // Field-level problems go on their field; anything else is a form-level message.
      let placed = false;
      for (const detail of result.error.details ?? []) {
        if (detail.location === 'body' && FIELD_NAMES.includes(detail.path)) {
          setError(detail.path as keyof PostFormFields, { message: detail.message });
          placed = true;
        }
      }
      if (!placed && result.status === 409 && /slug/i.test(result.error.message)) {
        setError('slug', { message: result.error.message });
        placed = true;
      }
      if (!placed) setServerError(result.error.message);
      return;
    }

    if (!isEditing) {
      router.push(`/admin/blog/${result.data.post.id}/edit`);
      return;
    }

    // The public blog caches published posts; tell it this one changed (best-effort, see the helper).
    await expireBlogCache();

    // Re-base the form on what the server saved, so `isDirty` clears and the status actions unlock.
    reset(toFields(result.data.post));
    setTagsText(result.data.post.tags.join(', '));
    setSavedMessage('Saved.');
    router.refresh();
  });

  if (categories.length === 0) {
    return (
      <div className={CARD_CLASSES}>
        <p className="text-body text-primary">A post needs a category, and none exist yet.</p>
        <Button href="/admin/blog/categories" className="mt-4">
          Create a category
        </Button>
      </div>
    );
  }

  const categoryOptions = categories.map((category) => ({
    value: category.id,
    label: category.name,
  }));
  const saveLabel =
    isEditing && post.status !== CONTENT_STATUS.DRAFT ? 'Save changes' : 'Save draft';

  return (
    <div className="space-y-8">
      {isEditing && (
        <section aria-labelledby="publishing-heading" className={CARD_CLASSES}>
          <h2 id="publishing-heading" className="text-card font-semibold text-primary">
            Publishing
          </h2>
          <div className="mt-4 space-y-4">
            {canPublish ? (
              <StatusActionBar
                status={post.status}
                statusUrl={`${BLOG_API}/posts/${post.id}/status`}
                onSuccess={expireBlogCache}
                disabledReason={
                  isDirty
                    ? 'You have unsaved changes. Save them before changing the status.'
                    : undefined
                }
              />
            ) : (
              <p className="text-body text-secondary">
                Your role can write and edit drafts. Publishing, unpublishing, archiving and
                deleting are done by an admin.
              </p>
            )}
            <div className="flex flex-wrap items-center gap-3 border-t border-default pt-4">
              <Button
                href={`/admin/blog/${post.id}/preview`}
                variant="secondary"
                target="_blank"
                rel="noopener"
              >
                Preview
                <span className="sr-only"> (opens in a new tab; shows the last saved version)</span>
              </Button>
              {canDelete && (post.status === CONTENT_STATUS.DRAFT || isArchived) && (
                <ConfirmDeleteButton
                  url={`${BLOG_API}/posts/${post.id}`}
                  itemLabel="post"
                  redirectTo="/admin/blog"
                  label="Delete post"
                />
              )}
            </div>
          </div>
        </section>
      )}

      {lockedForRole && (
        <p
          role="note"
          className="rounded-field border border-strong bg-surface px-4 py-3 text-body text-primary"
        >
          This post is {post.status}, and your role can only edit drafts because changing it would
          change the public site. Ask an admin to make the change.
        </p>
      )}

      {isArchived && canPublish && (
        <p
          role="note"
          className="rounded-field border border-strong bg-surface px-4 py-3 text-body text-primary"
        >
          This post is archived and cannot be edited. Restore it to a draft to make changes.
        </p>
      )}

      <form
        onSubmit={onSubmit}
        noValidate
        className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]"
      >
        <fieldset disabled={isReadOnly} className="min-w-0 space-y-6">
          <legend className="sr-only">Post content</legend>

          {serverError && (
            <p
              role="alert"
              className="rounded-field border border-error bg-surface px-4 py-3 text-body text-error"
            >
              {serverError}
            </p>
          )}

          <FormField id="title" label="Title" required error={errors.title?.message}>
            <Input
              id="title"
              invalid={Boolean(errors.title)}
              aria-required="true"
              aria-describedby="title-hint title-error"
              {...register('title')}
            />
          </FormField>

          <FormField
            id="excerpt"
            label="Excerpt"
            required
            hint={`${excerptLength}/${BLOG_EXCERPT_MAX} characters. Shown on the blog list, in search results and when shared.`}
            error={errors.excerpt?.message}
          >
            <Textarea
              id="excerpt"
              rows={3}
              invalid={Boolean(errors.excerpt)}
              aria-required="true"
              aria-describedby="excerpt-hint excerpt-error"
              {...register('excerpt')}
            />
          </FormField>

          <FormField
            id="contentMarkdown"
            label="Body (markdown)"
            required
            error={errors.contentMarkdown?.message}
            hint={
              <>
                Use <code className="font-mono">##</code> and <code className="font-mono">###</code>{' '}
                for headings. Pipe comparison tables are supported. Raw HTML and images are not
                supported and appear as plain text.
              </>
            }
          >
            <Textarea
              id="contentMarkdown"
              rows={20}
              spellCheck
              invalid={Boolean(errors.contentMarkdown)}
              aria-required="true"
              aria-describedby="contentMarkdown-hint contentMarkdown-error"
              className="min-h-96 font-mono"
              {...register('contentMarkdown')}
            />
          </FormField>

          <details className="rounded-field border border-default bg-surface px-4 py-3">
            <summary className="min-h-11 cursor-pointer py-2 text-label font-medium text-primary focus-ring">
              Markdown reference
            </summary>
            <ul className="mt-2 space-y-1.5 text-label text-secondary">
              <li>
                <code className="font-mono">## Heading</code> and{' '}
                <code className="font-mono">### Sub-heading</code>
              </li>
              <li>
                <code className="font-mono">**bold**</code>,{' '}
                <code className="font-mono">*italic*</code>,{' '}
                <code className="font-mono">`code`</code>
              </li>
              <li>
                <code className="font-mono">[link text](https://example.com)</code> or{' '}
                <code className="font-mono">[link](/services)</code>
              </li>
              <li>
                <code className="font-mono">- bullet</code> and{' '}
                <code className="font-mono">1. numbered</code> lists, one item per line
              </li>
              <li>
                <code className="font-mono">&gt; quote</code>
              </li>
              <li>Three backticks on their own line start and end a code block</li>
            </ul>
          </details>
        </fieldset>

        <aside className="min-w-0 space-y-6">
          <fieldset
            disabled={isReadOnly}
            className="space-y-6 rounded-card border border-default bg-surface p-4 md:p-5"
          >
            <legend className="px-1 text-card font-semibold text-primary">Details</legend>

            <FormField id="categoryId" label="Category" required error={errors.categoryId?.message}>
              <Select
                id="categoryId"
                placeholder="Choose a category"
                options={categoryOptions}
                invalid={Boolean(errors.categoryId)}
                aria-required="true"
                aria-describedby="categoryId-hint categoryId-error"
                {...register('categoryId')}
              />
            </FormField>

            <FormField
              id="slug"
              label="URL slug"
              hint={
                slugLocked
                  ? 'Locked because this post has been published; changing it would break existing links.'
                  : 'Leave blank to create it from the title.'
              }
              error={errors.slug?.message}
            >
              <Input
                id="slug"
                readOnly={slugLocked}
                invalid={Boolean(errors.slug)}
                aria-describedby="slug-hint slug-error"
                {...register('slug')}
              />
            </FormField>

            <FormField
              id="tags"
              label="Tags"
              hint={`Separate with commas. Up to ${BLOG_TAGS_MAX}.`}
              error={
                errors.tags?.message ??
                errors.tags?.find?.((tagError) => tagError?.message)?.message
              }
            >
              <Controller
                control={control}
                name="tags"
                render={({ field }) => (
                  <Input
                    id="tags"
                    value={tagsText}
                    onBlur={field.onBlur}
                    invalid={Boolean(errors.tags)}
                    aria-describedby="tags-hint tags-error"
                    onChange={(event) => {
                      setTagsText(event.target.value);
                      field.onChange(parseTags(event.target.value));
                    }}
                  />
                )}
              />
            </FormField>

            <BlogCoverField
              mode={coverMode}
              mediaId={coverMediaId}
              previewUrl={coverPreview?.url}
              previewAlt={coverImageAlt}
              previewName={coverPreview?.name}
              error={errors.coverMediaId?.message}
              onPick={pickCover}
              onRemove={removeCover}
              onUsePath={useSitePath}
            />

            {coverMode === 'path' && (
              <FormField
                id="coverImage"
                label="Site image path"
                hint="For an image kept in this site's own public folder, such as /blog/my-post.png. Images from the Media Library are the better choice."
                error={errors.coverImage?.message}
              >
                <Input
                  id="coverImage"
                  invalid={Boolean(errors.coverImage)}
                  aria-describedby="coverImage-hint coverImage-error"
                  {...register('coverImage')}
                />
              </FormField>
            )}

            {(coverMode === 'library' || (coverMode === 'path' && coverImage)) && (
              <FormField
                id="coverImageAlt"
                label="Cover image alt text"
                required
                hint={
                  coverMode === 'library'
                    ? 'Filled in from the library image. Edit it if this post needs different wording.'
                    : 'Describe what the image shows, for people who cannot see it.'
                }
                error={errors.coverImageAlt?.message}
              >
                <Input
                  id="coverImageAlt"
                  invalid={Boolean(errors.coverImageAlt)}
                  aria-required="true"
                  aria-describedby="coverImageAlt-hint coverImageAlt-error"
                  {...register('coverImageAlt')}
                />
              </FormField>
            )}

            <label className="flex min-h-11 items-start gap-3 text-body text-primary">
              <Checkbox {...register('featured')} />
              <span>
                Feature this post
                <span className="block text-label text-secondary">
                  The newest published featured post is shown large at the top of the blog.
                </span>
              </span>
            </label>
          </fieldset>

          <div>
            <Button type="submit" disabled={isSubmitting || isReadOnly} className="w-full">
              {isSubmitting ? 'Saving…' : saveLabel}
            </Button>
            {/* Always mounted so a screen reader announces "Saved." when it appears. */}
            <p role="status" className={savedMessage ? 'mt-3 text-body text-primary' : 'sr-only'}>
              {savedMessage}
            </p>
          </div>
        </aside>
      </form>
    </div>
  );
}
