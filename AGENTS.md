## Dependencies

- Prefer established, actively maintained libraries over custom implementations
  for standard formats and protocols such as CSV, dates, validation, cryptography,
  authentication, and file parsing.
- Before adding a dependency, check whether the repository already contains a
  suitable library.
- Do not implement a custom parser unless the existing libraries cannot satisfy
  the requirements.
- When adding a new dependency, explain why it was selected and verify its
  maintenance status, license, security history, and compatibility.

## Code generation

- When creating new functionallity, if it applies, then show me manual testing steps
  in addition of the automated tests.
- Split long stages into smaller steps grouped by functionallity to make them more
  manegable

## Code quality

- Use simple, short code when possible.
- Focus on re-usability when it makes sense.
- Keep functions small, for easier reviewing and testing
- Document functions parameters and responses using jsdoc, javadoc, or the default for each language.

## Pre-Commit tasks

- After new code changes are done, run a code review on the new code and surroundings, and fix new issues.
- Ensure that you don't loop forever on new code -> code reviews -> fix problems -> code reviews -> fix problems.
