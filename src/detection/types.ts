/**
 * Type definitions for UI detection and flow analysis.
 *
 * These types are owned by Bobbie (UI Expert).
 * The scanner engine (Naomi) consumes ElementInfo and FlowGraph
 * to decide what to scan and in what order.
 */

import type { Page, ElementHandle, Frame } from 'playwright';

// ─── Element Detection ───────────────────────────────────────────────

/** Bounding box of an element on screen */
export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Computed visual styles relevant to accessibility */
export interface ComputedStyles {
  display: string;
  visibility: string;
  opacity: string;
  position: string;
  zIndex: string;
  overflow: string;
  fontSize: string;
  fontWeight: string;
  color: string;
  backgroundColor: string;
  cursor: string;
  pointerEvents: string;
}

/** Categorization of an interactive element */
export type ElementCategory =
  | 'button'
  | 'link'
  | 'text-input'
  | 'select'
  | 'textarea'
  | 'checkbox'
  | 'radio'
  | 'slider'
  | 'tab'
  | 'menu'
  | 'menu-item'
  | 'modal'
  | 'accordion'
  | 'carousel'
  | 'toggle'
  | 'dialog-trigger'
  | 'navigation'
  | 'search'
  | 'custom-component'
  | 'focusable-other';

/** ARIA attribute map — only attributes actually present */
export type AriaAttributes = Record<string, string>;

/** Full descriptor for a detected interactive element */
export interface ElementInfo {
  /** Stable selector to re-locate this element */
  selector: string;
  /** HTML tag name (lowercase) */
  tag: string;
  /** Detected category */
  category: ElementCategory;
  /** WAI-ARIA role (explicit or implicit) */
  role: string | null;
  /** ARIA attributes found on this element */
  ariaAttributes: AriaAttributes;
  /** Visible text content (trimmed) */
  textContent: string;
  /** Accessible name (aria-label, aria-labelledby, or text) */
  accessibleName: string;
  /** Whether the element is currently visible in the viewport */
  isVisible: boolean;
  /** Whether the element is focusable via Tab */
  isFocusable: boolean;
  /** Whether the element is currently disabled */
  isDisabled: boolean;
  /** Bounding rectangle */
  boundingBox: BoundingBox | null;
  /** Relevant computed styles */
  computedStyles: ComputedStyles | null;
  /** Tab index value (null if not set) */
  tabIndex: number | null;
  /** Framework-specific data attributes found */
  frameworkHints: Record<string, string>;
  /** Whether this element lives in a shadow DOM */
  inShadowDom: boolean;
  /** Whether this element lives in an iframe */
  inIframe: boolean;
  /** Source frame identifier (main or iframe src) */
  frameId: string;
  /** Registered event listener types (click, keydown, etc.) */
  eventListeners: string[];
}

// ─── Flow Analysis ───────────────────────────────────────────────────

/** Types of navigational structures detected on a page */
export type NavigationPattern =
  | 'header-nav'
  | 'sidebar-nav'
  | 'footer-nav'
  | 'breadcrumb'
  | 'pagination'
  | 'tab-group'
  | 'accordion-group'
  | 'dropdown-menu';

/** A detected navigation structure */
export interface NavigationStructure {
  pattern: NavigationPattern;
  /** Selector for the container element */
  containerSelector: string;
  /** Items within this navigation */
  items: ElementInfo[];
  /** ARIA landmark role if present */
  landmark: string | null;
}

/** A form detected on the page */
export interface FormInfo {
  /** Selector for the form element */
  selector: string;
  /** Form action URL */
  action: string;
  /** HTTP method */
  method: string;
  /** Fields within this form */
  fields: ElementInfo[];
  /** Submit button(s) */
  submitButtons: ElementInfo[];
  /** Whether this appears to be a multi-step form */
  isMultiStep: boolean;
  /** Detected form purpose: login, search, registration, contact, etc. */
  purpose: string;
}

/** Relationship between a trigger and what it opens */
export interface TriggerRelationship {
  trigger: ElementInfo;
  /** What happens when the trigger is activated */
  action: 'opens-modal' | 'opens-dropdown' | 'expands-section' | 'navigates' | 'toggles' | 'submits';
  /** Selector of the target element (if applicable) */
  targetSelector: string | null;
}

/** A node in the keyboard navigation order */
export interface TabOrderNode {
  element: ElementInfo;
  /** Position in the tab sequence (0-based) */
  order: number;
  /** Whether this breaks expected visual order */
  outOfVisualOrder: boolean;
}

