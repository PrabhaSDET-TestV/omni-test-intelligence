import { test } from "@playwright/test";
import type { TestInfo } from "@playwright/test";
import type { StdoutLog, Step } from "./types";
import { OmniService } from "./OmniService";

export function setupOmniAfterEach(options: {
  buildId: string;
  snapshotPath: string;
  screenshotNames: string[];
  stdoutLogs?: StdoutLog[];
  steps?: Step[];
}) {
  const {
    buildId,
    snapshotPath,
    screenshotNames,
    stdoutLogs = [],
    steps = [],
  } = options;

  test.afterEach(async ({}, testInfo: TestInfo) => {
    try {
      const screenshots = screenshotNames.map((name) => ({
        name,
        timestamp: new Date().toISOString(),
      }));

      const payload = OmniService.createTestCasePayload({
        testInfo,
        stdout: stdoutLogs,
        screenshots,
        steps,
      });

      const response = await OmniService.createTestCaseWithScreenshots(
        buildId,
        payload,
        snapshotPath
      );

      console.log(`[Omni] Uploaded test case: "${testInfo.title}"`);
    } catch (err) {
      console.error(
        `[Omni] Failed to upload test case: "${testInfo.title}"`,
        err
      );
    }
  });
}
