# Design Document

## Overview

This design document outlines the technical approach to fix the desktop layout compression bug in the NEXUS Scientific Calculator. The issue manifests as the entire interface being squeezed into a narrow left column on desktop screens, with overlapping content and large empty spaces. The root cause appears to be CSS conflicts introduced during recent mobile responsiveness fixes. This document proposes a systematic diagnosis and repair strategy that preserves the working mobile layout while restoring full-width desktop display.

## Architecture

### Current Architecture

The NEXUS calculator uses a CSS Grid-based layout system with responsive breakpoints:

**HTML Structure:**
```
<body>
  <div class="orb orb-1"></div> <!-- Background effects -->
  <div class="orb orb-2"></div>
  <div class="orb orb-3"></div>
  
  <div class="app-shell">
    <aside class="sidebar">...</aside>
    <main class="main-area">
      <header class="topbar">...</header>
      <div class="panels-wrapper">
        <div class="panel" id="panel-scientific">...</div>
        <div class="panel" id="panel-graphing">...</div>
        <!-- More panels... -->
      </div>
    </main>
  </div>
</body>
```

**CSS Architecture:**
1. Base styles (lines 1-1483): Desktop-first styling
2. Collapsed sidebar breakpoint (max-width: 1100px): Narrow sidebar mode
3. Hide history panel (max-width: 860px): Single column calculator
4. Mobile breakpoint (max-width: 680px): Complete mobile layout override
5. Tablet optimization (681-1024px): Tablet-specific adjustments
6. Additional utility breakpoints

**Key CSS Variables:**
- `--sidebar-w`: 200px (desktop) / 64px (collapsed) / 0px (mobile)
- `--topbar-h`: 60px (desktop) / 54px (mobile)

### Problem Analysis

Based on code inspection, the desktop layout compression likely stems from:

1. **CSS Specificity Conflicts**: Mobile styles may be leaking into desktop view due to incorrect media query boundaries or missing min-width constraints
2. **Width Constraint Issues**: Lingering max-width or width constraints on container elements
3. **Grid/Flex Misconfiguration**: `.app-shell` grid or `.main-area` flex properties may be overridden
4. **Syntax Errors**: CSS parsing errors causing cascade failures
5. **Z-index Stacking Issues**: Overlapping content suggests layering problems

## Components and Interfaces

### Component 1: CSS Diagnostic System

**Purpose:** Systematically identify all CSS errors and layout constraint issues

**Approach:**
1. **Structural Validation**
   - Verify brace matching throughout the file
   - Identify orphaned properties (properties without selectors)
   - Check for duplicate selectors or conflicting rules
   - Validate media query syntax

2. **Layout Constraint Audit**
   - Search for all `max-width`, `width`, `min-width` declarations
   - Identify constraints on: `.app-shell`, `.main-area`, `.panels-wrapper`, `.panel`, `.tool-layout`, `.sci-layout`
   - Check for inappropriate percentage or fixed widths
   - Validate grid-template-columns values

3. **Media Query Analysis**
   - Verify media query boundaries don't overlap incorrectly
   - Check that desktop styles aren't inside mobile breakpoints
   - Ensure mobile styles don't apply to desktop (missing min-width guards)

**Expected Errors to Find:**
- Orphaned CSS properties from previous edits
- Unclosed or extra braces
- Conflicting width constraints
- Media query boundary issues
- Specificity conflicts

### Component 2: Desktop Layout Restoration System

**Purpose:** Restore proper grid layout and full-width display on desktop screens

**Design Decisions:**

#### Decision 1: Grid Layout Fix
**Requirement:** FR-1 (Restore Desktop Full-Width Layout)

**Current State (Expected):**
```css
.app-shell {
  display: grid;
  grid-template-columns: var(--sidebar-w) 1fr;
  height: 100vh;
  overflow: hidden;
}
```

**Potential Issues:**
- Grid display being overridden to flex or block
- grid-template-columns being reset
- Conflict with mobile breakpoint leaking into desktop

**Solution:**
```css
/* Base (desktop) - lines ~148-156 */
.app-shell {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: var(--sidebar-w) 1fr;
  height: 100vh;
  overflow: hidden;
}

/* Mobile override - only inside @media (max-width: 680px) */
@media (max-width: 680px) {
  .app-shell {
    grid-template-columns: 1fr;
    grid-template-rows: auto 1fr auto;
  }
}
```

**Verification:** Ensure no other rules override `display: grid` or `grid-template-columns` outside mobile breakpoint.

#### Decision 2: Main Area Container Fix
**Requirement:** FR-1, FR-5

**Current State (Expected):**
```css
.main-area {
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
}
```

**Potential Issues:**
- Inappropriate width constraints (max-width, width: XX%)
- Missing flex: 1 to fill grid column
- Overflow settings hiding content

