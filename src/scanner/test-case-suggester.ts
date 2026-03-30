/**
 * Test Case Suggestion Engine
 *
 * Analyzes a page and suggests A11Y test cases based on:
 * 1. Actual violations found
 * 2. Page elements detected (forms, images, navigation)
 * 3. WCAG coverage gaps (manual checks needed)
 */

import { ScanEngine } from './engine.js';
import { allRules } from '../rules/index.js';
import type { AccessibilityRule, RuleCategory, WcagLevel } from '../rules/types.js';
import type { ScanResult, Finding, DiscoveredElement } from './types.js';
import type {
  SuggestedTestCase,
  TestStep,
  CategorySummary,
  TestCaseSuggestionResult,
} from '../types/suggestion-test-case.js';

interface SuggestOptions {
  timeout?: number;
  headed?: boolean;
  verbose?: boolean;
  browser?: 'chromium' | 'msedge';
  interactiveAuth?: boolean;
  spaDiscovery?: boolean;
  maxDepth?: number;
}

const CATEGORY_EMOJI: Record<string, string> = {
  'images': '🖼️',
  'multimedia': '🎬',
  'adaptable': '📐',
  'distinguishable': '🎨',
  'keyboard': '⌨️',
  'timing': '⏱️',
  'seizures': '⚡',
  'navigable': '🧭',
  'input-modalities': '👆',
  'readable': '📖',
  'predictable': '🔄',
  'input-assistance': '💬',
  'compatible': '🔧',
  'aria': '🏷️',
  'forms': '📝',
  'screen-reader': '🔊',
};

export class TestCaseSuggester {
  async suggest(url: string, options: SuggestOptions = {}): Promise<TestCaseSuggestionResult> {
    const startTime = Date.now();

    const effectiveMaxDepth = options.maxDepth ?? (options.spaDiscovery ? 1 : 0);
    const effectiveMaxPages = options.spaDiscovery ? 20 : 1;

    // Scan the page (multi-page when SPA discovery is enabled)
    const engine = new ScanEngine({
      url,
      maxDepth: effectiveMaxDepth,
      maxPages: effectiveMaxPages,
      pageTimeoutMs: 30_000,
      timeout: (options.timeout ?? 120) * 1000,
      headless: !options.headed,
      captureScreenshots: false,
      ...(options.browser ? { browserChannel: options.browser } : {}),
      ...(options.interactiveAuth ? { interactiveAuth: true } : {}),
      ...(options.spaDiscovery ? { spaDiscovery: true } : {}),
    });

    const scanResult = await engine.run();
    const duration = Date.now() - startTime;

    // Extract page info
    const page = scanResult.pages[0];
    if (!page) {
      throw new Error('No page results returned from scan');
    }

    const pageTitle = page.metadata.title || 'Untitled Page';

    // Generate suggestions from discovered pages, excluding auth/login redirects
    const suggestions: SuggestedTestCase[] = [];

    const authDomains = ['login.microsoftonline.com', 'login.live.com', 'login.microsoft.com', 'accounts.google.com', 'auth0.com'];
    const targetPages = scanResult.pages.filter(p => {
      try {
        const host = new URL(p.url).hostname;
        return !authDomains.some(d => host.includes(d));
      } catch { return true; }
    });
    // Fall back to all pages if filtering removes everything
    const pagesToAnalyze = targetPages.length > 0 ? targetPages : scanResult.pages;

    for (const pageResult of pagesToAnalyze) {
      const pageLabel = pagesToAnalyze.length > 1
        ? ` [${pageResult.metadata.title || pageResult.url}]`
        : '';

      // 1. From actual violations found (with page context)
      suggestions.push(...this.generateFromViolations(pageResult.findings, pageLabel));

      // 2. From page elements detected
      suggestions.push(...this.generateFromElements(scanResult, pageResult, pageLabel));
    }

    // 3. From WCAG coverage gaps (aggregate across target pages only)
    const allFindings = pagesToAnalyze.flatMap(p => p.findings);
    suggestions.push(...this.generateFromCoverageGaps(allFindings));

    // Calculate metrics
    const prioritySummary = {
      high: suggestions.filter(s => s.priority === 'high').length,
      medium: suggestions.filter(s => s.priority === 'medium').length,
      low: suggestions.filter(s => s.priority === 'low').length,
    };

    const categorySummary = this.buildCategorySummary(suggestions);
    const { score, grade } = this.calculateOverallScore(suggestions, allRules);

    return {
      url,
      scanDate: new Date().toISOString(),
      pageTitle,
      duration,
      totalSuggestions: suggestions.length,
      prioritySummary,
      categorySummary,
      suggestions,
      overallScore: score,
      overallGrade: grade,
    };
  }

