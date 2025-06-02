import type {
  Reporter,
  FullConfig,
  Suite,
  TestCase,
  TestResult,
  FullResult,
} from '@playwright/test/reporter';
import { configureOmniTest, OmniService } from './OmniService';

class OmniReporter implements Reporter {
  private buildId: string = '';

  constructor(options: { customOption?: string } = {}) {
    console.log(`[OmniReporter] Initialized with options:`, options);
  }

  async onBegin(config: FullConfig, suite: Suite) {
    const projectId = process.env.PROJECT_ID;
    const apiKey = process.env.API_KEY;

    if (!projectId || !apiKey) {
      throw new Error(
        '[OmniReporter] Missing required environment variables: PROJECT_ID and/or API_KEY'
      );
    }

    configureOmniTest({ projectId, apiKey });

    try {
      const build = await OmniService.startBuild();
      this.buildId = build.build_id;
      console.log(`[OmniReporter] Omni Build Started: ${this.buildId}`);
    } catch (err) {
      console.error('[OmniReporter] Failed to start Omni build:', err);
    }
  }

  onTestBegin(test: TestCase) {
    console.log(`[OmniReporter] Test started: ${test.title}`);
  }

  onTestEnd(test: TestCase, result: TestResult) {
    console.log(`[OmniReporter] Test ended: ${test.title} - ${result.status}`);
  }

  async onEnd(result: FullResult) {
    const environment = 'production';

    if (!this.buildId) {
      console.warn('[OmniReporter] Skipping completeBuild – no build ID available.');
      return;
    }

    try {
      const completed = await OmniService.completeBuild(
        this.buildId,
        result.status,
        result.duration,
        environment
      );
      console.log(`[OmniReporter] Omni Build Completed: ${completed.build_id}`);
    } catch (err) {
      console.error('[OmniReporter] Failed to complete Omni build:', err);
    }
  }
}

export default OmniReporter;