**Solution:**
Ensure `.main-area` has no width constraints and allows natural grid column expansion:
```css
.main-area {
  display: flex;
  flex-direction: column;
  min-width: 0; /* Allow flex shrinking below content size */
  overflow: hidden;
  /* NO max-width, NO width, NO flex constraints */
}
```

#### Decision 3: Panel Container Width Fix
**Requirement:** FR-5 (Fix Width Constraints)

**Containers to Audit:**
- `.panels-wrapper` - Should have no width constraints
- `.panel` - Should be `width: 100%` or no explicit width
- `.tool-layout` - Previously had `max-width: 760px` (removed)
- `.sci-layout` - Previously had `max-width: 600px` in tablet (removed)

**Solution Pattern:**
```css
/* Desktop base - allow full width */
.panels-wrapper {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  position: relative;
  /* NO max-width */
}

.panel {
  display: none;
  width: 100%; /* Full width of parent */
  height: 100%;
  overflow: auto;
  padding: 20px;
}

.tool-layout {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding-bottom: 24px;
  /* NO max-width - removed previously */
}
```

#### Decision 4: Tablet Breakpoint Fix
**Requirement:** FR-5.5 (Tablet displays properly without compression)

**Issue:** Tablet breakpoint (681-1024px) may have inherited problematic max-width constraints

**Current Tablet Block (lines 1809-1813):**
```css
@media (min-width: 681px) and (max-width: 1024px) {
  /* Tablet styles - no max-width restriction */
  .calc-buttons { gap: 8px; }
}
```

**Verification:** Ensure no max-width constraints on layout containers in this breakpoint.

### Component 3: Content Overlap Resolution System

**Purpose:** Fix z-index stacking and positioning issues causing overlapping content

**Root Causes of Overlap:**
1. Incorrect z-index values creating wrong stacking contexts
2. Absolute/fixed positioning without proper containment
3. Negative margins or transforms
4. Overflow hidden preventing scrolling
5. Grid/flex item positioning conflicts

**Solution Strategy:**

**Z-index Audit:**
```
Expected stacking order (lowest to highest):
0. Background orbs (z-index: 0)
1. App shell (z-index: 1)
5. Topbar (z-index: 5)
10. Sidebar (z-index: 10)
100. Mobile sidebar overlay (z-index: 100)
1000. Modals/drawers (z-index: 1000)
```

**Positioning Audit:**
- `.sidebar` - Should not overlap `.main-area` on desktop
- `.topbar` - Should be contained within `.main-area`
- `.panels-wrapper` - Should be positioned relative or static
- `.panel` - Should use normal flow, not absolute positioning
- Modals - Should be properly contained in portal/overlay elements

**Fix Pattern:**
```css
/* Ensure proper containment */
.app-shell {
  position: relative; /* Creates stacking context */
  z-index: 1;
}

.sidebar {
  position: relative; /* Not absolute on desktop */
  z-index: 10;
}

.main-area {
  position: relative; /* Not needed but harmless */
  z-index: auto; /* Allow natural stacking */
}

.panels-wrapper {
  position: relative;
  z-index: auto;
}

.panel {
  position: static; /* Normal flow */
  /* or */
  position: relative; /* If needed for absolute children */
}
```

### Component 4: Mobile Layout Preservation System

**Purpose:** Ensure mobile CSS remains completely unchanged

**Strategy:**
1. **No Direct Edits** - Do not modify any rules inside `@media (max-width: 680px)` block (lines 1484-1769)
2. **Specificity Protection** - Ensure desktop fixes don't have higher specificity that overrides mobile
3. **Cascade Protection** - Place desktop fixes before mobile breakpoint in source order
4. **Verification** - Test mobile layout before and after fixes to ensure identical behavior

**Protected Mobile Block:**
```css
@media (max-width: 680px) {
  /* Lines 1484-1769 */
  /* COMPLETELY OFF-LIMITS */
  /* NO MODIFICATIONS ALLOWED */
}
```

**Safe Desktop Fix Locations:**
1. Base styles (lines 1-1483)
2. Tablet breakpoint (lines 1809-1813) - cautiously
3. Other desktop-only breakpoints

## Data Models

### CSS Rule Inventory

**Rules Requiring Verification:**

| Selector | Property | Current Value | Expected Value | Line |
|----------|----------|---------------|----------------|------|
| `.app-shell` | `display` | `grid` | `grid` | ~149 |
| `.app-shell` | `grid-template-columns` | `var(--sidebar-w) 1fr` | `var(--sidebar-w) 1fr` | ~152 |
| `.main-area` | `display` | `flex` | `flex` | ~314 |
| `.main-area` | `max-width` | Should be none | none | ~314 |
| `.panels-wrapper` | `max-width` | Should be none | none | ~425 |
| `.panel` | `width` | `100%` | `100%` | ~433 |
| `.tool-layout` | `max-width` | Removed | none | ~887 |
| `.sci-layout` | `max-width` | Should be none (desktop) | none | ~456 |

