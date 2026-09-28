# Course Explorer

Offline course browsing, search, and prerequisite/corequisite diagrams. Built with Expo 57, React Native, and TypeScript. Tested on iOS.

## Setup

```sh
npx expo start
```

Open the app in Expo Go.

## Architecture

```text
App.tsx          Navigation and app providers
src/screens/     Browse and course detail screens
src/components/  Shared UI, settings, and requirement diagrams
src/hooks/       Dataset loading, error, and retry state
src/functions/   Catalogue access, search, and diagram logic
src/types/       Course data and navigation types
```

Bundled JSON → `catalogue.ts` → `useDataset` → screens. Catalogues load by campus and semester.

Search matches course codes and titles, tolerates word typos, and ranks exact code matches first.

## Data

`scripts/preprocess_courses.py` converts `courses.json` into `data/generated/`. It pre-expands requirements within each campus/semester, marks cycles and missing courses, and preserves ambiguous text. `manifest.json` lists datasets; `report.json` records processing issues.

When adding a campus or semester, update the dataset paths in [`src/functions/catalogue.ts`](src/functions/catalogue.ts).

## Commands

```sh
npm run data:build # Regenerate datasets
npm run data:check # Check generated files against the source
npm run test:data  # Parser and data tests
npm run test:ui    # Search and diagram logic tests
npm run lint
npm run typecheck
```
