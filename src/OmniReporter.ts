import type {
  Reporter,
  FullConfig,
  Suite,
  TestCase,
  TestResult,
  FullResult,
} from '@playwright/test/reporter';
import axios from 'axios';
import { uploadTestCase } from './uploadTestCase';
import chalk from 'chalk';

class MyReporter implements Reporter {
  private buildId: string = '';
  private testPromises: Promise<any>[] = [];

  constructor(options: { customOption?: string } = {}) {
    console.log(chalk.cyan('[OmniReporter] Setup with customOption:', options.customOption));
  }

  onBegin(config: FullConfig, suite: Suite) {
    const BASE_URL = 'https://omni-dashboard-inky.vercel.app/api/v1';
    const PROJECT_ID = process.env.PROJECT_ID;
    const API_KEY = process.env.API_KEY;
    const environment = 'production';

    if (!PROJECT_ID || !API_KEY) {
      console.error(chalk.red('[OmniReporter] Error: PROJECT_ID and API_KEY environment variables are required'));
      return;
    }

    const url = `${BASE_URL}/projects/${PROJECT_ID}/builds?days=7&environment=${environment}`;

    const payload = {
      duration: 0,
      environment,
      status: 'in_progress',
    };

    return axios.post(url, payload, {
      headers: {
        'x-api-key': API_KEY,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
    })
    .then(response => {
      this.buildId = response.data.build.build_id;
      console.log(chalk.green('[OmniReporter] Build Started:', this.buildId));
    })
    .catch(error => {
      console.error(chalk.red('[OmniReporter] Failed to start build:', error?.response?.data || error.message));
      if (error?.response?.status === 401) {
        console.error(chalk.red('[OmniReporter] Authentication failed. Please check your API_KEY'));
      }
      throw error;
    });
  }

  onTestBegin(test: TestCase) {
    console.log(chalk.cyan('[OmniReporter] Starting test:', test.title));
  }

  onTestEnd(test: TestCase, result: TestResult) {
    const title = test.title;
    const duration = result.duration;
    const status = result.status;
    const errorMessage = result.error?.message || '';
    const errorStack = result.error?.stack || '';

    const tags: string[] = test.tags?.map((tag: string) => tag.replace(/^@/, '')) || [];
    const priorityTag: string | undefined = tags.find((t: string) => /^P[0-3]$/.test(t));
    const priority: 'P0' | 'P1' | 'P2' | 'P3' = (priorityTag as any) || 'P1';
    const filteredTags: string[] = tags.filter((t: string) => t !== priority);

    const defaultLog = {
      timestamp: new Date().toISOString(),
      level: status === 'passed' ? 'INFO' : 'ERROR',
      message: `${title} ${status}`,
    };
    const stdout = [defaultLog];

    const steps = result.steps.map((step, index) => ({
      name: step.title,
      sequence_number: index + 1,
      duration: step.duration,
      status: 'passed',
    }));

    const screenshots = result.attachments
      .filter((att) => att.contentType === 'image/png' && att.path)
      .map((att) => ({
        name: att.name!,
      }));

    const screenshotMeta = screenshots.map((s) => ({
      name: s.name,
      timestamp: new Date().toISOString(),
    }));

    const screenshotsPath = result.attachments
      .filter((att) => att.contentType === 'image/png' && att.path)
      .map((att) => ({
        name: att.name!,
        path: att.path!,
      }));

    const tracesPath = result.attachments
      .filter((att) => att.name === 'trace' && att.contentType === 'application/zip' && att.path)
      .map((att) => ({
        name: 'trace.zip',
        path: att.path!,
      }));

    const testCasePayload = {
      name: title,
      module: filteredTags.join(', ') || 'General',
      priority: priority || 'P1',
      tags: filteredTags.length > 0 ? filteredTags : ['general'],
      status: status === 'passed' || status === 'skipped' ? status : 'failed',
      duration,
      steps,
      stdout,
      screenshots: screenshotMeta,
      traces: [{"name": "trace.zip"}],
      error_message: errorMessage,
      error_stack_trace: errorStack,
    };

    const url = `https://omni-dashboard-inky.vercel.app/api/v1/projects/${process.env.PROJECT_ID}/test-cases`;
    const payload = {
      build_id: this.buildId,
      test_cases: [testCasePayload],
    };

    if (!process.env.API_KEY) {
      console.error(chalk.red('[OmniReporter] Error: API_KEY is required'));
      return;
    }

    const headers = {
      'x-api-key': process.env.API_KEY,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };

    console.log(chalk.cyan('[OmniReporter] Uploading test case:', title));

    const testPromise = uploadTestCase({ url, payload, headers }, screenshotsPath, tracesPath)
      .then(testCase => {
        console.log(chalk.green('[OmniReporter] Test case uploaded:', title));
        return testCase;
      })
      .catch(error => {
        console.error(chalk.red('[OmniReporter] Failed to upload test case:', title), error?.response?.data || error.message);
        throw error;
      });

    this.testPromises.push(testPromise);
    return testPromise;
  }

  async onEnd(result: FullResult) {
    try {
      await Promise.all(this.testPromises);

      const BASE_URL = 'https://omni-dashboard-inky.vercel.app/api/v1';
      const PROJECT_ID = process.env.PROJECT_ID;
      const API_KEY = process.env.API_KEY;
      const environment = 'production';
      const duration = 800;

      if (!PROJECT_ID || !API_KEY) {
        console.error(chalk.red('[OmniReporter] Error: PROJECT_ID and API_KEY environment variables are required'));
        return;
      }

      if (!this.buildId) {
        console.error(chalk.red('[OmniReporter] Error: No build ID available to complete the build'));
        return;
      }

      const url = `${BASE_URL}/projects/${PROJECT_ID}/builds?build_id=${this.buildId}`;

      const payload = {
        progress_status: 'completed',
        status: result.status,
        duration,
        environment,
      };

      const response = await axios.patch(url, payload, {
        headers: {
          'x-api-key': API_KEY,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
      });

      console.log(chalk.green('[OmniReporter] Build Completed:', response.data.build.build_id));
    } catch (error: any) {
      console.error(chalk.red('[OmniReporter] Failed to complete build:', error?.response?.data || error.message));
      if (error?.response?.status === 401) {
        console.error(chalk.red('[OmniReporter] Authentication failed. Please check your API_KEY'));
      }
    }
  }
}

export default MyReporter;