/** Complete flow analysis result for a page */
export interface PageFlowAnalysis {
  url: string;
  /** Detected navigation patterns */
  navigations: NavigationStructure[];
  /** Detected forms */
  forms: FormInfo[];
  /** Trigger → target relationships */
  triggers: TriggerRelationship[];
  /** Keyboard tab order */
  tabOrder: TabOrderNode[];
  /** Detected landmark regions */
  landmarks: { role: string; selector: string; label: string | null }[];
}

// ─── Interaction Simulation ──────────────────────────────────────────

/** What changed in the DOM after an interaction */
export interface DomDelta {
  /** Elements added to the DOM */
  addedSelectors: string[];
  /** Elements removed from the DOM */
  removedSelectors: string[];
  /** Elements whose attributes changed */
  changedSelectors: string[];
  /** Whether the URL changed */
  urlChanged: boolean;
  /** New URL if changed */
  newUrl: string | null;
  /** Whether a modal/dialog appeared */
  modalAppeared: boolean;
  /** Count of new nodes added */
  nodesAdded: number;
  /** Count of nodes removed */
  nodesRemoved: number;
}

/** Result of simulating one interaction */
export interface InteractionResult {
  /** The element that was interacted with */
  element: ElementInfo;
  /** Type of interaction performed */
  interactionType: 'click' | 'hover' | 'focus' | 'fill' | 'select' | 'scroll' | 'keyboard';
  /** Whether the interaction succeeded without error */
  success: boolean;
  /** Error message if the interaction failed */
  error: string | null;
  /** DOM changes observed */
  domDelta: DomDelta;
  /** Timestamp of the interaction */
  timestamp: number;
}

// ─── Site Mapping ────────────────────────────────────────────────────

/** A page node in the site graph */
export interface SitePageNode {
  url: string;
  title: string;
  /** How this page was discovered */
  discoveredVia: 'seed' | 'link' | 'interaction' | 'form-submit' | 'redirect';
  /** Elements detected on this page */
  elements: ElementInfo[];
  /** Flow analysis for this page */
  flowAnalysis: PageFlowAnalysis | null;
  /** Forms detected on this page */
  forms: FormInfo[];
  /** HTTP status code received */
  statusCode: number | null;
  /** Whether the page has been fully scanned */
  scanned: boolean;
}

/** An edge in the site graph */
export interface SiteEdge {
  /** Source page URL */
  from: string;
  /** Target page URL */
  to: string;
  /** What interaction creates this edge */
  via: 'link' | 'button' | 'form-submit' | 'redirect' | 'javascript';
  /** Selector of the element that triggers this transition */
  triggerSelector: string | null;
}

/** Complete site graph */
export interface SiteGraph {
  /** Seed URL that started the crawl */
  seedUrl: string;
  /** All discovered pages */
  pages: Map<string, SitePageNode>;
  /** Edges between pages */
  edges: SiteEdge[];
  /** Total interactive elements found across all pages */
  totalElements: number;
  /** Total forms found across all pages */
  totalForms: number;
  /** Timestamp of graph creation */
  createdAt: number;
}

/** Configuration for the detection modules */
export interface DetectionConfig {
  /** Maximum time to wait for elements (ms) */
  timeout: number;
  /** Whether to scan inside iframes */
  includeIframes: boolean;
  /** Whether to scan inside shadow DOM */
  includeShadowDom: boolean;
  /** Whether to detect event listeners (slower but more thorough) */
  detectEventListeners: boolean;
  /** Maximum elements to detect per page (safety limit) */
  maxElementsPerPage: number;
  /** Maximum depth for site crawling */
  maxCrawlDepth: number;
  /** Maximum pages to crawl */
  maxPages: number;
  /** Whether to simulate interactions during analysis */
  simulateInteractions: boolean;
  /** Test data for form filling */
  formTestData: Record<string, string>;
}

/** Sensible defaults */
export const DEFAULT_CONFIG: DetectionConfig = {
  timeout: 5000,
  includeIframes: true,
  includeShadowDom: true,
  detectEventListeners: true,
  maxElementsPerPage: 5000,
  maxCrawlDepth: 2,
  maxPages: 50,
  simulateInteractions: true,
  formTestData: {
    email: 'test@example.com',
    password: 'TestP@ss123',
    text: 'Test input',
    search: 'accessibility',
    tel: '+1234567890',
    url: 'https://example.com',
    number: '42',
  },
};
