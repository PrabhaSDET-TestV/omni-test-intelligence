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

const BASE_URL = process.env.BASE_URL!;
const PROJECT_ID = process.env.PROJECT_ID!;
const API_KEY = process.env.API_KEY!;

const headers = {
  "x-api-key": API_KEY,
  "Content-Type": "application/json",
  Accept: "application/json",
};

export const BuildService = {
  async startBuild(environment = "production"): Promise<Build> {
    const url = `${BASE_URL}/projects/${PROJECT_ID}/builds?days=7&environment=${environment}`;
    const payload = {
      duration: 0,
      environment,
      status: "in_progress",
    };
    const response = await axios.post<StartBuildResponse>(url, payload, {
      headers,
    });
    return response.data.build;
  },

  async completeBuild(
    buildId: string,
    status: string,
    duration: number,
    environment = "production"
  ): Promise<Build> {
    const url = `${BASE_URL}/projects/${PROJECT_ID}/builds?build_id=${buildId}`;
    const payload = {
      progress_status: "completed",
      status,
      duration,
      environment,
    };
    const response = await axios.patch<CompleteBuildResponse>(url, payload, {
      headers,
    });
    return response.data.build;
  },
};

export const TestCaseService = {
  async createTestCase(
    buildId: string,
    testCasePayload: TestCasePayload
  ): Promise<any> {
    const url = `${BASE_URL}/projects/${PROJECT_ID}/test-cases`;
    const payload = {
      build_id: buildId,
      test_cases: [testCasePayload],
    };

    console.log(`Test case payload: `, payload);
    try {
      const response = await axios.post(url, payload, { headers });
      return response.data;
    } catch (error) {
      console.error("Error creating test case:", error);
      throw error;
    }
  },

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
    // Normalize status
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

    // Extract tags and determine priority
    const tags = testInfo.tags?.map((tag) => tag.replace(/^@/, "")) || [];
    const priorityTag = tags.find((t) => /^P[0-3]$/.test(t));
    const priority: "P0" | "P1" | "P2" | "P3" = (priorityTag as any) || "P1";
    const filteredTags = tags.filter((t) => t !== priority);

    return {
      name: testInfo.title,
      module: filteredTags.join(", ") || "",
      status: normalizedStatus,
      duration: testInfo.duration || 0,
      steps,
      stdout,
      screenshots,
      priority,
      tags: filteredTags,
      errorMessage: testInfo.error?.message || "",
      errorStack: testInfo.error?.stack || "",
    };
  },
};