  private generateFromViolations(findings: Finding[], pageLabel: string = ''): SuggestedTestCase[] {
    const suggestions: SuggestedTestCase[] = [];

    for (const finding of findings) {
      const rule = allRules.find(r => r.id === finding.ruleId);
      if (!rule) continue;

      suggestions.push({
        id: `tc-violation-${finding.ruleId}-${suggestions.length}`,
        title: `Verify fix for: ${rule.title}${pageLabel}`,
        description: finding.message,
        wcagCriteria: finding.wcagCriterion,
        wcagCriterionName: rule.wcagReferences[0]?.name || 'Unknown',
        wcagLevel: finding.wcagLevel,
        category: finding.category,
        priority: this.mapSeverityToPriority(finding.severity),
        sourceType: 'violation',
        element: `${finding.selector}${pageLabel}`,
        steps: this.buildViolationSteps(finding, rule),
        rationale: `This test case addresses a detected ${finding.severity} violation of WCAG ${finding.wcagLevel} criterion ${finding.wcagCriterion}.`,
        relatedRuleId: finding.ruleId,
      });
    }

    return suggestions;
  }

  private generateFromElements(
    scanResult: ScanResult,
    pageResult?: import('./types.js').PageResult,
    pageLabel: string = '',
  ): SuggestedTestCase[] {
    const suggestions: SuggestedTestCase[] = [];
    const page = pageResult ?? scanResult.pages[0];
    if (!page) return suggestions;

    const elements = page.discoveredElements ?? [];

    // If we have discovered elements, generate ADO-style navigation-flow test cases
    if (elements.length > 0) {
      suggestions.push(...this.generateNavigationFlowTestCases(page.url, elements, pageLabel));
      return suggestions;
    }

    // Fallback: infer element types from finding categories
    const hasImages = page.findings.some(f => f.category === 'images');
    const hasForms = page.findings.some(f => f.category === 'forms');
    const hasKeyboardElements = page.findings.some(f => f.category === 'keyboard');
    const hasNavigation = page.findings.some(f => f.category === 'navigable');
    const hasMultimedia = page.findings.some(f => f.category === 'multimedia');

    if (hasImages) {
      suggestions.push(this.createImageTestCase(page.url, pageLabel));
    }
    if (hasForms) {
      suggestions.push(this.createFormTestCase(page.url, pageLabel));
      suggestions.push(this.createInputValidationTestCase(page.url, pageLabel));
    }
    if (hasKeyboardElements) {
      suggestions.push(this.createKeyboardNavigationTestCase(page.url, pageLabel));
    }
    if (hasNavigation) {
      suggestions.push(this.createSkipLinkTestCase(page.url, pageLabel));
    }
    if (hasMultimedia) {
      suggestions.push(this.createCaptionsTestCase(page.url, pageLabel));
    }

    return suggestions;
  }

