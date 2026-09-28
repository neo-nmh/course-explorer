import { useEffect, useState } from 'react';
import { loadDataset } from '../functions/catalogue';
import type { CourseDataset } from '../types/course';
import type { CourseScope } from '../types/navigation';

export function useDataset({ campus, term }: CourseScope) {
  const [attempt, setAttempt] = useState(0);
  const key = `${campus}/${term}/${attempt}`;
  const [state, setState] = useState<{ key: string; data: CourseDataset | null; error: string | null }>({
    key, data: null, error: null,
  });

  useEffect(() => {
    // Let the loading state paint before evaluating a large catalogue module.
    const timer = setTimeout(() => {
      try {
        setState({ key, data: loadDataset({ campus, term }), error: null });
      } catch {
        setState({ key, data: null, error: 'Could not load this catalogue. Please try again.' });
      }
    }, 30);
    return () => clearTimeout(timer);
  }, [campus, term, key, attempt]);

  // Never show results from the old scope under the new campus/semester label.
  return {
    data: state.key === key ? state.data : null,
    error: state.key === key ? state.error : null,
    retry: () => setAttempt(value => value + 1),
  };
}
