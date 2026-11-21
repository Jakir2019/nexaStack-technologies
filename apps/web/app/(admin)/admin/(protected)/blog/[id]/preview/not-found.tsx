import { Button } from '@/components/ui/Button';

export default function PreviewNotFound() {
  return (
    <div>
      <h1 className="text-page font-semibold tracking-tight text-primary">Blog post not found</h1>
      <p className="mt-4 text-body-lg text-secondary">
        This preview link does not match a saved post.
      </p>
      <Button href="/admin/blog" variant="secondary" className="mt-6">
        Back to blog posts
      </Button>
    </div>
  );
}
