import type { Category, Item } from '../types';

// Mirrors the backend ordering for categories: favourites first, then the
// explicit sort_order set via drag & drop, then name. Categories without an
// explicit order (0 or undefined) sort before ordered ones, by name.
export function sortCategories(categories: Category[]): Category[] {
  return [...categories].sort((a, b) => {
    const af = a.isFavourite ? 1 : 0;
    const bf = b.isFavourite ? 1 : 0;
    if (af !== bf) return bf - af;
    const sa = a.sortOrder ?? 0;
    const sb = b.sortOrder ?? 0;
    if (sa !== sb) return sa - sb;
    return a.name.localeCompare(b.name);
  });
}

// Orders items for the order page: favourite items first, then grouped by
// their category's display order, then by name within a category.
export function sortItemsByCategoryOrder(items: Item[], categories: Category[]): Item[] {
  const rank = new Map<string, number>();
  sortCategories(categories).forEach((c, i) => rank.set(c.id, i));
  return [...items].sort((a, b) => {
    const af = a.isFavourite ? 1 : 0;
    const bf = b.isFavourite ? 1 : 0;
    if (af !== bf) return bf - af;
    const ra = rank.get(a.categoryId) ?? Number.MAX_SAFE_INTEGER;
    const rb = rank.get(b.categoryId) ?? Number.MAX_SAFE_INTEGER;
    if (ra !== rb) return ra - rb;
    return a.name.localeCompare(b.name);
  });
}
