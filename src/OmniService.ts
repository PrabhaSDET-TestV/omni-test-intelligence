import axios from "axios";
import fs from "fs/promises";
import path from "path";
import { test } from "@playwright/test";
import type { TestInfo } from "@playwright/test";
import type {
  Build,
  StartBuildResponse,
  CompleteBuildResponse,
  TestCasePayload,
  StdoutLog,
  Step,
  ScreenshotMeta,
} from "./types";

// Config store
let config = {
  BASE_URL: "",
  PROJECT_ID: "",
  API_KEY: "",
};

/**
 * Configure Omni Test API integration.
 * Should be called once during test setup to set API details.
 */
export function configureOmniTest({
  projectId,
  apiKey,
}: {
  projectId: string;
  apiKey: string;
}) {
  config.BASE_URL = "https://omni-dashboard-inky.vercel.app/api/v1"; // hardcoded
  config.PROJECT_ID = projectId;
  config.API_KEY = apiKey;
}

const headers = () => ({
  "x-api-key": config.API_KEY,
  "Content-Type": "application/json",
  Accept: "application/json",
});

export const OmniService = {
  async startBuild(environment = "production"): Promise<Build> {
    const url = `${config.BASE_URL}/projects/${config.PROJECT_ID}/builds?days=7&environment=${environment}`;
    const payload = {
      duration: 0,
      environment,
      status: "in_progress",
    };
    const response = await axios.post<StartBuildResponse>(url, payload, {
      headers: headers(),
    });
    return response.data.build;
  },

  async completeBuild(
    buildId: string,
    status: string,
    duration: number,
    environment = "production"
  ): Promise<Build> {
    const url = `${config.BASE_URL}/projects/${config.PROJECT_ID}/builds?build_id=${buildId}`;
    const payload = {
      progress_status: "completed",
      status,
      duration,
      environment,
    };
    console.log(url, payload);
    const response = await axios.patch<CompleteBuildResponse>(url, payload, {
      headers: headers(),
    });
    return response.data.build;
  },

  async createTestCaseWithScreenshots(
    buildId: string,
    testCasePayload: TestCasePayload,
    snapshotFolderPath: string
  ): Promise<any> {
    const url = `${config.BASE_URL}/projects/${config.PROJECT_ID}/test-cases`;
    const payload = {
      build_id: buildId,
      test_cases: [testCasePayload],
    };

    console.log(`Test case payload: `, payload);
    try {
      const response = await axios.post(url, payload, { headers: headers() });
      const testCase = response.data.test_cases?.[0];

      if (testCase?.screenshots?.length) {
        for (const screenshot of testCase.screenshots) {
          const imagePath = path.join(snapshotFolderPath, screenshot.name);
          const fileData = await fs.readFile(imagePath);

          await axios.put(screenshot.upload_url, fileData, {
            headers: {
              "Content-Type": "image/png",
            },
            maxBodyLength: Infinity,
          });
        }
      }

      return response.data;
    } catch (error) {
      console.error(
        "Error creating test case or uploading screenshots:",
        error
      );
      throw error;
    }
  },

  createTestCasePayload({
    testInfo,
    stdout,
    screenshots,
    steps,
  }: {
    testInfo: TestInfo;
    stdout: StdoutLog[];
    screenshots: ScreenshotMeta[];
    steps: Step[];
  }): TestCasePayload {
    let normalizedStatus: "passed" | "failed" | "skipped";
    switch (testInfo.status) {
      case "passed":
      case "skipped":
        normalizedStatus = testInfo.status;
        break;
      case "failed":
      case "timedOut":
      case "interrupted":
      default:
        normalizedStatus = "failed";
        break;
    }

    const tags: string[] =
      testInfo.tags?.map((tag: string) => tag.replace(/^@/, "")) || [];
    const priorityTag: string | undefined = tags.find((t: string) =>
      /^P[0-3]$/.test(t)
    );
    const priority: "P0" | "P1" | "P2" | "P3" = (priorityTag as any) || "P1";
    const filteredTags: string[] = tags.filter((t: string) => t !== priority);

    const testStatus = testInfo.status || "unknown";
    const defaultLog: StdoutLog = {
      timestamp: new Date().toISOString(),
      level: testStatus === "passed" ? "INFO" : "ERROR",
      message: `${testInfo.title} ${testStatus}`,
    };
    const fullStdout = [defaultLog, ...stdout];

    return {
      name: testInfo.title,
      module: filteredTags.join(", ") || "",
      status: normalizedStatus,
      duration: testInfo.duration || 0,
      steps,
      stdout: fullStdout,
      screenshots,
      priority,
      tags: filteredTags,
      errorMessage: testInfo.error?.message || "",
      errorStack: testInfo.error?.stack || "",
    };
  },
};

/**
 * Sets up the `afterEach` hook to upload test case data and screenshots to Omni.
 */
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
