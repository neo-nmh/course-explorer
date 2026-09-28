## Setup
- 

## Data Processing

- [`scripts/preprocess_courses.py`](scripts/preprocess_courses.py) uses Python to read `courses.json`, keep the selected fields, assign unique IDs, and split courses by campus and semester into `data/generated/`.
- Prerequisite and corequisite expressions become fully expanded trees, including AND/OR relationships and conditions, so the app does not need to parse or expand them at runtime.
- References resolve within the same campus and semester. Cycles and missing courses are marked, and expressions the parser cannot interpret retain their text.

```sh
npm run data:build # Generate JSON files
npm run test:data  # Test parsing and tree expansion
npm run data:check # Verify generated files match the source
```

## Platforms Tested
- IOS

## Architecture

## Search
- 