### CSS Error Catalog

**Expected Error Types:**

1. **Orphaned Properties** - Properties without selectors
   - Detection: Properties appearing between closing braces without an opening selector
   - Fix: Remove or add proper selector

2. **Unmatched Braces** - Opening/closing brace count mismatch
   - Detection: Brace counting algorithm
   - Fix: Add or remove braces to balance

3. **Duplicate Selectors** - Same selector declared multiple times
   - Detection: Track selector appearances
   - Impact: Later rules override earlier (may be intentional)

4. **Invalid Property Values** - Malformed values
   - Detection: Browser DevTools console errors
   - Fix: Correct syntax

5. **Specificity Conflicts** - Rules fighting each other
   - Detection: Computed style doesn't match expected rule
   - Fix: Adjust specificity or use proper cascade order

## Interface Design

### CSS Module Organization

**Current Structure:**
```
style.css (~2800 lines)
├── CSS Variables (1-70)
├── Light Theme (71-93)
├── Base Resets (94-110)
├── Ambient Orbs (111-128)
├── Glass Surface Utilities (129-144)
├── App Shell (145-157)
├── Sidebar (158-311)
├── Main Area (312-453)
├── Scientific Calculator (454-883)
├── Tool Panels (884-1460)
├── Responsive Breakpoints (1461-1820)
├── History Features (1821-2000)
├── Settings & Modals (2001-2810)
└── Additional Responsive (2806-2810)
```

**Fix Organization Strategy:**
- Fixes should be applied in their respective sections
- Maintain current organization
- Do not reorganize or refactor
- Comment fixes clearly: `/* FIX: Desktop layout restoration */`

### Browser DevTools Interface

**Testing Protocol:**

1. **Desktop Testing (>1024px)**
   ```
   Open Chrome DevTools
   → Responsive Design Mode
   → Set viewport: 1920x1080
   → Inspect: .app-shell, .main-area, .panels-wrapper
   → Verify: grid-template-columns computed value
   → Check: No horizontal overflow
   ```

2. **Tablet Testing (681-1024px)**
   ```
   Set viewport: 768x1024
   → Verify: Layout scales properly
   → Check: No compression or overflow
   ```

3. **Mobile Testing (≤680px)**
   ```
   Set viewport: 375x667
   → Verify: Mobile layout identical to before fix
   → Test: Calculator buttons, navigation
   ```

## Implementation Plan

### Phase 1: Diagnostic Scan
**Estimated Complexity:** Low
**Files Modified:** None (read-only analysis)

**Tasks:**
1. Run structural CSS validation (brace matching, orphaned properties)
2. Catalog all width/max-width declarations on layout containers
3. Verify media query boundaries and overlaps
4. Document all findings with line numbers

**Deliverables:**
- Error report listing all CSS issues found
- Width constraint audit report
- Media query boundary analysis

### Phase 2: CSS Error Fixes
**Estimated Complexity:** Medium
**Files Modified:** `style.css`

**Tasks:**
1. Fix orphaned properties (remove or add selectors)
2. Balance unmatched braces
3. Remove or correct invalid syntax
4. Document each fix with inline comments

**Verification:**
- CSS validates without parse errors
- Browser console shows no CSS errors
- File brace count balances correctly

### Phase 3: Desktop Layout Restoration
**Estimated Complexity:** Medium
**Files Modified:** `style.css`

**Tasks:**
1. Verify/restore `.app-shell` grid properties (lines ~148-156)
2. Remove any width constraints on `.main-area` (line ~314)
3. Verify `.panels-wrapper` has no max-width (line ~425)
4. Verify `.panel` width: 100% (line ~433)
5. Confirm `.tool-layout` max-width removal (line ~887)
6. Verify `.sci-layout` has no desktop max-width (line ~456)
7. Add defensive comments to prevent regression

**Verification:**
- Desktop viewport shows full-width layout
- Sidebar + main-area properly proportioned
- No empty space on right side
- All panels display at full width

### Phase 4: Overlap Resolution
**Estimated Complexity:** Medium
**Files Modified:** `style.css`

**Tasks:**
1. Audit z-index values on all positioned elements
2. Check for absolute/fixed positioning causing overlaps
3. Verify overflow settings allow proper scrolling
4. Test all panels for visibility and positioning
5. Fix any sideways/rotated content

**Verification:**
- No content overlaps in any panel
- All sections fully visible
- Scrolling works where intended
- Z-index stacking correct

