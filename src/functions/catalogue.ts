import manifestJson from '../../data/manifest.json';
import type { CourseDataset, CourseManifest } from '../types/course';
import type { CourseScope } from '../types/navigation';

export const manifest = manifestJson as CourseManifest;

// Literal require paths let Metro bundle the data for offline use. The selected
// file is evaluated on demand; importing every JSON eagerly would load them all.
const datasets: Record<string, () => CourseDataset> = {
  'MAIN/2520': () => require('../../data/MAIN/2520.json'),
  'MAIN/2530': () => require('../../data/MAIN/2530.json'),
  'MAIN/2540': () => require('../../data/MAIN/2540.json'),
  'MAIN/2610': () => require('../../data/MAIN/2610.json'),
  'GZ/2520': () => require('../../data/GZ/2520.json'),
  'GZ/2530': () => require('../../data/GZ/2530.json'),
  'GZ/2540': () => require('../../data/GZ/2540.json'),
  'GZ/2610': () => require('../../data/GZ/2610.json'),
};

export function termsForCampus(campus: string): string[] {
  return manifest.datasets.filter(entry => entry.campus === campus)
    .map(entry => entry.term).sort().reverse();
}

const defaultCampus = manifest.campuses.MAIN ? 'MAIN' : manifest.datasets[0].campus;
export const defaultScope: CourseScope = { campus: defaultCampus, term: termsForCampus(defaultCampus)[0] };

export function loadDataset(scope: CourseScope): CourseDataset {
  const load = datasets[`${scope.campus}/${scope.term}`];
  if (!load) throw new Error('No catalogue is available for this campus and semester.');
  return load();
}

export function scopeLabel(scope: CourseScope): string {
  return `${manifest.campuses[scope.campus] ?? scope.campus} · ${manifest.terms[scope.term] ?? scope.term}`;
}
