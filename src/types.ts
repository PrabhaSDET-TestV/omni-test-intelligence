// === Build Types ===
export interface Build {
  build_id: string;
  project_id: string;
  environment: string;
  status: string;
  duration: number;
  [key: string]: any;
}

export interface StartBuildResponse {
  build: Build;
}

export interface CompleteBuildResponse {
  build: Build;
}

// === Test Case Types ===
export interface StdoutLog {
  timestamp: string;
  level: string;
  message: string;
}

export interface Step {
  name: string;
  status: string;
  duration: number;
  sequence_number: number;
  error_message?: string;
  stack_trace?: string;
}

export interface ScreenshotMeta {
  name: string;
  timestamp: string;
}

export interface TestCasePayload {
  name: string;
  module: string;
  status: 'passed' | 'failed' | 'skipped';
  duration: number;
  steps: Step[];
  stdout: StdoutLog[];
  screenshots?: ScreenshotMeta[];
  errorMessage?: string;
  errorStack?: string;
  priority?: 'P0' | 'P1' | 'P2' | 'P3';
  tags?: string[];
}
