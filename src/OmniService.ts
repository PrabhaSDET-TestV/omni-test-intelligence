import axios from "axios";
import fs from "fs/promises";
import path from "path";
import type { TestInfo } from "@playwright/test";
import {
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
 *
 * @param {Object} configDetails - Configuration object
 * @param {string} configDetails.baseUrl - Base URL of the Omni dashboard API
 * @param {string} configDetails.projectId - Project ID for Omni dashboard
 * @param {string} configDetails.apiKey - API Key for authentication
 */
export function configureOmniTest({
  baseUrl,
  projectId,
  apiKey,
}: {
  baseUrl: string;
  projectId: string;
  apiKey: string;
}) {
  config.BASE_URL = baseUrl;
  config.PROJECT_ID = projectId;
  config.API_KEY = apiKey;
}

const headers = () => ({
  "x-api-key": config.API_KEY,
  "Content-Type": "application/json",
  Accept: "application/json",
});

export const OmniService = {
  /**
   * Start a new test build.
   *
   * @param [environment='production'] - Environment name (e.g., 'production', 'staging')
   * @returns - The created build object
   */

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

  /**
   * Complete an existing test build.
   *
   * @param buildId - The ID of the build to complete
   * @param status - Final status of the build (e.g., 'passed', 'failed')
   * @param duration - Duration of the build in milliseconds
   * @param environment - Environment of the build (default is 'production')
   * @returns The updated build object
   */

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
    const response = await axios.patch<CompleteBuildResponse>(url, payload, {
      headers: headers(),
    });
    return response.data.build;
  },

  /**
   * Create a test case in the Omni dashboard.
   *
   * @param buildId - ID of the build to attach the test case to
   * @param testCasePayload - Structured test case data
   * @returns - The response from the API (includes screenshot upload URLs)
   */

  async createTestCase(
    buildId: string,
    testCasePayload: TestCasePayload
  ): Promise<any> {
    const url = `${config.BASE_URL}/projects/${config.PROJECT_ID}/test-cases`;
    const payload = {
      build_id: buildId,
      test_cases: [testCasePayload],
    };

    console.log(`Test case payload: `, payload);
    try {
      const response = await axios.post(url, payload, { headers: headers() });
      return response.data;
    } catch (error) {
      console.error("Error creating test case:", error);
      throw error;
    }
  },

  /**
   * Upload screenshots using the signed URLs returned by createTestCase().
   *
   * @param testCaseResponse - The response returned from createTestCase
   * @param snapshotFolderPath - Local path where screenshots are saved
   */

  async uploadScreenshotsAndUpdateDashboard(
    testCaseResponse: any,
    snapshotFolderPath: string
  ) {
    console.log(`testCaseResponse: ${testCaseResponse}`);
    console.log(`snapshotFolderPath: ${snapshotFolderPath}`);

    for (const screenshot of testCaseResponse.screenshots) {
      const imagePath = path.join(snapshotFolderPath, screenshot.name);
      const fileData = await fs.readFile(imagePath);

      await axios.put(screenshot.upload_url, fileData, {
        headers: {
          "Content-Type": "image/png",
        },
        maxBodyLength: Infinity,
      });
    }
  },

  /**
   * Creates a test case and uploads associated screenshots to the Omni dashboard.
   *
   * @param buildId - ID of the build to attach the test case to.
   * @param testCasePayload - Structured test case data including metadata, stdout, and screenshots.
   * @param snapshotFolderPath - Local folder path containing the screenshots to be uploaded.
   * @returns The response from the Omni dashboard API after creating the test case.
   */
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
        "❌ Error creating test case or uploading screenshots:",
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
