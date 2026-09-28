## Setup

```sh
npx expo start
```

Open the app in Expo Go / IOS emulator.

## Architecture

```text
App.tsx          Navigation and app providers
src/screens/     Browse and course detail screens
src/components/  Shared UI, settings, and requirement diagrams
src/hooks/       Dataset loading, error, and retry state
src/functions/   Catalogue access, search, and diagram logic
src/types/       Course data and navigation types
```

Bundled JSON → `catalogue.ts` → `useDataset` → screens.

Search matches course codes and titles, tolerates word typos, and ranks exact code matches first.

## Data

Course data is split into seperate files for each campus/semester. For example, 'GZ Campus 25/26 Winter' has it's own JSON file. The Python script `scripts/preprocess_courses.py` splits the data into campus/semester and stores in `data/`. It fully expands course requirements for each course, marks cycles and missing courses, and preserves ambiguous text. `manifest.json` lists the datasets generated; `report.json` records processing issues.


## Commands

```sh
npm run data:build # Regenerate datasets
npm run data:check # Check generated files against the source
npm run test:data  # Parser and data tests
npm run test:ui    # Search and diagram logic tests
```
