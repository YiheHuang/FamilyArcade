/** Short, readable initials for player chips and card-owned badges. */
export function initial(name: string): string {
  const text = name.trim();
  if (/^P\d+$/i.test(text)) return text.slice(-1);
  if (/^AI\s*\d+$/i.test(text)) return `A${text.replace(/\D/g, '')}`;
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length > 1) {
    return words
      .slice(0, 2)
      .map((word) => word.charAt(0).toUpperCase())
      .join('');
  }
  return text.charAt(0).toUpperCase() || '?';
}