  /**
   * Generate ADO-style navigation-flow test cases from discovered UI elements.
   *
   * Produces test cases like:
   *   "Verify all the controls present in 'Malware scanning' tab"
   * with steps like:
   *   "Open URL: https://... > page loads"
   *   "Activate 'Cloud' from the left navigation > Related page will display"
   *   "Activate 'Data' tab"
   *   "Verify all the controls present in 'Data' tab"
   */
  private generateNavigationFlowTestCases(
    url: string,
    elements: DiscoveredElement[],
    pageLabel: string,
  ): SuggestedTestCase[] {
    const suggestions: SuggestedTestCase[] = [];

    // Group elements by kind
    const navItems = elements.filter(e => e.kind === 'navigation' || e.kind === 'link' && e.section === 'left navigation');
    const tabs = elements.filter(e => e.kind === 'tab');
    const buttons = elements.filter(e => e.kind === 'button');
    const formControls = elements.filter(e => e.kind === 'form-control');
    const dialogs = elements.filter(e => e.kind === 'dialog');
    const tables = elements.filter(e => e.kind === 'table');
    const tableRows = elements.filter(e => e.kind === 'table-row');
    const menus = elements.filter(e => e.kind === 'menu');
    const headings = elements.filter(e => e.kind === 'heading');

    // Determine the page section name from headings or URL
    const pageSection = headings[0]?.label || new URL(url).pathname.split('/').pop() || 'page';

    // Open URL step (shared by all test cases)
    const openStep: TestStep = {
      action: `Open URL: ${url}`,
      expectedResult: 'Page loads and all controls are displayed on the screen',
    };

    // --- TC: Verify navigation controls ---
    if (navItems.length > 0) {
      const navLabels = navItems.slice(0, 8).map(n => `'${n.label}'`).join(', ');
      const steps: TestStep[] = [openStep];
      for (const nav of navItems.slice(0, 5)) {
        steps.push({
          action: `Activate '${nav.label}' from the ${nav.section || 'navigation'}`,
          expectedResult: `Related page will display on the screen`,
        });
      }
      steps.push({
        action: `Verify all the navigation controls present on the page: ${navLabels}`,
        expectedResult: 'All navigation items are accessible, have visible labels, and respond to keyboard activation',
      });
      suggestions.push({
        id: `tc-nav-controls${pageLabel ? '-' + this.slugify(pageLabel) : ''}`,
        title: `Verify all the controls present in navigation${pageLabel}`,
        description: `Verify navigation items: ${navLabels}`,
        wcagCriteria: '2.4.1',
        wcagCriterionName: 'Bypass Blocks',
        wcagLevel: 'A',
        category: 'navigable',
        priority: 'high',
        sourceType: 'element-based',
        steps,
        rationale: `Page has ${navItems.length} navigation element(s) that require accessibility verification.`,
      });
    }

    // --- TC: Verify tab controls ---
    if (tabs.length > 0) {
      const tabLabels = tabs.map(t => `'${t.label}'`).join(', ');
      const steps: TestStep[] = [openStep];
      for (const tab of tabs) {
        steps.push({
          action: `Activate '${tab.label}' tab`,
          expectedResult: `'${tab.label}' tab panel content will display on the screen`,
        });
        steps.push({
          action: `Verify all the controls present in '${tab.label}' tab`,
          expectedResult: `All controls in '${tab.label}' tab are accessible and properly labeled`,
        });
      }
      suggestions.push({
        id: `tc-tab-controls${pageLabel ? '-' + this.slugify(pageLabel) : ''}`,
        title: `${pageSection}: Verify all the controls present in tabs: ${tabLabels}${pageLabel}`,
        description: `Verify tab controls: ${tabLabels}`,
        wcagCriteria: '4.1.2',
        wcagCriterionName: 'Name, Role, Value',
        wcagLevel: 'A',
        category: 'aria',
        priority: 'high',
        sourceType: 'element-based',
        steps,
        rationale: `Page has ${tabs.length} tab(s) that require accessibility verification.`,
      });
    }

    // --- TC: Verify button controls ---
    if (buttons.length > 0) {
      const btnLabels = buttons.slice(0, 8).map(b => `'${b.label}'`).join(', ');
      const steps: TestStep[] = [openStep];
      for (const btn of buttons.slice(0, 6)) {
        steps.push({
          action: `Activate '${btn.label}' button`,
          expectedResult: `'${btn.label}' action is triggered > Related content will display on the screen`,
        });
      }
      steps.push({
        action: `Verify all the button controls present on the page: ${btnLabels}`,
        expectedResult: 'All buttons are accessible, have visible labels, and respond to keyboard activation (Enter/Space)',
      });
      suggestions.push({
        id: `tc-button-controls${pageLabel ? '-' + this.slugify(pageLabel) : ''}`,
        title: `${pageSection}: Verify all the button controls${pageLabel}`,
        description: `Verify button controls: ${btnLabels}`,
        wcagCriteria: '4.1.2',
        wcagCriterionName: 'Name, Role, Value',
        wcagLevel: 'A',
        category: 'keyboard',
        priority: 'high',
        sourceType: 'element-based',
        steps,
        rationale: `Page has ${buttons.length} button(s) that require accessibility verification.`,
      });
    }

    // --- TC: Verify form controls ---
    if (formControls.length > 0) {
      const formLabels = formControls.slice(0, 8).map(f => `'${f.label}'`).join(', ');
      const steps: TestStep[] = [openStep];
      for (const fc of formControls.slice(0, 5)) {
        steps.push({
          action: `Activate '${fc.label}' ${fc.role || 'input'}`,
          expectedResult: `'${fc.label}' receives focus and its label is announced by screen reader`,
        });
      }
      steps.push({
        action: `Verify all form controls present on the page: ${formLabels}`,
        expectedResult: 'All form controls have associated labels and are operable via keyboard',
      });
      suggestions.push({
        id: `tc-form-controls${pageLabel ? '-' + this.slugify(pageLabel) : ''}`,
        title: `${pageSection}: Verify all the form controls${pageLabel}`,
        description: `Verify form controls: ${formLabels}`,
        wcagCriteria: '1.3.1',
        wcagCriterionName: 'Info and Relationships',
        wcagLevel: 'A',
        category: 'forms',
        priority: 'high',
        sourceType: 'element-based',
        steps,
        rationale: `Page has ${formControls.length} form control(s) that require accessibility verification.`,
      });
    }

    // --- TC: Verify dialog/modal controls ---
    if (dialogs.length > 0) {
      const dlgLabels = dialogs.map(d => `'${d.label}'`).join(', ');
      const steps: TestStep[] = [openStep];
      for (const dlg of dialogs.slice(0, 3)) {
        steps.push({
          action: `Activate the trigger for '${dlg.label}' dialog`,
          expectedResult: `'${dlg.label}' dialog will display on the screen`,
        });
        steps.push({
          action: `Verify all the controls present in '${dlg.label}' dialog`,
          expectedResult: `Dialog traps focus, has a close button, and all controls are accessible`,
        });
      }
      suggestions.push({
        id: `tc-dialog-controls${pageLabel ? '-' + this.slugify(pageLabel) : ''}`,
        title: `${pageSection}: Verify dialog controls: ${dlgLabels}${pageLabel}`,
        description: `Verify dialog controls: ${dlgLabels}`,
        wcagCriteria: '2.4.3',
        wcagCriterionName: 'Focus Order',
        wcagLevel: 'A',
        category: 'keyboard',
        priority: 'high',
        sourceType: 'element-based',
        steps,
        rationale: `Page has ${dialogs.length} dialog(s) that require focus management verification.`,
      });
    }

    // --- TC: Verify table controls ---
    if (tables.length > 0 || tableRows.length > 0) {
      const steps: TestStep[] = [openStep];

      if (tables.length > 0) {
        for (const tbl of tables.slice(0, 2)) {
          steps.push({
            action: `Verify all the controls present in '${tbl.label || 'data table'}' table`,
            expectedResult: 'Table has proper headers and data is announced correctly by screen reader',
          });
        }
      }

      // Clickable table rows that open side panels
      const sampleRow = tableRows[0];
      if (sampleRow) {
        steps.push({
          action: `Activate any table row > Side panel will display on the screen`,
          expectedResult: 'Side panel opens with details for the selected row',
        });
        steps.push({
          action: `Verify all the controls present in the side panel`,
          expectedResult: 'Side panel controls are accessible, have visible labels, and panel can be closed with Escape key',
        });
      }

      steps.push({
        action: 'Verify table row actions are keyboard-accessible (Enter/Space to activate)',
        expectedResult: 'All table rows can be activated via keyboard and focus management is correct',
      });

      suggestions.push({
        id: `tc-table-controls${pageLabel ? '-' + this.slugify(pageLabel) : ''}`,
        title: `${pageSection}: Verify table controls and side panel${pageLabel}`,
        description: 'Verify data table accessibility and row interaction side panel',
        wcagCriteria: '1.3.1',
        wcagCriterionName: 'Info and Relationships',
        wcagLevel: 'A',
        category: 'adaptable',
        priority: 'high',
        sourceType: 'element-based',
        steps,
        rationale: `Page has ${tables.length} table(s) and ${tableRows.length} clickable row(s) that require accessibility verification.`,
      });
    }

    // --- TC: Verify menu controls ---
    if (menus.length > 0) {
      const menuLabels = menus.slice(0, 5).map(m => `'${m.label}'`).join(', ');
      const steps: TestStep[] = [openStep];
      for (const m of menus.slice(0, 3)) {
        steps.push({
          action: `Activate '${m.label}' menu`,
          expectedResult: `'${m.label}' menu opens and menu items will display on the screen`,
        });
      }
      steps.push({
        action: `Verify all menu controls: ${menuLabels}`,
        expectedResult: 'Menus open/close with keyboard, items are navigable with Arrow keys, and Escape closes the menu',
      });
      suggestions.push({
        id: `tc-menu-controls${pageLabel ? '-' + this.slugify(pageLabel) : ''}`,
        title: `${pageSection}: Verify menu controls: ${menuLabels}${pageLabel}`,
        description: `Verify menu controls: ${menuLabels}`,
        wcagCriteria: '2.1.1',
        wcagCriterionName: 'Keyboard',
        wcagLevel: 'A',
        category: 'keyboard',
        priority: 'high',
        sourceType: 'element-based',
        steps,
        rationale: `Page has ${menus.length} menu(s) that require keyboard accessibility verification.`,
      });
    }

    return suggestions;
  }

