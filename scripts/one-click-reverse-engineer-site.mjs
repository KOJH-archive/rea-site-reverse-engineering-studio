#!/usr/bin/env node

import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const endpoint = "http://127.0.0.1:9222";
const url = process.argv[2] ?? (await askForUrl());
const outputDirectory =
  process.argv[3] ?? join(root, "site-reverse-engineering");
const analysisPath = join(outputDirectory, "site-analysis.json");
const promptPath = join(outputDirectory, "development-spec.prompt.md");
const specPath = join(outputDirectory, "development-spec.md");

await mkdir(outputDirectory, { recursive: true });
const chrome = findChrome();
if (chrome === undefined) {
  console.error("Chrome 또는 Chromium을 찾지 못했습니다.");
  process.exitCode = 1;
} else {
  try {
    const profile = join(tmpdir(), "rea-site-profile");
    const browser = spawn(
      chrome,
      [
        `--remote-debugging-port=9222`,
        `--user-data-dir=${profile}`,
        "--no-first-run",
        "--no-default-browser-check",
        "--headless=new",
        "--disable-gpu",
        url,
      ],
      { detached: true, stdio: "ignore", windowsHide: true },
    );
    browser.unref();
    await waitForCdp();
    await runAnalysis(url, analysisPath);
    const analysis = await importJson(analysisPath);
    await writeFile(promptPath, buildPrompt(url, analysis), "utf8");
    let generated = false;
    try {
      generated = await generateWithConfiguredLlm(url, analysis, specPath);
    } catch (cause) {
      console.error(
        `LLM 연결에 실패해 기본 명세서로 전환합니다: ${cause instanceof Error ? cause.message : String(cause)}`,
      );
    }
    if (!generated) {
      await writeFile(specPath, buildFallbackSpec(url, analysis), "utf8");
      console.log("개발명세서용 프롬프트와 기본 명세서를 생성했습니다.");
    } else {
      console.log("LLM이 개발명세서를 생성했습니다.");
    }
    console.log(`분석 결과: ${analysisPath}`);
    console.log(`LLM 입력: ${promptPath}`);
    console.log(`개발 명세서: ${specPath}`);
  } catch (cause) {
    const detail =
      cause instanceof Error ? (cause.stack ?? cause.message) : String(cause);
    console.error(`사이트 분석을 시작하지 못했습니다:\n${detail}`);
    process.exitCode = 1;
  }
}

async function askForUrl() {
  const reader = createInterface({ input, output });
  const value = await reader.question("분석할 사이트 URL: ");
  reader.close();
  return value.trim();
}

function findChrome() {
  const candidates = [
    process.env.PROGRAMFILES &&
      join(process.env.PROGRAMFILES, "Google/Chrome/Application/chrome.exe"),
    process.env["PROGRAMFILES(X86)"] &&
      join(
        process.env["PROGRAMFILES(X86)"],
        "Google/Chrome/Application/chrome.exe",
      ),
    process.env.LOCALAPPDATA &&
      join(process.env.LOCALAPPDATA, "Google/Chrome/Application/chrome.exe"),
    process.env.PROGRAMFILES &&
      join(process.env.PROGRAMFILES, "Chromium/Application/chrome.exe"),
    process.env.PROGRAMFILES &&
      join(process.env.PROGRAMFILES, "Microsoft/Edge/Application/msedge.exe"),
    process.env["PROGRAMFILES(X86)"] &&
      join(
        process.env["PROGRAMFILES(X86)"],
        "Microsoft/Edge/Application/msedge.exe",
      ),
    process.env.LOCALAPPDATA &&
      join(process.env.LOCALAPPDATA, "Microsoft/Edge/Application/msedge.exe"),
  ].filter(Boolean);
  return candidates.find((candidate) => existsSync(candidate));
}