### Phase 5: Cross-Breakpoint Testing
**Estimated Complexity:** Medium
**Files Modified:** `style.css` (if issues found)

**Tasks:**
1. Test at 1920x1080 (large desktop)
2. Test at 1366x768 (laptop)
3. Test at 1024x768 (small desktop)
4. Test at 768x1024 (tablet)
5. Test at 375x667 (mobile) - verify unchanged
6. Test narrow edge cases (681px, 860px, 1100px)

**Verification:**
- All breakpoints display correctly
- Transitions between breakpoints smooth
- Mobile layout unchanged from before fix
- No horizontal overflow at any width

### Phase 6: Browser Compatibility Testing
**Estimated Complexity:** Low
**Files Modified:** None (unless browser-specific bugs found)

**Tasks:**
1. Test in Chrome/Edge (Chromium)
2. Test in Firefox
3. Test in Safari
4. Document any browser-specific issues
5. Apply fixes if needed (vendor prefixes, fallbacks)

**Verification:**
- Layout consistent across all browsers
- No browser-specific rendering bugs
- Vendor prefixes present where needed

## Testing Strategy

### Unit Testing (CSS Rule Level)

**Test Cases:**

1. **Grid Layout Test**
   - Open DevTools → Elements → Select `.app-shell`
   - Computed Styles → Verify `display: grid`
   - Computed Styles → Verify `grid-template-columns: 200px 1fr` (or `64px 1fr`)
   - Layout → Grid overlay should show 2 columns

2. **Width Constraint Test**
   - Inspect `.main-area` → Computed width should equal viewport width minus sidebar
   - Inspect `.panels-wrapper` → Should have no max-width
   - Inspect `.panel.active` → Width should equal parent container

3. **Mobile Preservation Test**
   - Set viewport to 375px width
   - Verify `.app-shell` → `grid-template-columns: 1fr`
   - Verify sidebar not visible
   - Verify mobile tab bar present
   - Compare to pre-fix screenshots

### Integration Testing (Full Layout Level)

**Test Scenarios:**

1. **Desktop Full-Width Scenario**
   - Window: 1920x1080
   - Expected: Sidebar 200px + main area 1720px
   - Verify: No empty space on right
   - Verify: Content centered and proportional

2. **Collapsed Sidebar Scenario**
   - Window: 1024x768
   - Expected: Sidebar 64px + main area 960px
   - Verify: Icons visible, text hidden
   - Verify: Main area expands to fill space

3. **Tablet Scenario**
   - Window: 768x1024
   - Expected: Sidebar 64px + main area 704px
   - Verify: No compression
   - Verify: Touch targets appropriately sized

4. **Mobile Scenario**
   - Window: 375x667
   - Expected: Identical to current working mobile layout
   - Verify: Calculator buttons, display, navigation unchanged

### Regression Testing

**Critical Paths:**

1. **Calculator Operations**
   - Enter numbers → verify display updates
   - Perform operations → verify calculations correct
   - Switch angle modes → verify calculations adjust
   - Use scientific functions → verify results

2. **Navigation**
   - Click each nav item → verify panels switch
   - Verify active state highlighting
   - Test mobile menu (on mobile)
   - Test tab bar (on mobile)

3. **Responsive Transitions**
   - Resize window from 1920px → 375px → 1920px
   - Verify layout adjusts smoothly
   - Verify no broken states at any size
   - Verify mobile-desktop transitions clean

## Security Considerations

**CSS Injection Risks:** None - static CSS file, no user input

**XSS via CSS:** Not applicable - no inline styles from user data

**Content Security Policy:** No changes to CSP - CSS modifications only

**Browser Security:** Ensure vendor prefixes don't introduce deprecated security issues (not expected)

## Performance Considerations

**CSS Parse Performance:** 
- Current file size: ~2800 lines
- Fix will not add significant rules
- Parse time impact: Negligible (<1ms)

**Render Performance:**
- Grid layout is GPU-accelerated (no performance impact)
- Removing unnecessary max-width may slightly improve layout calculation
- No new backdrop-filters or expensive properties added

**Memory Impact:**
- CSS fixes do not increase memory footprint
- No new DOM elements created

**Optimization Opportunities:**
- Could combine duplicate rules (out of scope)
- Could minify for production (out of scope)

## Deployment Strategy

### Pre-Deployment

1. **Local Testing**
   - Test all fixes on local dev server
   - Verify all acceptance criteria met
   - Document all changes made

2. **Code Review**
   - Review changes with user
   - Explain each fix and rationale
   - Get approval before commit

3. **Commit Strategy**
   ```bash
   git add style.css
   git commit -m "Fix desktop layout compression issues

   - Fix CSS syntax errors (orphaned properties, braces)
   - Remove width constraints causing desktop compression
   - Restore full-width grid layout on desktop screens
   - Fix content overlap and z-index stacking
   - Preserve working mobile layout unchanged
   
   Fixes: Desktop layout compressed into left column
   Tested: Chrome, Firefox, Safari on desktop/tablet/mobile"
   ```

