# Upstream boundary

This repository is based on REA and retains the upstream source tree because
the current product extension uses REA's browser observation provider and
Evidence contracts directly.

## Product-owned surface

The site reverse-engineering product is intentionally limited to the following
files and documents:

- `scripts/one-click-reverse-engineer-site.mjs`
- `reverse-engineer-site.cmd`
- `src/application/SiteReverseEngineeringService.ts`
- `src/cli/siteReverseEngineeringCommands.ts`
- `docs/site-reverse-engineering-development-spec.md`
- `apps/site-reverse-engineering-studio/README.md`

## Upstream surface

The remaining REA files provide the browser/CDP adapters, Evidence schemas,
CLI runtime, and build system. They should be synchronized from the upstream
REA remote rather than treated as product features.

This boundary keeps the current executable workflow intact while making the
product-owned code discoverable. A later standalone extraction should replace
direct internal imports with a stable REA adapter package and can then move the
product surface into its own repository without copying the full REA tree.
