import type { Course } from '../types/course';

export function normalizeSearch(value: string): string {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function sortCourses(courses: Course[]): Course[] {
  return [...courses].sort((a, b) => a.prefix.localeCompare(b.prefix)
    || a.number.localeCompare(b.number, undefined, { numeric: true }));
}

export function createSearchIndex(courses: Course[]) {
  return sortCourses(courses).map(course => {
    const code = normalizeSearch(`${course.prefix}${course.number}`).replace(/ /g, '');
    const title = normalizeSearch(course.title);
    return { course, code, title, words: normalizeSearch(`${course.prefix} ${course.number} ${course.title}`).split(' ') };
  });
}

// Bounded edit distance, including adjacent transpositions ("cmop" -> "comp").
function isCloseWord(query: string, word: string): boolean {
  if (query.length < 4 || /\d/.test(query)) return false;
  const limit = query.length >= 8 ? 2 : 1;
  if (Math.abs(query.length - word.length) > limit) return false;
  let previous = Array.from({ length: word.length + 1 }, (_, index) => index);
  let beforePrevious = previous;
  for (let i = 1; i <= query.length; i++) {
    const current = [i];
    for (let j = 1; j <= word.length; j++) {
      current[j] = Math.min(current[j - 1] + 1, previous[j] + 1,
        previous[j - 1] + (query[i - 1] === word[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && query[i - 1] === word[j - 2] && query[i - 2] === word[j - 1]) {
        current[j] = Math.min(current[j], beforePrevious[j - 2] + 1);
      }
    }
    if (Math.min(...current) > limit) return false;
    beforePrevious = previous;
    previous = current;
  }
  return previous[word.length] <= limit;
}

export function searchCourses(index: ReturnType<typeof createSearchIndex>, query: string): Course[] {
  const normalized = normalizeSearch(query);
  if (!normalized) return index.map(entry => entry.course);
  const compact = normalized.replace(/ /g, '');
  const tokens = normalized.split(' ');
  return index.map(entry => {
    let score = Infinity;
    if (entry.code === compact) score = 0;
    else if (entry.code.startsWith(compact)) score = 1;
    else if (entry.code.includes(compact) || entry.title.includes(normalized)) score = 2;
    else if (tokens.every(token => entry.words.some(word => word.includes(token)))) score = 3;
    else if (tokens.every(token => entry.words.some(word => word.includes(token) || isCloseWord(token, word)))) score = 4;
    return { course: entry.course, score };
  }).filter(entry => Number.isFinite(entry.score)).sort((a, b) => a.score - b.score)
    .map(entry => entry.course);
}