### Deployment

1. **Push to Repository**
   ```bash
   git push origin main
   ```

2. **Vercel Auto-Deploy**
   - Vercel detects push to main branch
   - Triggers automatic build and deploy
   - Deployment typically completes in 1-2 minutes

3. **Deployment Verification**
   - Wait for Vercel deployment success notification
   - Visit production URL
   - Perform hard refresh (Ctrl+Shift+R / Cmd+Shift+R)
   - Quick smoke test on desktop and mobile

### Post-Deployment

1. **Production Testing**
   - Test on actual desktop/laptop device
   - Test on actual mobile device
   - Verify layout across all breakpoints
   - Check DevTools console for errors

2. **User Acceptance**
   - User confirms desktop layout restored
   - User confirms mobile layout unchanged
   - User confirms no overlapping content
   - User confirms functionality working

3. **Monitoring**
   - Check for any error reports
   - Monitor analytics for unusual behavior
   - Be ready for quick rollback if needed

### Rollback Plan

If critical issues discovered post-deployment:

```bash
# Revert to previous commit
git revert HEAD
git push origin main

# Or force rollback
git reset --hard HEAD~1
git push --force origin main
```

**Rollback Criteria:**
- Mobile layout broken
- Desktop layout worse than before
- Functionality broken
- Cross-browser critical issues

## Assumptions and Constraints

### Assumptions

1. **HTML is correct** - No HTML structure changes needed
2. **JavaScript is correct** - No JS manipulating styles incorrectly
3. **User has 7+ CSS errors** - Based on user report
4. **Original design was correct** - Desktop layout worked before recent mobile fixes
5. **Cache will be cleared** - User will perform hard refresh for testing

### Constraints

1. **CSS-only modifications** - Cannot change HTML or JavaScript
2. **Mobile CSS immutable** - Cannot modify `@media (max-width: 680px)` block
3. **No design changes** - Must maintain existing visual design
4. **No new dependencies** - Cannot add CSS frameworks or preprocessors
5. **No refactoring** - Cannot reorganize or optimize unrelated code
6. **Backward compatibility** - Must support modern browsers only (no IE11)

### Technical Limitations

1. **Cannot test on actual devices** - Testing relies on browser DevTools responsive mode
2. **Cannot access Vercel preview** - Must push to production for deployment testing
3. **Cannot see user's exact symptoms** - Working from description, not screenshots
4. **Limited debugging information** - No error logs or console outputs from user

## Success Metrics

### Quantitative Metrics

1. **CSS Errors Fixed:** ≥7 syntax errors identified and corrected
2. **Width Constraints Removed:** All inappropriate max-width on layout containers eliminated
3. **Layout Measurements:**
   - Desktop (1920px viewport): `.app-shell` width = 1920px
   - Desktop (1920px viewport): `.main-area` computed width = ~1720px (1920 - 200)
   - Tablet (768px viewport): Full width utilized without compression
   - Mobile (375px viewport): Layout identical to pre-fix

4. **Zero Regressions:** 
   - 0 broken features
   - 0 mobile layout changes
   - 0 console errors

### Qualitative Metrics

1. **Visual Quality:**
   - Desktop layout appears full-width and properly proportioned
   - No visible empty spaces on right side
   - Content properly aligned and centered
   - No overlapping elements

2. **User Experience:**
   - Layout feels natural and expected
   - Transitions between breakpoints smooth
   - All interactive elements accessible
   - No unexpected scrollbars

3. **Code Quality:**
   - Fixes clearly commented
   - CSS maintains readability
   - Changes minimal and targeted
   - Future maintainability preserved

## Glossary

- **Grid container** - Element with `display: grid` (`.app-shell`)
- **Grid item** - Direct child of grid container (`.sidebar`, `.main-area`)
- **Flex container** - Element with `display: flex` (`.main-area`, `.tool-layout`)
- **Breakpoint** - Media query width threshold where styles change
- **Stacking context** - Z-index layering boundary created by positioning/opacity
- **Layout thrashing** - Repeated forced reflows causing performance issues (not applicable here)
- **Specificity** - CSS rule priority based on selector weight
- **Cascade** - Order-dependent rule application in CSS
- **Computed style** - Final style value after all CSS rules applied
- **Vendor prefix** - Browser-specific CSS property prefix (-webkit-, -moz-, etc.)

## Appendix

### Appendix A: CSS Syntax Error Patterns

**Pattern 1: Orphaned Properties**
```css
/* WRONG */
.selector {
  property: value;
}
  another-property: value; /* Orphaned - no selector */

/* RIGHT */
.selector {
  property: value;
  another-property: value;
}
```