  private generateFromCoverageGaps(findings: Finding[]): SuggestedTestCase[] {
    const suggestions: SuggestedTestCase[] = [];

    // Find rules that require manual testing
    const manualRules = allRules.filter(r => r.automationLevel === 'manual');
    const testedWcagCriteria = new Set(findings.map(f => f.wcagCriterion));

    // Categories that apply to every page regardless of content
    const universalCategories: Set<RuleCategory> = new Set([
      'keyboard', 'navigable', 'readable', 'predictable',
      'compatible', 'aria', 'screen-reader', 'adaptable', 'distinguishable',
    ]);

    // Categories actually detected on the page via findings
    const detectedCategories = new Set<RuleCategory>(findings.map(f => f.category));

    // Only suggest gaps for categories that are universal OR detected on the page
    const relevantCategories = new Set<RuleCategory>([
      ...universalCategories,
      ...detectedCategories,
    ]);

    // Suggest manual test cases for untested WCAG AA criteria in relevant categories
    const untested = manualRules.filter(r =>
      relevantCategories.has(r.category) &&
      r.wcagReferences.some(ref =>
        ref.level === 'AA' && !testedWcagCriteria.has(ref.criterion)
      )
    );

    // Limit to top 10 most important gaps
    const topGaps = untested.slice(0, 10);

    for (const rule of topGaps) {
      const wcagRef = rule.wcagReferences[0];
      if (!wcagRef) continue;

      suggestions.push({
        id: `tc-gap-${rule.id}`,
        title: `Manual check: ${rule.title}`,
        description: rule.description,
        wcagCriteria: wcagRef.criterion,
        wcagCriterionName: wcagRef.name,
        wcagLevel: wcagRef.level,
        category: rule.category,
        priority: 'medium',
        sourceType: 'coverage-gap',
        steps: this.generateManualTestSteps(rule),
        rationale: `This manual test ensures WCAG ${wcagRef.level} criterion ${wcagRef.criterion} (${wcagRef.name}) is properly implemented. Automated tools cannot fully verify this requirement.`,
        relatedRuleId: rule.id,
      });
    }

    return suggestions;
  }

