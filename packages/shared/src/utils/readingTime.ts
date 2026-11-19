/** Estimate reading time from the visible text in rendered article HTML. */
export function computeReadingTime(contentHtml: string, wordsPerMinute = 225): number {
  const words = contentHtml.replace(/<[^>]+>/g, ' ').trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / wordsPerMinute));
}
