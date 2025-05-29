import { test } from "@playwright/test";
import path from "path";
import type { TestInfo } from "@playwright/test";
import { OmniService } from "./OmniService";

export function setupOmniAfterEach(options: {
  buildId: string;
  snapshotPath?: string;
  getScreenshots?: () => { name: string; timestamp: string }[];
}) {
  const {
    buildId,
    snapshotPath = path.resolve(__dirname, "../__snapshots__"),
    getScreenshots = () => [
      { name: "error-step1.png", timestamp: new Date().toISOString() },
      { name: "error-step2.png", timestamp: new Date().toISOString() },
    ],
  } = options;

  test.afterEach(async ({}, testInfo: TestInfo) => {
    try {
      const payload = OmniService.createTestCasePayload({
        testInfo,
        stdout: [],
        screenshots: getScreenshots(),
        steps: [],
      });

      const response = await OmniService.createTestCaseWithScreenshots(
        buildId,
        payload,
        snapshotPath
      );
      console.log("Omni Dashboard Response:", response);
    } catch (err) {
      console.error(`Omni afterEach failed for "${testInfo.title}":`, err);
    }
  });
}
