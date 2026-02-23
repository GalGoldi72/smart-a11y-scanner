/**
 * Config loader — reads YAML config files and merges with CLI args and defaults.
 *
 * Priority: CLI flags > YAML file > defaults (from defaults.ts).
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { DEFAULT_CONFIG } from './defaults.js';
export class ConfigValidationError extends Error {
    errors;
    constructor(errors) {
        super(`Config validation failed:\n  ${errors.join('\n  ')}`);
        this.errors = errors;
        this.name = 'ConfigValidationError';
    }
}
/** Load and parse a YAML config file, returning a partial ScanConfig */
function loadYamlFile(configPath) {
    const absPath = resolve(configPath);
    if (!existsSync(absPath)) {
        throw new Error(`Config file not found: ${absPath}`);
    }
    const raw = readFileSync(absPath, 'utf-8');
    const parsed = parseYaml(raw);
    if (!parsed || typeof parsed !== 'object')
        return {};
    const config = {};
    if (typeof parsed['url'] === 'string')
        config.targetUrl = parsed['url'];
    if (typeof parsed['targetUrl'] === 'string')
        config.targetUrl = parsed['targetUrl'];
    if (typeof parsed['depth'] === 'number')
        config.crawlDepth = parsed['depth'];
    if (typeof parsed['crawlDepth'] === 'number')
        config.crawlDepth = parsed['crawlDepth'];
    if (typeof parsed['maxPages'] === 'number')
        config.maxPages = parsed['maxPages'];
    if (typeof parsed['pageTimeout'] === 'number')
        config.pageTimeout = parsed['pageTimeout'];
    if (typeof parsed['minSeverity'] === 'string')
        config.minSeverity = parsed['minSeverity'];
    if (typeof parsed['wcagLevel'] === 'string')
        config.wcagLevel = parsed['wcagLevel'];
    if (typeof parsed['respectRobotsTxt'] === 'boolean')
        config.respectRobotsTxt = parsed['respectRobotsTxt'];
    if (typeof parsed['fileBugs'] === 'boolean')
        config.fileBugs = parsed['fileBugs'];
    if (Array.isArray(parsed['crawlExclusions']))
        config.crawlExclusions = parsed['crawlExclusions'];
    // Report config
    if (parsed['report'] && typeof parsed['report'] === 'object') {
        const r = parsed['report'];
        const report = {};
        if (Array.isArray(r['formats']))
            report.formats = r['formats'];
        if (typeof r['outputDir'] === 'string')
            report.outputDir = r['outputDir'];
        if (typeof r['includeScreenshots'] === 'boolean')
            report.includeScreenshots = r['includeScreenshots'];
        config.report = { ...DEFAULT_CONFIG.report, ...report };
    }
    // ADO config
    if (parsed['ado'] && typeof parsed['ado'] === 'object') {
        const a = parsed['ado'];
        config.ado = {
            orgUrl: a['orgUrl'] ?? '',
            project: a['project'] ?? '',
            pat: a['pat'] ?? process.env['ADO_PAT'] ?? '',
            areaPath: a['areaPath'],
            iterationPath: a['iterationPath'],
            tags: a['tags'],
        };
    }
    return config;
}
/** Validate a fully-merged ScanConfig */
function validate(config) {
    const errors = [];
    if (!config.targetUrl) {
        errors.push('Target URL is required');
    }
    else {
        try {
            new URL(config.targetUrl);
        }
        catch {
            errors.push(`Invalid URL: "${config.targetUrl}"`);
        }
    }
    if (config.crawlDepth < 0 || config.crawlDepth > 10) {
        errors.push(`crawlDepth must be 0–10, got ${config.crawlDepth}`);
    }
    if (config.maxPages < 1 || config.maxPages > 500) {
        errors.push(`maxPages must be 1–500, got ${config.maxPages}`);
    }
    const validSeverities = ['critical', 'major', 'minor', 'advisory'];
    if (!validSeverities.includes(config.minSeverity)) {
        errors.push(`Invalid minSeverity: "${config.minSeverity}"`);
    }
    const validLevels = ['A', 'AA', 'AAA'];
    if (!validLevels.includes(config.wcagLevel)) {
        errors.push(`Invalid wcagLevel: "${config.wcagLevel}"`);
    }
    for (const fmt of config.report.formats) {
        if (!['html', 'json', 'csv'].includes(fmt)) {
            errors.push(`Invalid report format: "${fmt}"`);
        }
    }
    if (config.fileBugs && !config.ado) {
        errors.push('ADO config is required when fileBugs is enabled');
    }
    return errors;
}
/**
 * Build a complete ScanConfig by merging:
 *   CLI flags > YAML file > defaults
 */
export function loadConfig(cli) {
    // 1. Start with defaults
    let merged = { ...DEFAULT_CONFIG };
    // 2. Layer YAML config
    if (cli.config) {
        const yamlConfig = loadYamlFile(cli.config);
        merged = deepMerge(merged, yamlConfig);
    }
    // 3. Layer CLI overrides
    if (cli.url)
        merged.targetUrl = cli.url;
    if (cli.depth !== undefined)
        merged.crawlDepth = cli.depth;
    if (cli.ado)
        merged.fileBugs = true;
    if (cli.output) {
        const formats = cli.output.split(',').map(f => f.trim());
        merged.report = { ...merged.report, formats };
    }
    if (cli.outputPath) {
        merged.report = { ...merged.report, outputDir: cli.outputPath };
    }
    // 4. Validate
    const errors = validate(merged);
    if (errors.length > 0) {
        throw new ConfigValidationError(errors);
    }
    return merged;
}
/** Deep-merge partial config over base config */
function deepMerge(base, overrides) {
    const result = { ...base };
    for (const [key, value] of Object.entries(overrides)) {
        if (value === undefined)
            continue;
        if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
            result[key] = {
                ...base[key],
                ...value,
            };
        }
        else {
            result[key] = value;
        }
    }
    return result;
}
//# sourceMappingURL=loader.js.map