**Pattern 2: Unmatched Braces**
```css
/* WRONG */
.selector {
  property: value;
}} /* Extra closing brace */

/* RIGHT */
.selector {
  property: value;
}
```

**Pattern 3: Property Outside Selector**
```css
/* WRONG */
display: flex; /* No selector */
.selector {
  property: value;
}

/* RIGHT */
.selector {
  display: flex;
  property: value;
}
```

### Appendix B: Media Query Boundaries Reference

```css
/* Mobile: 0-680px */
@media (max-width: 680px) { ... }

/* Tablet: 681-1024px */
@media (min-width: 681px) and (max-width: 1024px) { ... }

/* Desktop: 1025px+ (no media query, base styles) */

/* Collapsed sidebar: 0-1100px */
@media (max-width: 1100px) { --sidebar-w: 64px; }

/* Hide history: 0-860px */
@media (max-width: 860px) { .sci-history-panel { display: none; } }
```

### Appendix C: Container Hierarchy

```
.app-shell (grid)
├── .sidebar (grid item 1)
└── .main-area (grid item 2, flex container)
    ├── .topbar (flex item)
    └── .panels-wrapper (flex item, flex: 1)
        └── .panel (absolute/relative positioning)
            └── .tool-layout or .sci-layout (content containers)
```

### Appendix D: Critical CSS Lines Reference

| Line Range | Section | Modification Risk |
|------------|---------|-------------------|
| 1-93 | Variables & Theme | Low - no changes expected |
| 148-156 | App Shell | **High** - primary fix location |
| 161-311 | Sidebar | Medium - check z-index |
| 314-453 | Main Area | **High** - check width constraints |
| 454-883 | Scientific Calc | Medium - check .sci-layout |
| 884-1460 | Tool Panels | Medium - verify .tool-layout |
| 1484-1769 | Mobile Breakpoint | **OFF-LIMITS** - no changes |
| 1809-1813 | Tablet Breakpoint | Medium - verify no max-width |


### Appendix E: Browser DevTools Commands Reference

**Chrome/Edge DevTools:**
```javascript
// Check computed grid values
getComputedStyle(document.querySelector('.app-shell')).display
getComputedStyle(document.querySelector('.app-shell')).gridTemplateColumns

// Check for horizontal overflow
document.body.scrollWidth > window.innerWidth

// Get all elements with max-width
Array.from(document.querySelectorAll('*')).filter(el => 
  getComputedStyle(el).maxWidth !== 'none'
).map(el => ({ el, maxWidth: getComputedStyle(el).maxWidth }))
```

**Firefox DevTools:**
```javascript
// Grid inspector
// Right-click .app-shell → Inspect → Layout tab → Grid section

// Check z-index stacking
// 3D View → Shows layer ordering
```


## Correctness Properties

### Property 1: Grid Layout Integrity

**Description:** The .app-shell container must maintain CSS Grid display with proper column configuration on all desktop viewports.

**Formal Specification:**
```
FORALL viewports WHERE width > 680px:
  .app-shell.display === 'grid' AND
  .app-shell.gridTemplateColumns === 'var(--sidebar-w) 1fr'
```

**Verification:**
- Inspect .app-shell in DevTools → Computed Styles
- Verify display property equals "grid"
- Verify grid-template-columns equals "200px 1fr" or "64px 1fr" depending on breakpoint

**Rationale:** The two-column grid layout is fundamental to the desktop interface structure. Without it, the sidebar and main area cannot position correctly.

### Property 2: Full-Width Coverage

**Description:** The combined width of sidebar and main area must fully utilize the viewport width without exceeding it (no horizontal overflow).

**Formal Specification:**
```
FORALL viewports WHERE width > 680px:
  (.sidebar.width + .main-area.width) >= viewport.width AND
  document.body.scrollWidth <= viewport.width
```

**Verification:**
```javascript
const sidebar = document.querySelector('.sidebar');
const mainArea = document.querySelector('.main-area');
const totalWidth = sidebar.offsetWidth + mainArea.offsetWidth;
const hasOverflow = document.body.scrollWidth > window.innerWidth;
console.log({ totalWidth, viewportWidth: window.innerWidth, hasOverflow });
// totalWidth should equal viewportWidth, hasOverflow should be false
```

**Rationale:** This ensures the layout fills the screen without compression (empty space) or overflow (horizontal scrollbar).

### Property 3: Mobile Layout Preservation

**Description:** All CSS rules and computed styles within the mobile breakpoint must remain unchanged after applying desktop fixes.

**Formal Specification:**
```
FORALL viewports WHERE width <= 680px:
  FORALL elements e in DOM:
    computed_styles(e, after_fix) === computed_styles(e, before_fix)
```

