# Definition of Done — VFF Development Workflow

## Every Change Must:

1. **Check if automated tests need updating**
   - Did the change modify a function that has test coverage?
   - Did it change an interface/type that tests depend on?
   - Did it add new logic that should be tested?
   - If yes → update or add tests

2. **Run automated tests**
   - `npm run test` (Vitest unit tests)
   - `npx tsc --noEmit` (type checking)
   - If anything breaks → fix before proceeding

3. **Update documentation if applicable**
   - README.md (new features, new scripts, schema changes)
   - Decision tree or planning docs (if draft logic changes)
   - Script usage comments (if ingestion/tooling changes)

4. **User tests locally**
   - Present the change, wait for local confirmation
   - Do NOT push until user says "push" or "looks good"

5. **Push only on approval**
   - Commit with descriptive message
   - Push to main

## What Does NOT Require Tests:
- Pure UI/styling changes (Tailwind classes, layout tweaks)
- Copy/text changes
- Adding a new prop that passes through without transformation

## What DOES Require Tests:
- New utility functions (lib/)
- Changes to scoring/simulation logic
- API route changes
- Data transformation logic
- Name matching / normalization changes
