/**
 * FlowAnalyzer — Analyzes page structure to identify navigation flows,
 * form sequences, trigger→target relationships, and keyboard tab order.
 *
 * Owner: Bobbie (UI Expert)
 */
import type { Page } from 'playwright';
import type { ElementInfo, TabOrderNode, PageFlowAnalysis, InteractionResult, DetectionConfig } from './types.js';
/** A complete user flow (e.g., "tab through form", "open and close modal") */
export interface UserFlow {
    /** Flow identifier */
    id: string;
    /** Human-readable name */
    name: string;
    /** The page URL this flow operates on */
    pageUrl: string;
    /** Ordered interaction results */
    interactions: InteractionResult[];
    /** Whether the flow completed successfully */
    completed: boolean;
    /** Issues detected during the flow */
    issues: string[];
}
/** Interface for flow analysis */
export interface IFlowAnalyzer {
    /** Analyze page structure: tab order, landmarks, trigger relationships */
    analyzeStructure(page: Page, url: string): Promise<PageFlowAnalysis>;
    /** Discover and simulate user flows on a page */
    simulateFlows(page: Page, url: string, elements: ElementInfo[]): Promise<UserFlow[]>;
}
export declare class FlowAnalyzer implements IFlowAnalyzer {
    private config;
    private detector;
    constructor(config?: Partial<DetectionConfig>);
    /**
     * Full structural analysis of a page.
     * Detects navigation patterns, forms, triggers, tab order, and landmarks.
     */
    analyzeStructure(page: Page, url: string): Promise<PageFlowAnalysis>;
    /**
     * Simulate user flows on a page.
     * Currently a thin layer — the InteractionSimulator provides heavier simulation.
     */
    simulateFlows(page: Page, url: string, elements: ElementInfo[]): Promise<UserFlow[]>;
    private detectNavigations;
    private detectForms;
    private detectTriggers;
    traceTabOrder(page: Page): Promise<TabOrderNode[]>;
    private detectLandmarks;
    /**
     * Build a keyboard navigation flow by analyzing tab order.
     */
    private buildTabFlow;
}
//# sourceMappingURL=flow-analyzer.d.ts.map