**Verification:**
- Compare mobile breakpoint CSS block line-by-line (should be identical)
- Take screenshots at 375px viewport before and after fix
- Perform pixel-perfect comparison or visual inspection

**Rationale:** The mobile layout is working correctly and must not be disrupted. Any change to mobile styles violates requirements.

### Property 4: No Content Overlap

**Description:** No visible elements may overlap except in explicit parent-child or z-index layered relationships.

**Formal Specification:**
```
FORALL elements e1, e2 in visible_elements WHERE e1 ≠ e2:
  NOT (e1.boundingRect intersects e2.boundingRect) OR
  (e1 is_ancestor_of e2) OR 
  (e2 is_ancestor_of e1) OR
  (e1.role === 'modal' AND e1.zIndex > e2.zIndex)
```

**Verification:**
- Visual inspection: No content appears to cover other content
- DevTools 3D View: Elements should layer correctly
- Test all panels: Calculator, Graphing, Solver, Calculus, Statistics, Matrix, Converter, Physics

**Rationale:** Overlapping content makes interface elements inaccessible and indicates positioning or z-index errors.

### Property 5: Container Hierarchy Integrity

**Description:** The DOM structure and CSS containment hierarchy must remain intact with proper parent-child relationships.

**Formal Specification:**
```
.app-shell contains (.sidebar AND .main-area) AND
.main-area contains (.topbar AND .panels-wrapper) AND
.panels-wrapper contains (.panel elements)

WHERE contains means: child is within parent's bounding box and 
                      parent provides layout context for child
```

**Verification:**
```javascript
const verifyHierarchy = () => {
  const appShell = document.querySelector('.app-shell');
  const sidebar = document.querySelector('.sidebar');
  const mainArea = document.querySelector('.main-area');
  const topbar = document.querySelector('.topbar');
  const panelsWrapper = document.querySelector('.panels-wrapper');
  
  return {
    sidebarInShell: appShell.contains(sidebar),
    mainAreaInShell: appShell.contains(mainArea),
    topbarInMain: mainArea.contains(topbar),
    panelsInMain: mainArea.contains(panelsWrapper)
  };
};
```

**Rationale:** Proper hierarchy ensures CSS cascade, layout calculation, and event handling work correctly.

### Property 6: CSS Syntax Validity

**Description:** The CSS file must parse without errors and have balanced braces.

**Formal Specification:**
```
brace_count(style.css) = 0 AND
no_orphaned_properties(style.css) = true AND
browser.console.errors(type='CSS') = []
```

**Verification:**
```bash
# Brace balance
awk 'BEGIN{c=0} /{/{c++} /}/{c--} END{print c}' style.css
# Should output: 0

# Browser console
# Open DevTools → Console → Filter by "Errors"
# Should show: 0 CSS parse errors
```

**Rationale:** CSS parse errors can cause the entire stylesheet or portions of it to be ignored, breaking layout rendering.

### Property 7: Responsive Continuity

**Description:** Layout transitions smoothly across all breakpoints with no broken intermediate states.

**Formal Specification:**
```
FORALL width w in [375px, 1920px]:
  layout(w) is_valid AND
  transition(w, w+1) is_smooth
  
WHERE is_valid means: no overlap, no overflow, fully functional
      is_smooth means: no sudden jumps, no broken layouts
```

**Verification:**
- Slowly resize browser window from 375px to 1920px
- Observe at critical points: 680px, 681px, 860px, 1024px, 1100px
- Verify no "broken" states appear during transition

**Rationale:** Users may resize windows or use various device sizes. The layout must work at all widths, not just specific test sizes.
## Error Handling

### CSS Parse Errors

**Error Class:** Syntax Errors

**Detection:**
- Browser DevTools Console shows CSS parse errors
- `validate_spec_format` tools report issues
- Manual brace counting shows imbalance

**Handling Strategy:**
1. Identify exact line number from error message
2. Examine surrounding context (10 lines before/after)
3. Apply appropriate fix pattern (see Appendix A)
4. Re-validate until error cleared
5. Document fix in commit message

**Prevention:**
- Use syntax-aware editor (VSCode with CSS linting)
- Run validation before committing
- Review changes carefully

### Layout Regression Errors

**Error Class:** Visual/Layout Issues

**Detection:**
- Desktop layout still compressed after fix
- Mobile layout changed unexpectedly
- Content overlapping or hidden
- Horizontal scrollbar appears

**Handling Strategy:**
1. **Desktop Compression Persists:**
   - Check if fix was actually applied (view source)
   - Clear browser cache (hard refresh)
   - Inspect computed styles in DevTools
   - Verify no other rules overriding with higher specificity
   - Check if media query boundaries are correct

