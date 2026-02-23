/**
 * FlowAnalyzer — Analyzes page structure to identify navigation flows,
 * form sequences, trigger→target relationships, and keyboard tab order.
 *
 * Owner: Bobbie (UI Expert)
 */
import { DEFAULT_CONFIG } from './types.js';
import { UIDetector } from './ui-detector.js';
export class FlowAnalyzer {
    config;
    detector;
    constructor(config = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.detector = new UIDetector(this.config);
    }
    /**
     * Full structural analysis of a page.
     * Detects navigation patterns, forms, triggers, tab order, and landmarks.
     */
    async analyzeStructure(page, url) {
        const elements = await this.detector.detectAll(page);
        const [navigations, forms, triggers, tabOrder, landmarks] = await Promise.all([
            this.detectNavigations(page),
            this.detectForms(page, elements),
            this.detectTriggers(page, elements),
            this.traceTabOrder(page),
            this.detectLandmarks(page),
        ]);
        return { url, navigations, forms, triggers, tabOrder, landmarks };
    }
    /**
     * Simulate user flows on a page.
     * Currently a thin layer — the InteractionSimulator provides heavier simulation.
     */
    async simulateFlows(page, url, elements) {
        const flows = [];
        // Flow 1: Keyboard navigation (tab through the entire page)
        const tabFlow = await this.buildTabFlow(page, url);
        if (tabFlow)
            flows.push(tabFlow);
        return flows;
    }
    // ─── Navigation Detection ──────────────────────────────────────────
    async detectNavigations(page) {
        const raw = await page.evaluate(() => {
            const results = [];
            function buildSelector(el) {
                if (el.id)
                    return `#${CSS.escape(el.id)}`;
                const parts = [];
                let current = el;
                while (current && current !== document.documentElement) {
                    let part = current.tagName.toLowerCase();
                    if (current.id) {
                        parts.unshift(`#${CSS.escape(current.id)} > ${part}`);
                        break;
                    }
                    const cur = current;
                    const parent = current.parentElement;
                    if (parent) {
                        const siblings = Array.from(parent.children).filter((c) => c.tagName === cur.tagName);
                        if (siblings.length > 1) {
                            const index = siblings.indexOf(cur) + 1;
                            part += `:nth-of-type(${index})`;
                        }
                    }
                    parts.unshift(part);
                    current = parent;
                }
                return parts.join(' > ');
            }
            // ARIA navigation landmarks
            const navElements = document.querySelectorAll('nav, [role="navigation"]');
            for (const nav of navElements) {
                const rect = nav.getBoundingClientRect();
                const items = nav.querySelectorAll('a[href], button, [role="menuitem"]');
                let pattern = 'header-nav';
                if (rect.width < 300 && rect.height > 400)
                    pattern = 'sidebar-nav';
                if (rect.top > document.documentElement.scrollHeight * 0.8)
                    pattern = 'footer-nav';
                results.push({
                    pattern,
                    containerSelector: buildSelector(nav),
                    itemCount: items.length,
                    landmark: nav.getAttribute('role') ?? 'navigation',
                });
            }
            // Breadcrumbs
            const breadcrumbs = document.querySelectorAll('[aria-label*="breadcrumb" i], [role="navigation"][aria-label*="breadcrumb" i], .breadcrumb, .breadcrumbs, nav.breadcrumb');
            for (const bc of breadcrumbs) {
                results.push({
                    pattern: 'breadcrumb',
                    containerSelector: buildSelector(bc),
                    itemCount: bc.querySelectorAll('a, li, span').length,
                    landmark: null,
                });
            }
            // Tab groups
            const tabLists = document.querySelectorAll('[role="tablist"]');
            for (const tl of tabLists) {
                results.push({
                    pattern: 'tab-group',
                    containerSelector: buildSelector(tl),
                    itemCount: tl.querySelectorAll('[role="tab"]').length,
                    landmark: null,
                });
            }
            // Accordion groups
            const accordions = document.querySelectorAll('details, [data-accordion], .accordion');
            if (accordions.length >= 2) {
                const parent = accordions[0].parentElement;
                if (parent) {
                    results.push({
                        pattern: 'accordion-group',
                        containerSelector: buildSelector(parent),
                        itemCount: accordions.length,
                        landmark: null,
                    });
                }
            }
            // Dropdown menus
            const menus = document.querySelectorAll('[role="menu"]');
            for (const menu of menus) {
                results.push({
                    pattern: 'dropdown-menu',
                    containerSelector: buildSelector(menu),
                    itemCount: menu.querySelectorAll('[role="menuitem"]').length,
                    landmark: null,
                });
            }
            // Pagination
            const paginations = document.querySelectorAll('nav[aria-label*="paginat" i], .pagination, [role="navigation"][aria-label*="paginat" i]');
            for (const pag of paginations) {
                results.push({
                    pattern: 'pagination',
                    containerSelector: buildSelector(pag),
                    itemCount: pag.querySelectorAll('a, button').length,
                    landmark: null,
                });
            }
            return results;
        });
        return raw.map((r) => ({
            pattern: r.pattern,
            containerSelector: r.containerSelector,
            items: [], // Elements can be populated via a secondary pass if needed
            landmark: r.landmark,
        }));
    }
    // ─── Form Detection ────────────────────────────────────────────────
    async detectForms(page, elements) {
        const rawForms = await page.evaluate(() => {
            const forms = [];
            function buildSelector(el) {
                if (el.id)
                    return `#${CSS.escape(el.id)}`;
                const tag = el.tagName.toLowerCase();
                const name = el.getAttribute('name');
                if (name)
                    return `${tag}[name="${CSS.escape(name)}"]`;
                const parent = el.parentElement;
                if (!parent)
                    return tag;
                const siblings = Array.from(parent.children).filter((c) => c.tagName === el.tagName);
                if (siblings.length > 1) {
                    return `${tag}:nth-of-type(${siblings.indexOf(el) + 1})`;
                }
                return tag;
            }
            for (const form of document.querySelectorAll('form')) {
                const fields = Array.from(form.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]), select, textarea'));
                const submitButtons = Array.from(form.querySelectorAll('button[type="submit"], input[type="submit"], button:not([type])'));
                const allFieldNames = fields
                    .map((f) => [f.getAttribute('name'), f.getAttribute('id'), f.getAttribute('autocomplete'), f.getAttribute('type')]
                    .filter(Boolean)
                    .join(' '))
                    .join(' ')
                    .toLowerCase();
                const actionStr = (form.action ?? '') + allFieldNames + (form.getAttribute('role') ?? '');
                let purpose = 'generic';
                if (/password|login|sign.?in|auth/i.test(actionStr))
                    purpose = 'login';
                else if (/search/i.test(actionStr))
                    purpose = 'search';
                else if (/register|sign.?up|create.?account/i.test(actionStr))
                    purpose = 'registration';
                else if (/contact|message|feedback/i.test(actionStr))
                    purpose = 'contact';
                else if (/subscribe|newsletter/i.test(allFieldNames))
                    purpose = 'newsletter';
                else if (/payment|card|billing/i.test(allFieldNames))
                    purpose = 'payment';
                const fieldsets = form.querySelectorAll('fieldset');
                const stepIndicators = form.querySelectorAll('[data-step], .step, [role="progressbar"]');
                const isMultiStep = fieldsets.length > 1 || stepIndicators.length > 0;
                forms.push({
                    selector: buildSelector(form),
                    action: form.action ?? '',
                    method: (form.method ?? 'get').toUpperCase(),
                    fieldSelectors: fields.map((f) => buildSelector(f)),
                    submitSelectors: submitButtons.map((b) => buildSelector(b)),
                    fieldCount: fields.length,
                    submitCount: submitButtons.length,
                    isMultiStep,
                    purpose,
                });
            }
            return forms;
        });
        return rawForms.map((raw) => ({
            selector: raw.selector,
            action: raw.action,
            method: raw.method,
            fields: elements.filter((el) => raw.fieldSelectors.includes(el.selector)).slice(0, raw.fieldCount),
            submitButtons: elements.filter((el) => raw.submitSelectors.includes(el.selector)).slice(0, raw.submitCount),
            isMultiStep: raw.isMultiStep,
            purpose: raw.purpose,
        }));
    }
    // ─── Trigger Detection ─────────────────────────────────────────────
    async detectTriggers(page, elements) {
        const rawTriggers = await page.evaluate(() => {
            const triggers = [];
            function buildSelector(el) {
                if (el.id)
                    return `#${CSS.escape(el.id)}`;
                const parts = [];
                let current = el;
                while (current && current !== document.documentElement) {
                    let part = current.tagName.toLowerCase();
                    if (current.id) {
                        parts.unshift(`#${CSS.escape(current.id)} > ${part}`);
                        break;
                    }
                    const cur = current;
                    const parent = current.parentElement;
                    if (parent) {
                        const siblings = Array.from(parent.children).filter((c) => c.tagName === cur.tagName);
                        if (siblings.length > 1) {
                            const index = siblings.indexOf(cur) + 1;
                            part += `:nth-of-type(${index})`;
                        }
                    }
                    parts.unshift(part);
                    current = parent;
                }
                return parts.join(' > ');
            }
            // aria-controls
            for (const el of document.querySelectorAll('[aria-controls]')) {
                const targetId = el.getAttribute('aria-controls');
                const target = document.getElementById(targetId);
                const hasPopup = el.getAttribute('aria-haspopup');
                const expanded = el.getAttribute('aria-expanded');
                let action = 'toggles';
                if (hasPopup === 'dialog' || hasPopup === 'true')
                    action = 'opens-modal';
                else if (hasPopup === 'menu' || hasPopup === 'listbox')
                    action = 'opens-dropdown';
                else if (expanded !== null)
                    action = 'expands-section';
                triggers.push({
                    triggerSelector: buildSelector(el),
                    action,
                    targetSelector: target ? `#${CSS.escape(targetId)}` : null,
                });
            }
            // aria-haspopup without aria-controls
            for (const el of document.querySelectorAll('[aria-haspopup]:not([aria-controls])')) {
                const popup = el.getAttribute('aria-haspopup');
                triggers.push({
                    triggerSelector: buildSelector(el),
                    action: popup === 'dialog' ? 'opens-modal' : 'opens-dropdown',
                    targetSelector: null,
                });
            }
            // Bootstrap toggles
            for (const el of document.querySelectorAll('[data-toggle], [data-bs-toggle]')) {
                const toggle = el.getAttribute('data-bs-toggle') ?? el.getAttribute('data-toggle');
                const targetSel = el.getAttribute('data-bs-target') ?? el.getAttribute('data-target') ?? el.getAttribute('href');
                let action = 'toggles';
                if (toggle === 'modal')
                    action = 'opens-modal';
                else if (toggle === 'dropdown')
                    action = 'opens-dropdown';
                else if (toggle === 'collapse')
                    action = 'expands-section';
                triggers.push({ triggerSelector: buildSelector(el), action, targetSelector: targetSel });
            }
            // <summary> elements (accordion trigger)
            for (const summary of document.querySelectorAll('summary')) {
                const details = summary.closest('details');
                triggers.push({
                    triggerSelector: buildSelector(summary),
                    action: 'expands-section',
                    targetSelector: details ? buildSelector(details) : null,
                });
            }
            return triggers;
        });
        // Build a stub ElementInfo for unmatched trigger selectors
        const stubElement = (selector) => ({
            selector,
            tag: 'unknown',
            category: 'focusable-other',
            role: null,
            ariaAttributes: {},
            textContent: '',
            accessibleName: '',
            isVisible: true,
            isFocusable: true,
            isDisabled: false,
            boundingBox: null,
            computedStyles: null,
            tabIndex: null,
            frameworkHints: {},
            inShadowDom: false,
            inIframe: false,
            frameId: 'main',
            eventListeners: [],
        });
        return rawTriggers.map((raw) => ({
            trigger: elements.find((el) => el.selector === raw.triggerSelector) ?? stubElement(raw.triggerSelector),
            action: raw.action,
            targetSelector: raw.targetSelector,
        }));
    }
    // ─── Tab Order Tracing ─────────────────────────────────────────────
    async traceTabOrder(page) {
        const focusableElements = await this.detector.detectFocusable(page);
        const orderedSelectors = await page.evaluate(() => {
            function buildSelector(el) {
                if (el.id)
                    return `#${CSS.escape(el.id)}`;
                const parts = [];
                let current = el;
                while (current && current !== document.documentElement) {
                    let part = current.tagName.toLowerCase();
                    if (current.id) {
                        parts.unshift(`#${CSS.escape(current.id)} > ${part}`);
                        break;
                    }
                    const parent = current.parentElement;
                    if (parent) {
                        const siblings = Array.from(parent.children).filter((c) => c.tagName === current.tagName);
                        if (siblings.length > 1) {
                            const index = siblings.indexOf(current) + 1;
                            part += `:nth-of-type(${index})`;
                        }
                    }
                    parts.unshift(part);
                    current = parent;
                }
                return parts.join(' > ');
            }
            const focusable = Array.from(document.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), ' +
                'select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), ' +
                'summary, [contenteditable="true"]'));
            // Positive tabindex first (ascending), then tabindex=0 / no tabindex in DOM order
            const withPositive = focusable
                .filter((el) => {
                const ti = el.getAttribute('tabindex');
                return ti !== null && parseInt(ti) > 0;
            })
                .sort((a, b) => parseInt(a.getAttribute('tabindex')) - parseInt(b.getAttribute('tabindex')));
            const withZeroOrNone = focusable.filter((el) => {
                const ti = el.getAttribute('tabindex');
                return ti === null || parseInt(ti) === 0;
            });
            const ordered = [...withPositive, ...withZeroOrNone];
            return ordered
                .filter((el) => {
                const style = window.getComputedStyle(el);
                return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
            })
                .map((el) => buildSelector(el));
        });
        const tabOrder = [];
        let lastY = -Infinity;
        for (let i = 0; i < orderedSelectors.length; i++) {
            const matched = focusableElements.find((el) => el.selector === orderedSelectors[i]);
            if (!matched)
                continue;
            const currentY = matched.boundingBox?.y ?? 0;
            const outOfVisualOrder = currentY < lastY - 50;
            lastY = currentY;
            tabOrder.push({ element: matched, order: i, outOfVisualOrder });
        }
        return tabOrder;
    }
    // ─── Landmark Detection ────────────────────────────────────────────
    async detectLandmarks(page) {
        return page.evaluate(() => {
            const landmarks = [];
            const landmarkRoles = ['banner', 'navigation', 'main', 'complementary', 'contentinfo', 'form', 'region', 'search'];
            function buildSelector(el) {
                if (el.id)
                    return `#${CSS.escape(el.id)}`;
                const tag = el.tagName.toLowerCase();
                const parent = el.parentElement;
                if (!parent)
                    return tag;
                const siblings = Array.from(parent.children).filter((c) => c.tagName === el.tagName);
                if (siblings.length > 1)
                    return `${tag}:nth-of-type(${siblings.indexOf(el) + 1})`;
                return tag;
            }
            // Explicit ARIA landmarks
            for (const role of landmarkRoles) {
                for (const el of document.querySelectorAll(`[role="${role}"]`)) {
                    landmarks.push({ role, selector: buildSelector(el), label: el.getAttribute('aria-label') ?? null });
                }
            }
            // Implicit landmarks from semantic HTML
            const implicitMap = {
                header: 'banner', nav: 'navigation', main: 'main',
                aside: 'complementary', footer: 'contentinfo', form: 'form', section: 'region',
            };
            for (const [tag, role] of Object.entries(implicitMap)) {
                for (const el of document.querySelectorAll(tag)) {
                    if (el.hasAttribute('role'))
                        continue;
                    if ((tag === 'section' || tag === 'form') && !el.getAttribute('aria-label') && !el.getAttribute('aria-labelledby'))
                        continue;
                    if ((tag === 'header' || tag === 'footer') && el.closest('article, aside, nav, section'))
                        continue;
                    landmarks.push({ role, selector: buildSelector(el), label: el.getAttribute('aria-label') ?? null });
                }
            }
            return landmarks;
        });
    }
    // ─── Flow Building ─────────────────────────────────────────────────
    /**
     * Build a keyboard navigation flow by analyzing tab order.
     */
    async buildTabFlow(page, url) {
        const tabOrder = await this.traceTabOrder(page);
        if (tabOrder.length === 0)
            return null;
        const issues = [];
        const outOfOrder = tabOrder.filter((n) => n.outOfVisualOrder);
        if (outOfOrder.length > 0) {
            issues.push(`${outOfOrder.length} element(s) appear out of visual order in the tab sequence`);
        }
        // Check for skip-nav link
        const firstTab = tabOrder[0];
        if (firstTab && !firstTab.element.textContent.toLowerCase().includes('skip')) {
            issues.push('First focusable element is not a skip-navigation link');
        }
        return {
            id: 'keyboard-tab-flow',
            name: 'Full keyboard tab navigation',
            pageUrl: url,
            interactions: tabOrder.map((node) => ({
                element: node.element,
                interactionType: 'keyboard',
                success: true,
                error: null,
                domDelta: {
                    addedSelectors: [],
                    removedSelectors: [],
                    changedSelectors: [],
                    urlChanged: false,
                    newUrl: null,
                    modalAppeared: false,
                    nodesAdded: 0,
                    nodesRemoved: 0,
                },
                timestamp: Date.now(),
            })),
            completed: true,
            issues,
        };
    }
}
//# sourceMappingURL=flow-analyzer.js.map