  private createImageTestCase(url: string, pageLabel: string = ''): SuggestedTestCase {
    return {
      id: `tc-images-comprehensive${pageLabel ? '-' + this.slugify(pageLabel) : ''}`,
      title: `Comprehensive image accessibility review${pageLabel}`,
      description: 'Verify all images have appropriate alternative text',
      wcagCriteria: '1.1.1',
      wcagCriterionName: 'Non-text Content',
      wcagLevel: 'A',
      category: 'images',
      priority: 'high',
      sourceType: 'element-based',
      element: pageLabel ? `Page: ${pageLabel.replace(/^\s*\[|\]\s*$/g, '')}` : undefined,
      steps: [
        {
          action: `Open URL: ${url}`,
          expectedResult: 'Page loads and all images are displayed on the screen',
        },
        {
          action: 'Activate each informative image > Verify it has a descriptive alt attribute or aria-label',
          expectedResult: 'Every meaningful image has alt text that conveys the same information as the visual',
        },
        {
          action: 'Activate each decorative image > Verify it has alt="" or role="presentation"',
          expectedResult: 'Decorative images are hidden from assistive technology',
        },
        {
          action: 'Activate a screen reader > Navigate to each image on the page',
          expectedResult: 'Screen reader announces descriptive alt text for informative images and skips decorative images',
        },
      ],
      rationale: 'Page contains images that require manual verification for context-appropriate alternative text.',
    };
  }

  private createFormTestCase(url: string, pageLabel: string = ''): SuggestedTestCase {
    return {
      id: `tc-forms-labels${pageLabel ? '-' + this.slugify(pageLabel) : ''}`,
      title: `Form field labels and associations${pageLabel}`,
      description: 'Verify all form inputs have properly associated labels',
      wcagCriteria: '1.3.1',
      wcagCriterionName: 'Info and Relationships',
      wcagLevel: 'A',
      category: 'forms',
      priority: 'high',
      sourceType: 'element-based',
      element: pageLabel ? `Page: ${pageLabel.replace(/^\s*\[|\]\s*$/g, '')}` : undefined,
      steps: [
        {
          action: `Open URL: ${url}`,
          expectedResult: 'Page loads and form elements are displayed on the screen',
        },
        {
          action: 'Activate each form label text on the page',
          expectedResult: 'Clicking each label moves focus to its associated input control',
        },
        {
          action: 'Activate Tab key to navigate through all form fields in sequence',
          expectedResult: 'Focus moves in a logical order matching the visual layout > Every input is reachable',
        },
        {
          action: 'Activate a screen reader > Navigate to each form control',
          expectedResult: 'Screen reader announces the label, role (textbox/combobox/checkbox), and required state for each input',
        },
      ],
      rationale: 'Page contains forms that require proper labeling for screen reader users.',
    };
  }

  private createInputValidationTestCase(url: string, pageLabel: string = ''): SuggestedTestCase {
    return {
      id: `tc-forms-validation${pageLabel ? '-' + this.slugify(pageLabel) : ''}`,
      title: `Form validation and error handling${pageLabel}`,
      description: 'Verify form validation errors are accessible',
      wcagCriteria: '3.3.1',
      wcagCriterionName: 'Error Identification',
      wcagLevel: 'A',
      category: 'input-assistance',
      priority: 'high',
      sourceType: 'element-based',
      element: pageLabel ? `Page: ${pageLabel.replace(/^\s*\[|\]\s*$/g, '')}` : undefined,
      steps: [
        {
          action: `Open URL: ${url}`,
          expectedResult: 'Page loads and the form is displayed on the screen',
        },
        {
          action: 'Activate the form submit button with empty or invalid data',
          expectedResult: 'Validation errors are displayed for each invalid field',
        },
        {
          action: 'Verify focus moves to the first field in error',
          expectedResult: 'After submission, keyboard focus is placed on the first invalid field',
        },
        {
          action: 'Activate a screen reader > Navigate to each error message',
          expectedResult: 'Screen reader announces the error text when the invalid field receives focus',
        },
        {
          action: 'Verify each error message provides corrective guidance',
          expectedResult: 'Error messages describe what went wrong and how to fix it (e.g. "Enter a valid email address")',
        },
      ],
      rationale: 'Form validation must be accessible to all users including those using assistive technology.',
    };
  }