async function waitForCdp() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${endpoint}/json/version`);
      if (response.ok) return;
    } catch {
      // Chromium is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(
    "Chromium CDP endpoint did not become ready within 30 seconds.",
  );
}

async function runAnalysis(siteUrl, destination) {
  const child = spawn(
    process.execPath,
    [
      join(root, "scripts/rea.mjs"),
      "reverse-engineer-site",
      siteUrl,
      "--endpoint",
      endpoint,
      "--fetch-source-maps",
      "--json",
    ],
    { cwd: root, stdio: ["ignore", "pipe", "pipe"], windowsHide: true },
  );
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  const exitCode = await new Promise((resolve) => child.on("close", resolve));
  if (exitCode !== 0)
    throw new Error(
      `REA site analysis failed with exit code ${exitCode}.\n${stderr.trim()}`,
    );
  await writeFile(destination, stdout.trim() + "\n", "utf8");
}

async function importJson(path) {
  const text = await readFile(path, "utf8");
  return JSON.parse(text);
}

function buildPrompt(siteUrl, analysis) {
  analysis = compactAnalysisForLlm(analysis);
  return `# REA 역엔지니어링 결과를 개발명세서로 변환\n\n대상 사이트: ${siteUrl}\n\n당신은 시니어 제품 설계자입니다. 아래 REA Evidence를 근거로 재구현 가능한 개발명세서를 작성하세요. 관찰된 사실, 분석에서 유도된 사실, 추정, 미확인을 반드시 구분하세요. 확인되지 않은 서버 동작이나 비즈니스 규칙을 사실처럼 쓰지 마세요.\n\n문서에는 다음을 포함하세요.\n1. 제품 목적과 주요 사용자 흐름\n2. 화면·컴포넌트 구조\n3. 상태 변화와 입력 검증\n4. 클라이언트 모듈·라우트·API 후보\n5. 데이터 모델과 필요한 저장소\n6. 재구현 범위와 우선순위\n7. 확인된 Evidence와 남은 질문\n8. 비개발자가 AI 코딩 도구로 구현할 수 있는 단계별 작업 지시\n\n원본 Evidence JSON:\n\n\`\u0060\u0060json\n${JSON.stringify(analysis, null, 2)}\n\`\u0060\u0060\n`;
}

function compactAnalysisForLlm(analysis) {
  const compact = structuredClone(analysis);
  for (const evidence of [
    compact.evidence?.inspection,
    compact.evidence?.bundle,
  ]) {
    const normalized = evidence?.normalized_result;
    if (!normalized || typeof normalized !== "object") continue;
    const scripts = Array.isArray(normalized.scripts)
      ? normalized.scripts
      : normalized.scripts && typeof normalized.scripts === "object"
        ? normalized.scripts.items
        : [];
    if (Array.isArray(scripts)) {
      normalized.scripts = {
        ...(normalized.scripts && typeof normalized.scripts === "object"
          ? normalized.scripts
          : {}),
        items: scripts.map((script) => {
          if (!script || typeof script !== "object") return script;
          const { source: _source, ...metadata } = script;
          return metadata;
        }),
      };
    }
    if (normalized.dom && typeof normalized.dom === "object")
      delete normalized.dom.text;
    if (
      normalized.accessibility &&
      typeof normalized.accessibility === "object"
    )
      delete normalized.accessibility.text;
    if (evidence === compact.evidence?.inspection) {
      delete normalized.dom;
      delete normalized.accessibility;
      delete normalized.metadata;
      delete normalized.storage;
      delete normalized.console;
      delete normalized.workers;
      delete normalized.resources;
      compact.evidence.inspection.normalized_result = {
        completeness: normalized.completeness,
        scripts: normalized.scripts,
        network: normalized.network,
        limitations: normalized.limitations,
      };
    }
    for (const item of Array.isArray(
      normalized.observations?.source_maps?.items,
    )
      ? normalized.observations.source_maps.items
      : []) {
      if (item.artifact) delete item.artifact.text;
      for (const source of Array.isArray(item.original_sources)
        ? item.original_sources
        : [])
        if (source.artifact) delete source.artifact.text;
    }
  }
  return compact;
}

