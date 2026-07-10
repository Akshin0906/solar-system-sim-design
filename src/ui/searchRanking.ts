export type SearchableItem = {
  title: string;
  subtitle: string;
  keywords: string;
};

const normalizeSearchText = (value: string) => value.toLocaleLowerCase().trim().replace(/\s+/g, " ");
const startsAtWordBoundary = (value: string, query: string) =>
  value.split(/[^\p{L}\p{N}]+/u).some((word) => word.startsWith(query));

// Lower scores are stronger matches. Title intent always outranks incidental
// keyword matches, so an exact body name like "Titan" cannot be displaced by
// the earlier "Saturn system" command merely because Titan is in its keywords.
export const scoreSearchMatch = (item: SearchableItem, rawQuery: string): number | null => {
  const query = normalizeSearchText(rawQuery);
  if (!query) {
    return null;
  }

  const title = normalizeSearchText(item.title);
  const subtitle = normalizeSearchText(item.subtitle);
  const keywords = normalizeSearchText(item.keywords);

  if (title === query) return 0;
  if (title.startsWith(query)) return 1;
  if (startsAtWordBoundary(title, query)) return 2;
  if (title.includes(query)) return 3;
  if (subtitle === query || subtitle.startsWith(query)) return 4;
  if (startsAtWordBoundary(subtitle, query)) return 5;
  if (keywords.split(" ").includes(query)) return 6;
  if (startsAtWordBoundary(keywords, query)) return 7;
  if (`${title} ${subtitle} ${keywords}`.includes(query)) return 8;
  return null;
};

export const rankSearchItems = <T extends SearchableItem>(items: T[], query: string): T[] =>
  items
    .map((item, sourceIndex) => ({ item, sourceIndex, score: scoreSearchMatch(item, query) }))
    .filter((match): match is { item: T; sourceIndex: number; score: number } => match.score !== null)
    .sort((left, right) => left.score - right.score || left.sourceIndex - right.sourceIndex)
    .map((match) => match.item);
