# Future league features

Add isolated feature modules here as requirements become available:

- `results`: tournament result import workflows and validation.
- `standings`: player standings consuming the existing pure `src/scoring` module.
- `seasons`: season management and seasonal championships.
- `championships`: annual championship qualification and results.

Keep feature-specific components, types, and services together. Pages compose features; shared UI belongs in `src/components`. Keep scoring logic in `src/scoring`, separate from UI and persistence. Follow `AGENTS.md` for established policy and unresolved championship decisions.