async function generateWithConfiguredLlm(siteUrl, analysis, destination) {
  const config = await resolveLlmConfig();
  if (config === undefined) return false;
  console.log(`LLM 연결: ${config.provider} / ${config.model}`);
  let response;
  try {
    response = await fetch(config.endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: config.model,
        temperature: 0.2,
        max_tokens: 2500,
        messages: [{ role: "user", content: buildPrompt(siteUrl, analysis) }],
      }),
    });
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    throw new Error(
      `${config.provider} 연결 실패 (${config.endpoint}, 모델 ${config.model}): ${detail}. ` +
        "Ollama/LM Studio가 실행 중인지, 해당 모델이 설치되어 있는지 확인하세요.",
    );
  }
  if (!response.ok)
    throw new Error(
      `${config.provider} 요청 실패: HTTP ${response.status} (${config.endpoint}, 모델 ${config.model}).`,
    );
  const payload = await response.json();
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || content.trim() === "")
    throw new Error("LLM response did not contain message content.");
  await writeFile(destination, content.trim() + "\n", "utf8");
  return true;
}

async function resolveLlmConfig() {
  const provider = process.env.REA_LLM_PROVIDER?.toLowerCase();
  const explicitEndpoint = process.env.REA_LLM_ENDPOINT;
  const explicitModel = process.env.REA_LLM_MODEL;
  const apiKey = process.env.REA_LLM_API_KEY;
  if (explicitEndpoint && explicitModel)
    return {
      provider: provider ?? "openai-compatible",
      endpoint: explicitEndpoint,
      model: explicitModel,
      apiKey,
    };

  if (provider === undefined || provider === "ollama" || provider === "auto") {
    const tags = await probeJson("http://127.0.0.1:11434/api/tags");
    const model = explicitModel ?? tags?.models?.[0]?.name;
    if (model)
      return {
        provider: "ollama",
        endpoint: "http://127.0.0.1:11434/v1/chat/completions",
        model,
        apiKey,
      };
  }

  if (
    provider === undefined ||
    provider === "lmstudio" ||
    provider === "auto"
  ) {
    const models = await probeJson("http://127.0.0.1:1234/v1/models");
    const model = explicitModel ?? models?.data?.[0]?.id;
    if (model)
      return {
        provider: "lm-studio",
        endpoint: "http://127.0.0.1:1234/v1/chat/completions",
        model,
        apiKey,
      };
  }

  return undefined;
}

async function probeJson(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1500) });
    if (!response.ok) return undefined;
    return await response.json();
  } catch {
    return undefined;
  }
}

function buildFallbackSpec(siteUrl, analysis) {
  const summary = analysis.summary ?? {};
  return `# 개발명세서 초안\n\n## 대상\n- ${siteUrl}\n- REA가 관찰한 대상: ${analysis.target?.title ?? "알 수 없음"}\n\n## 관찰 요약\n- 스크립트: ${summary.scripts ?? "미확인"}\n- 리소스: ${summary.resources ?? "미확인"}\n- 네트워크 요청: ${summary.network_requests ?? "미확인"}\n- 모듈 연결: ${summary.module_edges ?? "미확인"}\n- 라우트 후보: ${(summary.routes ?? []).join(", ") || "없음"}\n- 엔드포인트 후보: ${(summary.endpoints ?? []).join(", ") || "없음"}\n\n## 다음 개발 단계\n1. \u0060site-analysis.json\u0060의 Evidence를 검토한다.\n2. 화면을 주요 상태별로 나눈다.\n3. 관찰된 라우트와 입력 흐름을 작은 프로토타입으로 재현한다.\n4. 각 재현 결과를 원본 캡처와 비교한다.\n5. 서버 동작은 별도 검증 전까지 추정으로 표시한다.\n\n## 근거와 한계\n분석 세부 내용은 \u0060site-analysis.json\u0060을 참조하세요. REA의 정적 분석은 서버 내부 구현을 증명하지 않으며, 결과에 기록된 limitations와 unknowns를 함께 검토해야 합니다.\n`;
}
