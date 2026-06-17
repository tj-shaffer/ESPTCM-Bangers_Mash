# forge-app/ (historical wrapper)

This directory is a leftover from when TestForge was an Atlassian Forge app. **It is no longer a Forge app.** Today it only hosts the standalone Vite + React SPA at [static/frontend/](static/frontend/), which talks to the Express/Prisma API over HTTP.

See [../STATUS.md](../STATUS.md) for the current architecture and [../DECISIONS.md](../DECISIONS.md) ADR-009 for why the Forge layer was removed. The directory is kept (rather than renamed to `web/`) only to avoid churning the Vercel build paths; renaming is a tracked cleanup item.
