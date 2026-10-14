import { Cli, z } from "incur";

import { browserCliError, browserContext } from "../cliBrowserContext.js";
import { reverseEngineerSite } from "../application/SiteReverseEngineeringService.js";
import { logCliCommand } from "../cliLogging.js";
import { CLI_COMMANDS } from "../cliCommandNames.js";
import type { Logger } from "pino";

/** Register the opinionated website reverse-engineering first pass. */
export const registerSiteReverseEngineeringCommands = (
  cli: ReturnType<typeof Cli.create>,
  logger: Logger,
): void => {
  cli.command(CLI_COMMANDS.reverseEngineerSite, {
    description:
      "Inspect one website through CDP and produce a first-pass reverse-engineering report",
    args: z.object({
      url: z.string().describe("HTTP(S) page URL already open in Chromium"),
    }),
    options: z.object({
      endpoint: z
        .string()
        .default("http://127.0.0.1:9222")
        .describe("Loopback CDP endpoint of the user-owned browser"),
      observationMs: z
        .number()
        .int()
        .min(0)
        .default(1000)
        .describe("Observation window in milliseconds"),
      fetchSourceMaps: z
        .boolean()
        .default(false)
        .describe("Fetch source maps referenced by captured scripts"),
    }),
    run: ({ args, options }) =>
      logCliCommand(logger, CLI_COMMANDS.reverseEngineerSite, async () => {
        const result = await reverseEngineerSite(browserContext().provider, {
          url: args.url,
          cdp_endpoint: options.endpoint,
          observation_ms: options.observationMs,
          fetch_source_maps: options.fetchSourceMaps,
        });
        return result.ok ? result.value : browserCliError(result.error);
      }),
  });
};
