# REA Site Reverse Engineering Studio

This directory is the product-owned extension area in the REA-based repository.

The current implementation intentionally keeps REA's browser provider and
Evidence contracts in their original locations so the runtime remains
compatible. Product-owned files are:

- `scripts/one-click-reverse-engineer-site.mjs`
- `reverse-engineer-site.cmd`
- `src/application/SiteReverseEngineeringService.ts`
- `src/cli/siteReverseEngineeringCommands.ts`
- `docs/site-reverse-engineering-development-spec.md`

The rest of the repository is upstream REA infrastructure. A future extraction
can replace those internal imports with a published REA adapter without
changing this product contract.
