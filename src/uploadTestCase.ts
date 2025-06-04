// uploadTestCase.ts
import axios from 'axios';
import fs from 'fs/promises';
import chalk from 'chalk';

interface UploadParams {
  url: string;
  payload: any;
  headers: Record<string, string>;
}

interface Screenshot {
  name: string;
  path: string;
  metadata: Record<string, any>;
  timestamp: string;
  upload_url: string;
}

interface Trace {
  name: string;
  upload_url: string;
}

export function uploadTestCase(
  { url, payload, headers }: UploadParams,
  screenshotsPath?: { name: string; path: string }[],
  tracesPath?: { name: string; path: string }[]
) {
  return axios.post(url, payload, { headers })
    .then(response => {
      const testCase = response.data.test_cases?.[0];

      if (!testCase) {
        throw new Error('No test case data received from server');
      }

      const uploadPromises: Promise<any>[] = [];

      // Handle screenshots upload
      if (testCase.screenshots && screenshotsPath) {
        const screenshotPromises = testCase.screenshots.map((screenshot: Screenshot) => {
          const localScreenshot = screenshotsPath.find((s) => s.name === screenshot.name);
          
          if (!localScreenshot) {
            console.warn(chalk.yellow('[OmniReporter] Screenshot not found locally:', screenshot.name));
            return Promise.resolve();
          }

          return fs.readFile(localScreenshot.path)
            .then(fileData => {
              return axios.put(screenshot.upload_url, fileData, {
                headers: { 'Content-Type': 'image/png' },
                maxBodyLength: Infinity,
              });
            })
            .then(() => {
              console.log(chalk.green('[OmniReporter] Uploaded screenshot:', screenshot.name));
            })
            .catch(uploadErr => {
              console.error(chalk.red('[OmniReporter] Failed to upload screenshot:', screenshot.name), uploadErr);
              throw uploadErr;
            });
        });
        uploadPromises.push(...screenshotPromises);
      }

      // Handle traces upload
      if (testCase.traces && tracesPath) {
        const tracePromises = testCase.traces.map((trace: Trace) => {
          const localTrace = tracesPath.find((t) => t.name === trace.name);

          if (!localTrace) {
            console.warn(chalk.yellow('[OmniReporter] Trace not found locally:', trace.name));
            return Promise.resolve();
          }

          return fs.readFile(localTrace.path)
            .then(fileData => {
              return axios.put(trace.upload_url, fileData, {
                headers: { 'Content-Type': 'application/zip' },
                maxBodyLength: Infinity,
              });
            })
            .then(() => {
              console.log(chalk.green('[OmniReporter] Uploaded trace:', trace.name));
            })
            .catch(uploadErr => {
              console.error(chalk.red('[OmniReporter] Failed to upload trace:', trace.name), uploadErr);
              throw uploadErr;
            });
        });
        uploadPromises.push(...tracePromises);
      }

      return Promise.all(uploadPromises)
        .then(() => testCase)
        .catch(error => {
          console.error(chalk.red('[OmniReporter] Error uploading files:'), error);
          throw error;
        });
    })
    .catch(error => {
      console.error(chalk.red('[OmniReporter] Failed to upload test case:'), error);
      if (axios.isAxiosError(error)) {
        console.error(chalk.red('[OmniReporter] Response data:'), error.response?.data);
        console.error(chalk.red('[OmniReporter] Response status:'), error.response?.status);
        console.error(chalk.red('[OmniReporter] Response headers:'), error.response?.headers);
      }
      throw error;
    });
}
