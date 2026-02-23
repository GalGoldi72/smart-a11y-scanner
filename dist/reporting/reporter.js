/**
 * Reporter — orchestrates report generation across formats.
 * Consumes ScanResult from Naomi's engine, outputs to requested format(s).
 */
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { generateJsonReport } from './formats/json-reporter.js';
import { generateHtmlReport } from './formats/html-reporter.js';
import { generateCsvReport } from './formats/csv-reporter.js';
export class Reporter {
    verbose;
    constructor(options) {
        this.verbose = options?.verbose ?? false;
    }
    async generate(result, config) {
        const outputDir = resolve(config.outputDir);
        if (!existsSync(outputDir)) {
            mkdirSync(outputDir, { recursive: true });
        }
        const artifacts = [];
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        for (const format of config.formats) {
            switch (format) {
                case 'html':
                    artifacts.push(this.writeReport(generateHtmlReport(result), join(outputDir, `a11y-report-${timestamp}.html`), 'html'));
                    break;
                case 'json':
                    artifacts.push(this.writeReport(generateJsonReport(result, { pretty: this.verbose }), join(outputDir, `a11y-report-${timestamp}.json`), 'json'));
                    break;
                case 'csv':
                    artifacts.push(this.writeReport(generateCsvReport(result), join(outputDir, `a11y-report-${timestamp}.csv`), 'csv'));
                    break;
            }
        }
        return artifacts;
    }
    writeReport(content, filePath, format) {
        writeFileSync(filePath, content, 'utf-8');
        return {
            format,
            filePath,
            sizeBytes: Buffer.byteLength(content, 'utf-8'),
        };
    }
}
//# sourceMappingURL=reporter.js.map