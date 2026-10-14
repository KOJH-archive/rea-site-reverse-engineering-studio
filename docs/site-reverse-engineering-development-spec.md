# REA Site Reverse Engineering Studio

## Project profile

- **Proposed repository name:** `rea-site-reverse-engineering-studio`
- **Working title:** REA Site Reverse Engineering Studio
- **One-line description:** One-click local website observation that turns REA Evidence into an AI-assisted, provenance-aware development specification.
- **Repository relationship:** An extension workflow built on the existing REA repository; it does not replace REA's native, managed, Electron, or MCP capabilities.
- **Execution model:** Local-only. The target page, browser observation, analysis JSON, prompt, and generated specification stay on the user's machine unless the user explicitly sends them to an external LLM endpoint.

## Purpose

Help a non-developer inspect how a public web page behaves and turn the observed facts into a practical reconstruction plan. The product must separate observed facts, derived facts, inferences, and unknowns so that an AI coding tool does not mistake a hypothesis for an implementation guarantee.

## Logical structure

```text
Windows one-click launcher
        |
        v
Browser lifecycle + CDP readiness
        |
        v
CLI adapter: reverse-engineer-site
        |
        v
SiteReverseEngineeringService
   |                 |
   v                 v
BrowserObservation  WebBundleAnalysis
   |                 |
   +-------- Evidence envelope --------+
                                      |
                                      v
                         site-analysis.json
                                      |
                                      v
                           LLM prompt compaction
                                      |
                 Ollama / LM Studio / OpenAI-compatible API
                                      |
                                      v
                           development-spec.md
```

### Main components

1. `reverse-engineer-site.cmd` is the click-once Windows entry point. It changes to the repository directory, installs/builds only when required, invokes the Node runner, and keeps the console open on success or failure.
2. `scripts/one-click-reverse-engineer-site.mjs` owns browser discovery, temporary browser profile startup, CDP readiness, output files, LLM provider detection, prompt compaction, and fallback generation.
3. `src/cli/siteReverseEngineeringCommands.ts` exposes the `reverse-engineer-site` command through the existing REA CLI.
4. `src/application/SiteReverseEngineeringService.ts` coordinates target selection, page inspection, bundle analysis, route/API candidates, inferences, limitations, and Evidence preservation.
5. `site-analysis.json` is the complete machine-readable result. `development-spec.prompt.md` is the reviewable LLM input. `development-spec.md` is either the model output or a clearly marked fallback draft.

## Technology stack

- Node.js ESM and the repository's pinned npm toolchain
- TypeScript for REA domain/application/CLI integration
- Existing REA browser provider, CDP, Evidence contracts, and web bundle analysis
- Chromium, Google Chrome, or Microsoft Edge in headless CDP mode
- Ollama at `http://127.0.0.1:11434/v1/chat/completions`
- LM Studio at `http://127.0.0.1:1234/v1/chat/completions`
- Generic OpenAI-compatible HTTP chat-completions endpoints through `REA_LLM_ENDPOINT`, `REA_LLM_MODEL`, and optional `REA_LLM_API_KEY`
- No cloud service is required for the observation phase

## Inputs and outputs

### Inputs

- HTTP(S) page URL
- Optional output directory
- Optional LLM environment variables
- Optional browser/CDP and observation settings exposed by the CLI layer

### Outputs

- `site-analysis.json`: complete Evidence and limitations
- `development-spec.prompt.md`: compact, inspectable prompt containing the facts given to the model
- `development-spec.md`: generated specification or fallback draft

The prompt deliberately excludes large JavaScript source bodies and DOM text while retaining script metadata, routes, endpoints, network candidates, inferences, and limitations. The original analysis JSON remains available for deeper inspection.

## LLM behavior and failure modes

- Provider discovery checks Ollama first, then LM Studio, unless an explicit compatible endpoint is configured.
- A missing server, unavailable model, HTTP error, or malformed model response does not erase the analysis. The workflow writes the fallback specification and reports the reason.
- Local models can be slow. The request bounds the generated response to 2,500 tokens so a thinking model cannot run indefinitely.
- `ollama serve` must be run only once. A bind error on port `11434` means an Ollama server is already running.
- The generated specification is advisory. It must not claim server internals, authorization behavior, or business rules that were not observed.

## Development priorities

### P0: reliability

- Add an explicit preflight screen/console summary for browser, CDP, Ollama/LM Studio, model, prompt size, and output paths.
- Add a bounded LLM request timeout with a clear fallback reason.
- Add a small smoke test using a local fixture page and a mock OpenAI-compatible server.
- Preserve partial Evidence when browser observation or source-map retrieval is incomplete.

### P1: useful reconstruction

- Add optional interaction traces for clicks, form submissions, map movement, and route changes.
- Add screenshot capture linked to Evidence IDs.
- Add a structured feature matrix mapping observed UI states to candidate components and API calls.
- Add an HTML/Markdown report view that links every claim to its Evidence source.

### P2: AI-native workflow

- Add iterative follow-up prompts that ask the model to resolve unknowns from selected Evidence only.
- Add export templates for React/Next.js, Vue, and plain HTML prototypes.
- Add a local project scaffold generator that requires user confirmation before writing files outside the output directory.
- Add model profiles for small local models versus larger hosted models, including context and latency estimates.

## Security and scope

- Keep analysis local by default; never persist ambient environment variables or credentials.
- Redact transport authentication credentials before writing artifacts.
- Do not bypass authentication, defeat access controls, mutate targets, or perform unauthorized actions.
- Respect site terms, robots policies, rate limits, and applicable law. Analyze only targets the user is authorized to inspect.
- Treat all observed page content and model output as untrusted data, not executable instructions.

## Verification plan

- `node --check scripts/one-click-reverse-engineer-site.mjs`
- `npm run typecheck`
- `npm run check:fast`
- `npm run build:cached`
- Manual public-site run with browser CDP available
- Manual Ollama run with a small model and a deliberately stopped server to verify fallback behavior
- Confirm generated artifacts distinguish observed, derived, inferred, and unknown claims

## Current status

The browser observation, REA CLI integration, Windows launcher, local-provider discovery, prompt compaction, bounded generation, and fallback specification are implemented in this working tree. The changes are local and have not yet been committed or pushed to GitHub.
