# Task: formatDuration

Add a pure helper `formatDuration(minutes)` that formats a duration in minutes as `HH:mm`.

## Acceptance criteria

- Accepts only finite, nonnegative integers.
- Throws `RangeError` for negative, fractional, infinite and NaN values.
- `0` -> `00:00`, `65` -> `01:05`, `1500` -> `25:00` (no wrap at 24 hours).

## Constraints

- Use the project's existing test runner and source layout.
- No new dependencies.
- Small task: skip the design phase.