  private createKeyboardNavigationTestCase(url: string, pageLabel: string = ''): SuggestedTestCase {
    return {
      id: `tc-keyboard-nav${pageLabel ? '-' + this.slugify(pageLabel) : ''}`,
      title: `Complete keyboard navigation test${pageLabel}`,
      description: 'Verify all interactive elements are keyboard accessible',
      wcagCriteria: '2.1.1',
      wcagCriterionName: 'Keyboard',
      wcagLevel: 'A',
      category: 'keyboard',
      priority: 'high',
      sourceType: 'element-based',
      element: pageLabel ? `Page: ${pageLabel.replace(/^\s*\[|\]\s*$/g, '')}` : undefined,
      steps: [
        {
          action: `Open URL: ${url}`,
          expectedResult: 'Page loads and all controls are displayed on the screen',
        },
        {
          action: 'Activate Tab key to navigate through all interactive controls on the page',
          expectedResult: 'A visible focus indicator is displayed on each focused element in a logical order',
        },
        {
          action: 'Activate each focused control using Enter or Space key',
          expectedResult: 'Each control responds to keyboard activation (links navigate, buttons trigger actions, checkboxes toggle)',
        },
        {
          action: 'Activate any dropdown or custom widget > Use Arrow keys to navigate options',
          expectedResult: 'Arrow keys move selection within the widget > Selected item is visually highlighted',
        },
        {
          action: 'Verify no keyboard trap exists > Activate Tab and Shift+Tab through the entire page',
          expectedResult: 'Focus never becomes stuck — Tab always moves forward and Shift+Tab always moves backward',
        },
        {
          action: 'Activate any dialog or modal on the page > Activate Escape key',
          expectedResult: 'Dialog closes and focus returns to the element that triggered it',
        },
      ],
      rationale: 'Keyboard accessibility is critical for users who cannot use a mouse.',
    };
  }

  private createSkipLinkTestCase(url: string, pageLabel: string = ''): SuggestedTestCase {
    return {
      id: `tc-nav-skip-link${pageLabel ? '-' + this.slugify(pageLabel) : ''}`,
      title: `Skip navigation link verification${pageLabel}`,
      description: 'Verify skip link is present and functional',
      wcagCriteria: '2.4.1',
      wcagCriterionName: 'Bypass Blocks',
      wcagLevel: 'A',
      category: 'navigable',
      priority: 'medium',
      sourceType: 'element-based',
      element: pageLabel ? `Page: ${pageLabel.replace(/^\s*\[|\]\s*$/g, '')}` : undefined,
      steps: [
        {
          action: `Open URL: ${url}`,
          expectedResult: 'Page loads and all controls are displayed on the screen',
        },
        {
          action: 'Activate Tab key once to focus the first interactive element',
          expectedResult: '"Skip to main content" (or similar) link is displayed on the screen',
        },
        {
          action: 'Activate the skip link by pressing Enter',
          expectedResult: 'Focus moves past the navigation directly to the main content area',
        },
        {
          action: 'Activate Tab key again to verify focus position',
          expectedResult: 'Next Tab stop is within the main content, not back in the navigation',
        },
      ],
      rationale: 'Skip links allow keyboard users to bypass repetitive navigation.',
    };
  }

  private createCaptionsTestCase(url: string, pageLabel: string = ''): SuggestedTestCase {
    return {
      id: `tc-media-captions${pageLabel ? '-' + this.slugify(pageLabel) : ''}`,
      title: `Video captions and audio descriptions${pageLabel}`,
      description: 'Verify multimedia content has synchronized captions',
      wcagCriteria: '1.2.2',
      wcagCriterionName: 'Captions (Prerecorded)',
      wcagLevel: 'A',
      category: 'multimedia',
      priority: 'high',
      sourceType: 'element-based',
      element: pageLabel ? `Page: ${pageLabel.replace(/^\s*\[|\]\s*$/g, '')}` : undefined,
      steps: [
        {
          action: `Open URL: ${url}`,
          expectedResult: 'Page loads and video/audio elements are displayed on the screen',
        },
        {
          action: 'Activate each video player on the page > Activate the captions (CC) control',
          expectedResult: 'Captions are available and can be turned on',
        },
        {
          action: 'Verify captions are synchronized with the audio content',
          expectedResult: 'Captions match the spoken dialogue and include meaningful sound effects',
        },
        {
          action: 'Activate the media player controls using only the keyboard (Tab, Enter, Space)',
          expectedResult: 'Play, pause, volume, and caption controls are all keyboard-accessible',
        },
      ],
      rationale: 'Captions are essential for deaf and hard-of-hearing users.',
    };
  }

