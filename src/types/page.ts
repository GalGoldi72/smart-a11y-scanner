/**
 * Page and element types — barrel re-exports.
 *
 * Canonical sources:
 *   - Page/element detection types → detection/types.ts (Bobbie)
 *   - Page metadata & links → scanner/types.ts (Naomi)
 *
 * Import from here for convenience; own nothing.
 */

export type {
  ElementInfo,
  BoundingBox,
  ComputedStyles,
  ElementCategory,
  AriaAttributes,
} from '../detection/types.js';

export type {
  PageMetadata,
  PageLink,
} from '../scanner/types.js';