2. **Mobile Layout Changed:**
   - IMMEDIATELY REVERT changes
   - Review what was modified
   - Ensure changes were only outside mobile breakpoint
   - Re-apply fixes more carefully with mobile block protected

3. **Content Overlapping:**
   - Identify overlapping elements in DevTools
   - Check z-index values and stacking contexts
   - Verify positioning (absolute/relative/fixed)
   - Adjust z-index or positioning as needed

4. **Horizontal Overflow:**
   - Identify overflowing element: `document.querySelector('*').scrollWidth`
   - Check for: fixed widths, excessive padding, transforms
   - Apply `overflow-x: hidden` as last resort (prefer fixing root cause)

**Recovery:**
```bash
# If catastrophic failure
git diff style.css  # Review what changed
git checkout style.css  # Revert to last good state
# Re-apply fixes one at a time, testing after each
```

### Deployment Errors

**Error Class:** Production Issues

**Detection:**
- Vercel build fails
- Deployed site shows issues not seen locally
- User reports broken layout

**Handling Strategy:**
1. **Build Failure:**
   - Check Vercel build logs
   - Verify file encoding and line endings
   - Ensure no invalid characters in CSS
   - Re-deploy after fixing

2. **Production Differs from Local:**
   - Verify Vercel deployed latest commit
   - Check if CDN cache needs clearing
   - Ensure user performed hard refresh
   - Compare deployed CSS to local file

3. **User Reports Issues:**
   - Gather details: browser, OS, screen size, specific symptoms
   - Attempt to reproduce locally
   - Check browser DevTools remotely if possible
   - Apply hotfix if critical, or schedule proper fix

**Rollback Procedure:**
```bash
# Emergency rollback
git revert HEAD
git push origin main
# Vercel auto-deploys the revert

# Or use Vercel UI: Deployments → Previous Deployment → Promote to Production
```

### Browser Compatibility Errors

**Error Class:** Cross-Browser Issues

**Detection:**
- Layout works in Chrome but not Firefox/Safari
- Vendor prefix missing
- CSS property not supported

**Handling Strategy:**
1. **Identify Browser-Specific Issue:**
   - Test in problematic browser's DevTools
   - Check computed styles
   - Look for unsupported properties or values

2. **Apply Fixes:**
   - Add vendor prefixes where needed: `-webkit-`, `-moz-`
   - Provide fallback values: `display: flex; display: grid;`
   - Use feature queries: `@supports (display: grid) { ... }`

3. **Verify:**
   - Re-test in all target browsers
   - Document browser-specific fixes
   - Consider graceful degradation if needed

**Browser Support Matrix:**
| Browser | Min Version | Grid Support | Backdrop Filter |
|---------|-------------|--------------|-----------------|
| Chrome  | 90+         | ✅ Yes       | ✅ Yes          |
| Firefox | 88+         | ✅ Yes       | ✅ Yes          |
| Safari  | 14+         | ✅ Yes       | ✅ Yes (-webkit) |
| Edge    | 90+         | ✅ Yes       | ✅ Yes          |

### Error Prevention Checklist

Before committing fixes:

- [ ] CSS validates without parse errors
- [ ] All braces balanced (run validation script)
- [ ] No orphaned properties detected
- [ ] Desktop layout tested at 3+ viewport sizes
- [ ] Mobile layout tested and verified unchanged
- [ ] Tablet breakpoints tested
- [ ] No horizontal overflow at any size
- [ ] No console errors in DevTools
- [ ] All panels accessible and display correctly
- [ ] Calculator functionality works
- [ ] Changes reviewed and documented
- [ ] Commit message descriptive and complete

### Monitoring and Alerting

**Post-Deployment Monitoring:**

1. **Immediate (0-1 hour):**
   - Manual smoke test on production URL
   - Check browser console for errors
   - Quick test on mobile and desktop devices

2. **Short-term (1-24 hours):**
   - Monitor for user reports or complaints
   - Check analytics for unusual bounce rates
   - Review any error logging systems

3. **Long-term (1-7 days):**
   - Confirm no regression reports
   - Validate analytics show normal engagement
   - Consider fix successful if no issues emerge

**Alert Triggers:**
- CSS parse errors in browser console
- Horizontal scrollbar appearing unexpectedly
- User reports of layout issues
- Analytics showing increased bounce rate
- Functionality broken (calculator not working)

**Response Plan:**
- **Severity 1 (Critical):** Mobile layout broken, functionality broken → IMMEDIATE ROLLBACK
- **Severity 2 (High):** Desktop layout still broken, major visual issues → Hotfix within 1 hour
- **Severity 3 (Medium):** Minor visual issues, one browser broken → Fix within 24 hours
- **Severity 4 (Low):** Edge case issues, cosmetic problems → Fix in next update cycle