  private buildViolationSteps(finding: Finding, rule: AccessibilityRule): TestStep[] {
    return [
      {
        action: `Open URL: ${finding.pageUrl}`,
        expectedResult: 'Page loads and all controls are displayed on the screen',
      },
      {
        action: `Activate the element '${finding.selector}' > Inspect the element for: ${rule.title.toLowerCase()}`,
        expectedResult: `${rule.remediation}`,
      },
      {
        action: `Verify '${finding.selector}' is accessible using assistive technology (screen reader)`,
        expectedResult: `Screen reader announces the element correctly with proper role, name, and state`,
      },
    ];
  }

  private getCategoryVerificationSteps(
    category: RuleCategory,
    finding: Finding,
    rule: AccessibilityRule,
  ): TestStep[] {
    // Not used anymore — violation steps are handled by buildViolationSteps
    return [];
  }

  private slugify(label: string): string {
    return label
      .toLowerCase()
      .replace(/[[\]]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 40);
  }

  private generateManualTestSteps(rule: AccessibilityRule): TestStep[] {
    switch (rule.category) {
      case 'keyboard':
        return [
          { action: 'Activate Tab key to navigate through all interactive controls on the page', expectedResult: 'Each control receives a visible focus indicator in a logical order' },
          { action: 'Activate each focused control using Enter or Space key', expectedResult: 'Controls respond to keyboard activation > No keyboard traps exist' },
          { action: 'Activate Escape key on any open dialogs or popups', expectedResult: 'Dialog closes and focus returns to the trigger element' },
        ];
      case 'screen-reader':
        return [
          { action: 'Activate a screen reader (NVDA, JAWS, or VoiceOver) > Open the page', expectedResult: 'Screen reader announces the page title and begins reading content' },
          { action: 'Activate heading navigation (H key) > Navigate through all headings', expectedResult: 'All headings are announced with correct level (h1, h2, h3) in logical order' },
          { action: 'Activate landmark navigation (D key) > Verify all page regions', expectedResult: 'Page regions (banner, navigation, main, contentinfo) are identified' },
        ];
      case 'distinguishable':
        return [
          { action: 'Activate browser zoom to 200% > Review the page', expectedResult: 'Content reflows into a single column without horizontal scrolling or clipped text' },
          { action: 'Verify text contrast ratios using DevTools or a contrast analyzer', expectedResult: 'All text meets WCAG AA minimums (4.5:1 normal text, 3:1 large text)' },
        ];
      case 'images':
        return [
          { action: 'Activate a screen reader > Navigate to each image on the page', expectedResult: 'Informative images are announced with descriptive alt text' },
          { action: 'Verify decorative images are hidden from assistive technology', expectedResult: 'Decorative images use alt="" or role="presentation" and are skipped by screen reader' },
        ];
      case 'forms':
        return [
          { action: 'Activate each form label text on the page', expectedResult: 'Clicking each label moves focus to its associated input control' },
          { action: 'Activate Tab key to navigate through all form controls', expectedResult: 'Focus order matches visual layout > Every input is reachable via keyboard' },
        ];
      case 'multimedia':
        return [
          { action: 'Activate each video player > Activate the captions (CC) control', expectedResult: 'Captions are available, synchronized, and include dialogue and sound effects' },
          { action: 'Activate media player controls using only the keyboard', expectedResult: 'Play, pause, volume, and caption controls are all keyboard-accessible' },
        ];
      case 'navigable':
        return [
          { action: 'Activate Tab key once after page load > Verify a skip navigation link appears', expectedResult: '"Skip to main content" link is displayed on the screen and is visible on focus' },
          { action: 'Activate the skip link > Verify focus position', expectedResult: 'Focus moves directly to the main content area' },
          { action: 'Verify heading hierarchy using accessibility tree or browser extension', expectedResult: 'Headings are nested logically (h1→h2→h3) with no skipped levels' },
        ];
      case 'timing':
        return [
          { action: 'Verify any time-limited content on the page (session timeouts, auto-advancing carousels)', expectedResult: 'User can pause, stop, or extend any time limit before it expires' },
          { action: 'Verify auto-refreshing content does not interrupt assistive technology', expectedResult: 'Moving content has a visible pause control > Updates do not steal focus' },
        ];
      case 'input-assistance':
        return [
          { action: 'Activate the form submit button with invalid data', expectedResult: 'Error messages are displayed and describe the problem and how to fix it' },
          { action: 'Activate a screen reader > Navigate to each error message', expectedResult: 'Errors are announced when their input receives focus' },
        ];
      case 'adaptable':
        return [
          { action: 'Verify page structure in the accessibility tree (headings, lists, tables, landmarks)', expectedResult: 'Content structure is conveyed through proper HTML semantics, not just visual styling' },
          { action: 'Disable CSS > Verify the content reading order', expectedResult: 'Content order remains logical and meaningful without visual presentation' },
        ];
      case 'compatible':
        return [
          { action: 'Validate page HTML using the W3C validator', expectedResult: 'No duplicate IDs, unclosed tags, or parsing errors' },
          { action: 'Verify ARIA usage on custom controls via the accessibility tree', expectedResult: 'Every custom widget has a correct role, accessible name, and state exposed to assistive technology' },
        ];
      case 'aria':
        return [
          { action: 'Activate each custom interactive widget (menus, tabs, dialogs) > Verify ARIA roles', expectedResult: 'Roles match the widget pattern > Required children and owned elements are present' },
          { action: 'Activate each widget > Verify ARIA states update on interaction', expectedResult: 'State attributes (aria-expanded, aria-selected) toggle correctly and are announced by screen readers' },
        ];
      case 'readable':
        return [
          { action: 'Verify the page has a valid lang attribute on the html element', expectedResult: 'lang attribute matches the primary language of the content' },
          { action: 'Activate a screen reader > Verify foreign-language content is read with correct pronunciation', expectedResult: 'Foreign-language phrases have inline lang attributes' },
        ];
      case 'predictable':
        return [
          { action: 'Activate Tab key to focus each form element (do not activate)', expectedResult: 'No unexpected context change occurs on focus alone (no new window, no form submission)' },
          { action: 'Activate select menus and change their value', expectedResult: 'No automatic navigation occurs > User must explicitly confirm changes' },
        ];
      case 'seizures':
        return [
          { action: 'Verify the page has no flashing, blinking, or strobing content', expectedResult: 'No content flashes more than 3 times per second' },
        ];
      case 'input-modalities':
        return [
          { action: 'Verify all drag-and-drop or swipe interactions have keyboard alternatives', expectedResult: 'A single-pointer or keyboard alternative exists for every multi-point gesture' },
          { action: 'Verify click targets are at least 24×24 CSS pixels', expectedResult: 'Touch targets meet the WCAG minimum size or have sufficient spacing' },
        ];
      default:
        return [
          { action: `Verify: ${rule.title}`, expectedResult: rule.remediation },
        ];
    }
  }

