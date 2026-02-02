---
name: neon-postgres
description: Guides for working with Neon Serverless Postgres. Covers getting started, connection methods, features (branching, scale-to-zero), Neon CLI, and developer tools. Use standard PostgreSQL drivers (pg) — no Neon-specific SDKs.
---

# Neon Serverless Postgres

Neon is a serverless Postgres platform. We use it as a standard PostgreSQL database — connect with `pg` or any Postgres driver. No Neon-specific SDKs to avoid vendor lock-in.

## Neon Documentation

```bash
# Get list of all Neon docs
curl https://neon.com/llms.txt

# Fetch any doc page as markdown
curl -H "Accept: text/markdown" https://neon.com/docs/<path>
```

Don't guess docs pages. Use the `llms.txt` index to find the relevant URL or follow the links in the resources below.

## Resources

| Area               | Resource                           | When to Use                                                    |
| ------------------ | ---------------------------------- | -------------------------------------------------------------- |
| What is Neon       | `references/what-is-neon.md`       | Understanding Neon concepts, architecture, core resources      |
| Referencing Docs   | `references/referencing-docs.md`   | Looking up official documentation, verifying information       |
| Features           | `references/features.md`           | Branching, autoscaling, scale-to-zero, instant restore         |
| Getting Started    | `references/getting-started.md`    | Setting up a project, connection strings, schema               |
| Connection Methods | `references/connection-methods.md` | Choosing drivers based on platform and runtime                 |
| Developer Tools    | `references/devtools.md`           | VSCode extension, MCP server, Neon CLI                         |
| Neon CLI           | `references/neon-cli.md`           | Terminal workflows, scripts, CI/CD pipelines                   |
