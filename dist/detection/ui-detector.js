/**
 * UIDetector — Detects all interactive elements on a Playwright page.
 *
 * Takes a Playwright Page, crawls the DOM (including shadow DOM and iframes),
 * and returns structured ElementInfo objects for every interactive element found.
 *
 * Owner: Bobbie (UI Expert)
 */
import { DEFAULT_CONFIG } from './types.js';
/** CSS selector targeting all common interactive elements */
const INTERACTIVE_SELECTORS = [
    'a[href]',
    'button',
    'input',
    'select',
    'textarea',
    '[role="button"]',
    '[role="link"]',
    '[role="checkbox"]',
    '[role="radio"]',
    '[role="slider"]',
    '[role="switch"]',
    '[role="tab"]',
    '[role="menuitem"]',
    '[role="menuitemcheckbox"]',
    '[role="menuitemradio"]',
    '[role="option"]',
    '[role="combobox"]',
    '[role="searchbox"]',
    '[role="spinbutton"]',
    '[role="textbox"]',
    '[role="treeitem"]',
    '[role="menu"]',
    '[role="tablist"]',
    '[role="dialog"]',
    '[role="alertdialog"]',
    '[role="listbox"]',
    '[role="tree"]',
    '[tabindex]',
    '[contenteditable="true"]',
    'summary',
    'details',
    '[onclick]',
    '[data-toggle]',
    '[data-bs-toggle]',
    '[data-action]',
].join(', ');
/** Map from tag+type/role to ElementCategory */
function categorizeElement(tag, type, role) {
    if (role) {
        const roleMap = {
            button: 'button',
            link: 'link',
            checkbox: 'checkbox',
            radio: 'radio',
            slider: 'slider',
            switch: 'toggle',
            tab: 'tab',
            menu: 'menu',
            menuitem: 'menu-item',
            menuitemcheckbox: 'menu-item',
            menuitemradio: 'menu-item',
            dialog: 'modal',
            alertdialog: 'modal',
            combobox: 'select',
            searchbox: 'search',
            textbox: 'text-input',
            spinbutton: 'slider',
            treeitem: 'menu-item',
            listbox: 'select',
            tablist: 'tab',
            option: 'select',
            navigation: 'navigation',
        };
        if (roleMap[role])
            return roleMap[role];
    }
    switch (tag) {
        case 'a':
            return 'link';
        case 'button':
            return 'button';
        case 'select':
            return 'select';
        case 'textarea':
            return 'textarea';
        case 'summary':
        case 'details':
            return 'accordion';
        case 'input': {
            const inputMap = {
                checkbox: 'checkbox',
                radio: 'radio',
                range: 'slider',
                submit: 'button',
                reset: 'button',
                button: 'button',
                search: 'search',
            };
            return inputMap[type ?? ''] ?? 'text-input';
        }
        default:
            return 'focusable-other';
    }
}
export class UIDetector {
    config;
    constructor(config = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
    }
    /**
     * Detect all interactive elements on the page.
     * Returns a flat array covering the main frame, shadow DOMs, and iframes.
     */
    async detectAll(page) {
        const elements = [];
        const mainElements = await this.detectInFrame(page.mainFrame(), false, 'main');
        elements.push(...mainElements);
        if (this.config.includeIframes) {
            const iframeElements = await this.detectInIframes(page);
            elements.push(...iframeElements);
        }
        if (elements.length > this.config.maxElementsPerPage) {
            return elements.slice(0, this.config.maxElementsPerPage);
        }
        return elements;
    }
    /**
     * Detect interactive elements within a single frame.
     */
    async detectInFrame(frame, inIframe, frameId) {
        const elements = [];
        try {
            const rawElements = await frame.evaluate(({ selectors, includeShadow }) => {
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
                function getAriaAttributes(el) {
                    const attrs = {};
                    for (const attr of el.getAttributeNames()) {
                        if (attr.startsWith('aria-') || attr === 'role') {
                            attrs[attr] = el.getAttribute(attr) ?? '';
                        }
                    }
                    return attrs;
                }
                function getAccessibleName(el) {
                    const ariaLabel = el.getAttribute('aria-label');
                    if (ariaLabel)
                        return ariaLabel.trim();
                    const labelledBy = el.getAttribute('aria-labelledby');
                    if (labelledBy) {
                        const parts = labelledBy
                            .split(/\s+/)
                            .map((id) => document.getElementById(id)?.textContent?.trim() ?? '')
                            .filter(Boolean);
                        if (parts.length)
                            return parts.join(' ');
                    }
                    if (el instanceof HTMLInputElement ||
                        el instanceof HTMLTextAreaElement ||
                        el instanceof HTMLSelectElement) {
                        if (el.id) {
                            const label = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
                            if (label)
                                return label.textContent?.trim() ?? '';
                        }
                    }
                    const title = el.getAttribute('title');
                    if (title)
                        return title.trim();
                    const placeholder = el.getAttribute('placeholder');
                    if (placeholder)
                        return placeholder.trim();
                    return (el.textContent ?? '').trim().substring(0, 200);
                }
                function getFrameworkHints(el) {
                    const hints = {};
                    for (const attr of el.getAttributeNames()) {
                        if (attr.startsWith('data-reactid') || attr.startsWith('data-testid'))
                            hints[attr] = el.getAttribute(attr) ?? '';
                        if (attr.startsWith('ng-') || attr.startsWith('_ngcontent') || attr.startsWith('data-ng'))
                            hints[attr] = el.getAttribute(attr) ?? '';
                        if (attr.startsWith('data-v-') || attr === 'v-bind' || attr === 'v-on')
                            hints[attr] = el.getAttribute(attr) ?? '';
                        if (attr.startsWith('data-component') || attr.startsWith('data-cy') || attr.startsWith('data-test'))
                            hints[attr] = el.getAttribute(attr) ?? '';
                    }
                    if (el.tagName.includes('-')) {
                        hints['custom-element'] = el.tagName.toLowerCase();
                    }
                    return hints;
                }
                function isElementVisible(el) {
                    const style = window.getComputedStyle(el);
                    if (style.display === 'none' ||
                        style.visibility === 'hidden' ||
                        style.opacity === '0')
                        return false;
                    const rect = el.getBoundingClientRect();
                    return rect.width > 0 && rect.height > 0;
                }
                function isElementFocusable(el) {
                    const tabIdx = el.getAttribute('tabindex');
                    if (tabIdx !== null && parseInt(tabIdx) < 0)
                        return false;
                    if (tabIdx !== null)
                        return true;
                    const focusableTags = ['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'SUMMARY'];
                    if (focusableTags.includes(el.tagName)) {
                        if (el.tagName === 'A' && !el.hasAttribute('href'))
                            return false;
                        return !el.disabled;
                    }
                    if (el.contentEditable === 'true')
                        return true;
                    return false;
                }
                function processElements(root, isShadow) {
                    let els;
                    try {
                        els = Array.from(root.querySelectorAll(selectors));
                    }
                    catch {
                        return;
                    }
                    for (const el of els) {
                        if (results.length >= 5000)
                            break;
                        const rect = el.getBoundingClientRect();
                        const style = window.getComputedStyle(el);
                        results.push({
                            selector: buildSelector(el),
                            tag: el.tagName.toLowerCase(),
                            type: el.getAttribute('type'),
                            role: el.getAttribute('role') ?? null,
                            ariaAttributes: getAriaAttributes(el),
                            textContent: (el.textContent ?? '').trim().substring(0, 200),
                            accessibleName: getAccessibleName(el),
                            isVisible: isElementVisible(el),
                            isFocusable: isElementFocusable(el),
                            isDisabled: el.hasAttribute('disabled') ||
                                el.getAttribute('aria-disabled') === 'true',
                            boundingBox: rect.width > 0
                                ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
                                : null,
                            computedStyles: {
                                display: style.display,
                                visibility: style.visibility,
                                opacity: style.opacity,
                                position: style.position,
                                zIndex: style.zIndex,
                                overflow: style.overflow,
                                fontSize: style.fontSize,
                                fontWeight: style.fontWeight,
                                color: style.color,
                                backgroundColor: style.backgroundColor,
                                cursor: style.cursor,
                                pointerEvents: style.pointerEvents,
                            },
                            tabIndex: el.hasAttribute('tabindex')
                                ? parseInt(el.getAttribute('tabindex'))
                                : null,
                            frameworkHints: getFrameworkHints(el),
                            inShadowDom: isShadow,
                            eventListeners: [],
                        });
                    }
                    // Recurse into shadow DOMs
                    if (includeShadow) {
                        const allElements = Array.from(root.querySelectorAll('*'));
                        for (const el of allElements) {
                            if (el.shadowRoot) {
                                processElements(el.shadowRoot, true);
                            }
                        }
                    }
                }
                processElements(document, false);
                return results;
            }, {
                selectors: INTERACTIVE_SELECTORS,
                includeShadow: this.config.includeShadowDom,
            });
            // Detect event listeners via CDP when available
            let listenerMap = new Map();
            if (this.config.detectEventListeners) {
                listenerMap = await this.detectEventListeners(frame);
            }
            for (const raw of rawElements) {
                const listeners = listenerMap.get(raw.selector) ?? [];
                elements.push({
                    selector: raw.selector,
                    tag: raw.tag,
                    category: categorizeElement(raw.tag, raw.type, raw.role),
                    role: raw.role,
                    ariaAttributes: raw.ariaAttributes,
                    textContent: raw.textContent,
                    accessibleName: raw.accessibleName,
                    isVisible: raw.isVisible,
                    isFocusable: raw.isFocusable,
                    isDisabled: raw.isDisabled,
                    boundingBox: raw.boundingBox,
                    computedStyles: raw.computedStyles,
                    tabIndex: raw.tabIndex,
                    frameworkHints: raw.frameworkHints,
                    inShadowDom: raw.inShadowDom,
                    inIframe,
                    frameId,
                    eventListeners: listeners,
                });
            }
        }
        catch (err) {
            console.warn(`[UIDetector] Error detecting in frame ${frameId}:`, err);
        }
        return elements;
    }
    /** Detect interactive elements inside all iframes on the page. */
    async detectInIframes(page) {
        const elements = [];
        const frames = page.frames();
        for (const frame of frames) {
            if (frame === page.mainFrame())
                continue;
            try {
                const frameUrl = frame.url();
                const frameId = frameUrl || `iframe-${frames.indexOf(frame)}`;
                const frameElements = await this.detectInFrame(frame, true, frameId);
                elements.push(...frameElements);
            }
            catch (err) {
                console.warn('[UIDetector] Error scanning iframe:', err);
            }
        }
        return elements;
    }
    /**
     * Use CDP to detect event listeners on elements.
     * Falls back gracefully if CDP is unavailable (e.g., Firefox).
     */
    async detectEventListeners(frame) {
        const map = new Map();
        try {
            const context = frame.page().context();
            const cdp = await context.newCDPSession?.(frame.page());
            if (!cdp)
                return map;
            const { root } = await cdp.send('DOM.getDocument', { depth: 0 });
            const { nodeIds } = await cdp.send('DOM.querySelectorAll', {
                nodeId: root.nodeId,
                selector: INTERACTIVE_SELECTORS,
            });
            for (const nodeId of nodeIds.slice(0, 500)) {
                try {
                    const { object } = await cdp.send('DOM.resolveNode', { nodeId });
                    const { listeners } = await cdp.send('DOMDebugger.getEventListeners', {
                        objectId: object.objectId,
                    });
                    if (listeners.length > 0) {
                        const { outerHTML } = await cdp.send('DOM.getOuterHTML', { nodeId });
                        const types = [...new Set(listeners.map((l) => l.type))];
                        const idMatch = outerHTML.match(/id="([^"]+)"/);
                        if (idMatch) {
                            map.set(`#${idMatch[1]}`, types);
                        }
                    }
                }
                catch {
                    // Individual node failures are expected
                }
            }
            await cdp.detach();
        }
        catch {
            // CDP unavailable — listeners remain empty
        }
        return map;
    }
    /** Returns only visible, focusable elements — for keyboard nav analysis. */
    async detectFocusable(page) {
        const all = await this.detectAll(page);
        return all.filter((el) => el.isFocusable && el.isVisible);
    }
    /** Detect only elements matching a specific category. */
    async detectByCategory(page, category) {
        const all = await this.detectAll(page);
        return all.filter((el) => el.category === category);
    }
}
//# sourceMappingURL=ui-detector.js.map