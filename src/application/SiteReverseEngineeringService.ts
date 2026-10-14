import type { Evidence } from "../domain/evidence.js";
import { AnalysisInputError } from "../domain/analysisErrorCore.js";
import type { AnalysisError } from "../domain/analysisErrorBase.js";
import { err, ok, type Result } from "../domain/result.js";
import { browserTargetListSchema } from "../domain/browserObservationSchemas.js";
import { webBundleAnalysisSchema } from "../domain/webBundleAnalysis.js";
import type { BrowserObservationPort } from "./BrowserObservationPort.js";
import {
  analyzeWebBundle,
  inspectWebPage,
  listBrowserTargets,
} from "./BrowserObservationService.js";

export interface SiteReverseEngineeringInput {
  readonly url: string;
  readonly cdp_endpoint: string;
  readonly observation_ms: number;
  readonly fetch_source_maps: boolean;
}

export interface SiteReverseEngineeringReport {
  readonly target: {
    readonly url: string;
    readonly origin: string;
    readonly target_id: string;
    readonly title: string;
  };
  readonly summary: {
    readonly frames: number;
    readonly scripts: number;
    readonly resources: number;
    readonly network_requests: number;
    readonly chunks: number;
    readonly module_edges: number;
    readonly routes: readonly string[];
    readonly endpoints: readonly string[];
    readonly inferences: readonly string[];
    readonly source_maps: string;
  };
  readonly evidence: {
    readonly inspection: Evidence;
    readonly bundle: Evidence;
  };
  readonly limitations: readonly string[];
}

/** Run the common first pass for a user supplied website through REA's browser providers. */
export const reverseEngineerSite = async (
  browser: BrowserObservationPort | undefined,
  input: SiteReverseEngineeringInput,
): Promise<Result<SiteReverseEngineeringReport, AnalysisError>> => {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(input.url);
  } catch (cause: unknown) {
    void cause;
    return err(
      new AnalysisInputError("reverse_engineer_site", {
        userMessage: "The site URL must be a valid HTTP(S) URL.",
      }),
    );
  }
  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:")
    return err(
      new AnalysisInputError("reverse_engineer_site", {
        userMessage: "The site URL must use HTTP or HTTPS.",
      }),
    );

  const origin = parsedUrl.origin;
  const listed = await listBrowserTargets(browser, {
    cdp_endpoint: input.cdp_endpoint,
    allowed_origins: [origin],
  });
  if (!listed.ok) return listed;
  const targets = browserTargetListSchema.parse(listed.value.normalized_result);
  const target =
    targets.targets.find((candidate) => candidate.url === parsedUrl.href) ??
    targets.targets.find((candidate) => candidate.origin === origin);
  if (target === undefined)
    return err(
      new AnalysisInputError("reverse_engineer_site", {
        userMessage: `No eligible page target was found for ${origin}. Open the URL in a Chromium browser started with a loopback CDP port.`,
      }),
    );

  const inspectionInput = {
    cdp_endpoint: input.cdp_endpoint,
    allowed_origins: [origin],
    target_id: target.target_id,
    observation_ms: input.observation_ms,
    include_accessibility_text: true,
    include_console_text: false,
    include_json_body_shapes: false,
    include_websocket_shapes: false,
    include_script_sources: true as const,
    include_storage_keys: false,
    include_storage_fingerprints: false,
  };
  const inspected = await inspectWebPage(browser, inspectionInput);
  if (!inspected.ok) return inspected;

  const analyzed = await analyzeWebBundle(browser, {
    ...inspectionInput,
    fetch_source_maps: input.fetch_source_maps,
  });
  if (!analyzed.ok) return analyzed;

  const inspection = inspected.value.normalized_result;
  const bundle = webBundleAnalysisSchema.parse(
    analyzed.value.normalized_result,
  );
  const inspectionObject = inspection as {
    frames?: unknown[];
    scripts?: unknown[];
    resources?: unknown[];
    network?: { requests?: unknown[] };
    limitations?: string[];
  };
  return ok({
    target: {
      url: target.url,
      origin: target.origin,
      target_id: target.target_id,
      title: target.title,
    },
    summary: {
      frames: inspectionObject.frames?.length ?? 0,
      scripts: inspectionObject.scripts?.length ?? 0,
      resources: inspectionObject.resources?.length ?? 0,
      network_requests: inspectionObject.network?.requests?.length ?? 0,
      chunks: bundle.observations.chunks.nodes.length,
      module_edges: bundle.observations.chunks.edges.length,
      routes: bundle.observations.routes.map(({ value }) => value),
      endpoints: bundle.observations.endpoints.map(({ value }) => value),
      inferences: bundle.inferences.map(
        ({ kind, value, confidence }) => `${kind}: ${value} (${confidence})`,
      ),
      source_maps: bundle.observations.source_maps.status,
    },
    evidence: { inspection: inspected.value, bundle: analyzed.value },
    limitations: [
      ...(Array.isArray(targets.limitations) ? targets.limitations : []),
      ...(Array.isArray(inspectionObject.limitations)
        ? inspectionObject.limitations
        : []),
      ...bundle.limitations,
      "Static bundle findings describe captured scripts; they do not prove server-side behavior.",
    ],
  });
};
