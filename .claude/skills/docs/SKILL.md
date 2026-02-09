---
name: docs
description: Browse and search project documentation. Lists all docs in docs/ with titles and descriptions parsed from YAML frontmatter.
---

# Project Documentation

Browse the project's documentation library.

## Commands

```bash
# List all docs with titles (compact view)
just docs-list

# List all docs with descriptions
just docs-detail

# Search for a specific doc by name or title
just docs-detail <search-term>
```

## Documentation Structure

| Directory | Contents |
|-----------|----------|
| `docs/` | Foundational documentation (architecture, API refs, design specs) |
| `docs/decisions/` | Architecture Decision Records (ADR-NNN-*.md) |
| `docs/design/` | Design references and visual assets |
| `docs/features/` | Feature specifications |
| `claude_plans/` | Historical planning docs, proposals, research reports |

## Document Format

Every doc in `docs/` uses YAML frontmatter:

```markdown
---
description: One-line summary of what this document covers.
---

# Document Title

Content...
```

## When to Update Docs

- **New feature**: Check if existing docs need updating; create new doc if the feature is significant
- **Architecture change**: Update relevant docs and consider a new ADR
- **Bug fix**: Update `docs/TROUBLESHOOTING.md` if the issue may recur
- **Infrastructure change**: Update `docs/infrastructure.md` or `docs/deployment.md`
