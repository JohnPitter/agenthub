/**
 * Converts text to a URL-friendly slug
 * @param text - Text to slugify
 * @param maxLength - Maximum length of the slug (default: 50)
 * @returns Slugified string
 */
export function slugify(text: string, maxLength = 50): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, maxLength)
    .replace(/^-+|-+$/g, "");
}