  private mapSeverityToPriority(severity: string): 'high' | 'medium' | 'low' {
    if (severity === 'critical' || severity === 'serious') return 'high';
    if (severity === 'moderate') return 'medium';
    return 'low';
  }

  private buildCategorySummary(suggestions: SuggestedTestCase[]): CategorySummary[] {
    const categoryMap = new Map<RuleCategory, CategorySummary>();

    for (const suggestion of suggestions) {
      if (!categoryMap.has(suggestion.category)) {
        categoryMap.set(suggestion.category, {
          category: suggestion.category,
          emoji: CATEGORY_EMOJI[suggestion.category] || '📋',
          totalSuggestions: 0,
          highPriority: 0,
          mediumPriority: 0,
          lowPriority: 0,
        });
      }

      const summary = categoryMap.get(suggestion.category)!;
      summary.totalSuggestions++;
      if (suggestion.priority === 'high') summary.highPriority++;
      if (suggestion.priority === 'medium') summary.mediumPriority++;
      if (suggestion.priority === 'low') summary.lowPriority++;
    }

    return Array.from(categoryMap.values()).sort((a, b) =>
      b.totalSuggestions - a.totalSuggestions
    );
  }

  private calculateOverallScore(
    suggestions: SuggestedTestCase[],
    rules: readonly AccessibilityRule[]
  ): { score: number; grade: string } {
    // Calculate coverage as percentage of total rules
    const totalRules = rules.length;
    const coveredRules = new Set(
      suggestions.map(s => s.relatedRuleId).filter(Boolean)
    ).size;

    const coverageRatio = coveredRules / totalRules;

    // Score from 0-10 based on coverage
    const score = Math.round(coverageRatio * 100) / 10;

    // Grade mapping
    let grade = 'F';
    if (score >= 9.5) grade = 'S';
    else if (score >= 9.0) grade = 'A+';
    else if (score >= 8.5) grade = 'A';
    else if (score >= 8.0) grade = 'A-';
    else if (score >= 7.5) grade = 'B+';
    else if (score >= 7.0) grade = 'B';
    else if (score >= 6.5) grade = 'B-';
    else if (score >= 6.0) grade = 'C+';
    else if (score >= 5.5) grade = 'C';
    else if (score >= 5.0) grade = 'C-';
    else if (score >= 4.0) grade = 'D';

    return { score, grade };
  }
}
