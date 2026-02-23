/**
 * Config loader — reads YAML config files and merges with CLI args and defaults.
 *
 * Priority: CLI flags > YAML file > defaults (from defaults.ts).
 */
import type { ScanConfig } from './schema.js';
export declare class ConfigValidationError extends Error {
    readonly errors: string[];
    constructor(errors: string[]);
}
/** CLI options that map to config fields */
export interface CliOverrides {
    url?: string;
    depth?: number;
    output?: string;
    config?: string;
    ado?: boolean;
    verbose?: boolean;
    outputPath?: string;
}
/**
 * Build a complete ScanConfig by merging:
 *   CLI flags > YAML file > defaults
 */
export declare function loadConfig(cli: CliOverrides): ScanConfig;
//# sourceMappingURL=loader.d.ts.map