# Restate design language and application plan

Status: design audit and implementation plan  
Observed: September 19, 2026  
Scope: the public Restate marketing site and documentation experience

## Purpose

This document describes the visual and content system currently expressed across Restate's public web properties, then turns those findings into an implementation plan for Break My Agent.

This is an observational guide, not an official Restate brand manual. Exact values below come from computed styles on the live pages where possible. Product copy, illustrations, logos, and proprietary fonts should only be used with the appropriate permission and source files.

## Sources and method

The audit covered four public surfaces:

- [Restate homepage](https://restate.dev/) for the primary brand, hero, navigation, diagrams, proof sections, accordions, and calls to action.
- [Pricing](https://restate.dev/pricing) for card hierarchy, selected states, segmentation, and dense comparison layouts.
- [Developer Blog](https://restate.dev/blog) for editorial cards, tags, metadata, and long-form hierarchy.
- [Use Cases](https://restate.dev/use-cases) for customer proof, logo cards, and repeated section rhythm.
- [Restate documentation](https://docs.restate.dev/) for the denser developer-product layer: side navigation, search, active states, technical prose, and utility controls.

The analysis used desktop and mobile layouts, accessibility structure, and computed CSS. The marketing site and documentation are related but distinct systems. The documentation is hosted with Mintlify and uses a different type stack. It is useful as a reference for information density and interaction patterns; it should not replace the marketing system as the main visual source.

## Executive summary

Restate's marketing design communicates calm infrastructure confidence. A pale blue canvas, deep blue headings, a small number of high-chroma blue actions, and large areas of whitespace make technical claims feel controlled and credible. The site rarely relies on decorative chrome. It creates hierarchy through type scale, spacing, and contrast.

The system has five recurring traits:

1. **Editorial scale.** Headlines are large, light in weight, tightly tracked, and given room to breathe.
2. **Technical precision.** Claims are followed by concrete mechanisms, diagrams, metrics, customer evidence, or code.
3. **Low-chrome surfaces.** Cards use white fills, fine borders, 12–16px radii, and very small shadows.
4. **Concentrated color.** Bright blue is reserved for actions, highlights, selected states, and diagram emphasis.
5. **Two density modes.** Marketing pages are spacious and narrative. Documentation is compact and task-oriented.

For Break My Agent, the strongest translation is a **Restate light shell with a dark runtime island**. The shell should use the marketing palette, typography hierarchy, navigation, cards, and generous composition. The live execution and journal should use a compact dark surface with mono details, borrowing the information density of the documentation. This keeps the demo recognizably Restate while preserving the drama and scanability of a live failure console.

## Design principles

### Calm around failure

Restate sells reliability, so the default state feels stable. The page background is quiet, cards are orderly, and the layout changes little as content updates. Error color appears locally around the disruption. The surrounding interface remains calm.

Break My Agent should follow the same rule. A killed worker can produce a clear red event and an explicit baseline consequence without turning the whole page red or shifting major regions.

### Evidence follows the claim

Marketing copy introduces a benefit, then quickly shows architecture, code, a metric, or a customer outcome. The site avoids making visitors infer the value from decoration.

The demo should state the durable result in plain language and show the observed evidence beside it:

- the invocation ID remained the same;
- a replacement worker continued the handler;
- completed journaled operations were reused;
- the tool effect occurred once;
- the answer was delivered.

The event history remains supporting detail rather than the only place where the story is understandable.

### One primary action per region

Restate pages use a strong blue primary action and a quiet secondary action. Navigation, pricing cards, and final calls to action all keep this pattern.

The demo should make **Run agent** the primary action in the composer. Failure controls are the primary actions of the next region. Lifecycle controls and links use quieter treatments.

### Structure through rhythm

Restate relies on predictable spacing more than separators. Major sections have large vertical gaps; content inside cards uses a smaller, regular rhythm. Headings, descriptions, proof, and actions retain the same order across repeated components.

### Technical without looking like a terminal

The brand uses code and diagrams as proof, but the overall site remains editorial. Mono type is limited to code, identifiers, compact metadata, and labels.

Break My Agent should use mono type for invocation IDs, worker PIDs, event times, HTTP status codes, and journal indexes. Explanations and outcomes stay in the sans-serif body face.

## Foundations

### Marketing color system

The following values are exposed by the live marketing site's CSS or computed styles.

| Role | Observed value | Use in Break My Agent |
| --- | --- | --- |
| Page canvas | `#f5f8fc` | Main page background |
| Brand blue | `oklch(29.59% 0.1713 263.99)` | Display headings, important labels, durable identity |
| Brand blue fallback | `#001880` | Fallback for environments where a hex token is preferred |
| Medium blue | `#2064fa` | Gradients and prominent graphic accents |
| Action blue | `#3258ff` | Primary buttons, links, focus, selected controls |
| Accent teal | `#356e7e` | Secondary diagrams or supporting data |
| Pale blue surface | `#d3eff7` | Durable result panels and explanatory callouts |
| Blue border | `#b6d8e1` | Selected cards and branded panels |
| Neutral border | `#dee0e3` | Default card, field, and secondary-button borders |
| Light border | `#e5e7eb` | Internal dividers |
| Text dark | `#14151a` | Main body and control text |
| Text primary | `oklch(19.69% 0.0101 276.49)` | High-emphasis UI copy |
| Text secondary | `oklch(37.3% 0.034 259.733)` | Descriptions and metadata |
| Paper | `oklch(97% 0.014 254.604)` | Alternate very-light branded surface |
| White | `#ffffff` | Cards and secondary actions |

The floating navigation uses a near-black translucent vertical gradient. Its computed gradient is approximately `oklab(0.21 0.0016 -0.0058 / 0.9)` to the same color at `0.8` alpha. A practical local token is `rgba(31, 32, 36, 0.92)` with a subtle lighter lower edge.

The public pages do not establish a full product-semantic palette for the demo's failure states. Break My Agent should add its own restrained semantic tokens:

| Role | Proposed value | Use |
| --- | --- | --- |
| Success | `#198754` | Completed and recovered |
| Success surface | `#eaf7ef` | Durable completion background |
| Warning | `#a46600` | Waiting, latency, and pause |
| Warning surface | `#fff6df` | Pending explanation |
| Danger | `#c53b3f` | Crash, 429, 500, cancellation, terminal failure |
| Danger surface | `#fff0f0` | Baseline consequence and applied fault |
| Runtime canvas | `#15161a` | Execution evidence panel |
| Runtime surface | `#1d1f24` | Runtime cards and journal rows |
| Runtime border | `rgba(255,255,255,0.10)` | Dividers inside the runtime panel |

Semantic color always accompanies a word, icon, or state label.

### Typography

#### Marketing stack

| Role | Observed family | Observed usage |
| --- | --- | --- |
| Display and editorial headings | `Stack Sans Headline` | Hero, page titles, section headings, card titles |
| Body and UI | `Inter` | Navigation, paragraphs, buttons, metadata |
| Decorative display | `Stack Sans Notch` | Selected expressive brand moments |
| Code | `JetBrains Mono` | Code examples and technical values |

Observed marketing sizes at a 1280px desktop viewport:

| Element | Size / line height | Weight and treatment |
| --- | --- | --- |
| Homepage hero | `60px / 60px` | 400, `-1.5px` tracking |
| Interior page title | `48px / 48px` | 400 |
| Large section heading | `48px / 55.68px` | 400 |
| Section heading | `30px / 36px` | 400 |
| Card heading | `20px / 27.5px` | 400 |
| Body | `16px / 24px` | 400 |
| Button | `14px / 20px` | 500 |
| Tag | `12px / 16px` | 500 |

On the observed 390px mobile layout, the homepage hero is `48px / 48px`. It wraps into short, intentional lines and stays center aligned.

#### Documentation stack

The documentation uses `Rubik` for major headings and `Manrope` for body/UI text. The observed page title is `36px / 40px`, weight 600; body text is `16px / 24px`; sidebar links are `14px / 24px`. This denser stack is useful as a behavioral reference for the runtime panel, but adding a third and fourth font family to this demo would create unnecessary overhead.

#### Font implementation rule

Use supplied, licensed font files if they exist. Do not copy or hotlink Restate's production font assets. Until brand assets are supplied:

```css
--font-display: "Stack Sans Headline", Inter, ui-sans-serif, system-ui, sans-serif;
--font-body: Inter, ui-sans-serif, system-ui, sans-serif;
--font-mono: "JetBrains Mono", "SFMono-Regular", Consolas, monospace;
```

The hierarchy matters more than an unlicensed exact font match. Keep display headings at regular weight; the current app's very bold hero is less consistent with Restate's voice.

### Spacing and layout

- The base spacing unit is `4px`.
- Common control padding is `8px 20px`.
- Marketing cards commonly use `24px` internal padding.
- Major page sections often use `96–128px` of vertical separation.
- The common content maximum is `72rem` (`1152px`).
- At 1280px, the marketing header occupies about `1180px`, begins `50px` from the left edge, and is `50px` tall.
- Interior hero copy often uses a narrower centered measure of roughly `56rem` (`896px`).
- Body paragraphs should stay near `60–72ch` for long-form readability.

Break My Agent is an interactive demo, so its vertical rhythm should be tighter than the marketing site. Use `64–80px` between major story regions and `20–32px` inside operational panels. This preserves the character of the source while keeping controls and evidence visible during a live presentation.

### Radius, borders, and elevation

Observed radius tokens include `4px`, `6px`, `8px`, `16px`, and `24px`.

- Floating navigation: `16px` radius.
- Marketing and pricing cards: `12–16px` radius.
- Buttons: `12px` radius.
- Pills and tags: fully rounded.
- Default border: one pixel, cool gray or pale blue.
- Blog card shadow: approximately `0 1px 2px` at 5% dark alpha.
- Pricing card shadow: approximately `0 1px 3px` at 6% dark alpha.

Surfaces should not use large, smoky shadows. Hierarchy comes from fill, border, spacing, and content.

### Motion

The marketing system exposes a base transition of `150ms` with `cubic-bezier(0.4, 0, 0.2, 1)`. Interaction is restrained:

- buttons change gradient, fill, or shadow;
- cards can rise by about one pixel;
- accordions reveal content without large layout theatrics;
- diagrams carry the richer motion while core UI remains stable.

For the demo, reserve animation for state change: fault armed, worker lost, recovery observed, completion. Use opacity and small translation, keep the event region anchored, and honor `prefers-reduced-motion`.

## Component grammar

### Floating navigation

The marketing navigation is a dark rounded capsule floating eight pixels below the viewport edge. At 1280px it has a 16px radius, 8px internal padding, white navigation text, a muted translucent secondary action, and a white login action. Mobile collapses the links to a logo and menu button.

Application:

- Use the Break My Agent wordmark on the left.
- Keep runtime health on the right as compact indicators.
- Allow health details to wrap into a second row or disclosure on narrow screens.
- Use a 50px desktop bar and a 48px mobile bar.
- Keep the header visually separate from the content rather than drawing a full-width divider.

### Buttons

Primary marketing buttons use a blue vertical gradient, white text, `14px` medium type, `8px 20px` padding, a one-pixel dark translucent border, and a 12px radius. Secondary buttons use white fill, dark text, and `#dee0e3` border.

Break My Agent button hierarchy:

1. **Primary:** Run agent — blue, filled.
2. **Destructive experiment:** Crash worker — white or pale-red surface with red icon and border; red fill only while pressed/applied.
3. **Injected faults:** white cards with compact status-code glyphs; selected/armed state gets a pale warning or danger surface.
4. **Lifecycle:** quiet outline or text buttons.
5. **External proof:** Open in Restate — blue text or secondary button with external-link icon.

Disabled states retain their shape and label, with reduced contrast. Busy state labels describe the operation in progress.

### Pills and tags

Blog tags use `12px / 16px`, weight 500, `2px 10px` padding, a full pill radius, dark blue text, and blue at roughly 10% opacity behind it. Use this treatment for model name, event count, phase, and small category labels. Operational statuses need an icon or dot in addition to color.

### Cards

The default marketing card is white on the pale canvas, with a fine gray border, 12px radius, and minimal shadow. Pricing emphasizes one plan with a pale blue treatment and a dark blue “Most popular” badge. Use-case cards organize a logo/title, direct proof paragraph, and optional action in a predictable vertical stack.

Break My Agent should use three card families:

- **Editorial card:** white surface for composer, response, and baseline explanation.
- **Branded card:** pale blue surface and blue border for the Restate outcome.
- **Runtime card:** dark surface for execution evidence, journal, and event details.

### Section headings

Restate's interior pages center the page title and supporting sentence, then use left-aligned section headings within the content grid. Small uppercase labels appear above sections or cards and use generous tracking.

For the demo, use sentence case for all functional headings. Reserve uppercase tracked labels for short categories such as `LIVE EVIDENCE`, `AGENT OUTPUT`, and `INVOCATION`. They should not carry essential meaning by themselves.

### Forms

Form controls follow the card system: white fill, cool one-pixel border, rounded corners, and a clear blue focus state. Prompt presets should use the blog-tag pattern. The composer can remain visually prominent without a dark textarea.

### Technical evidence

Documentation uses compact navigation, a 12px active-state radius, blue at 10% opacity, 14px sidebar labels, and clear 16px body text. It keeps controls close to the content they affect.

Apply this density to the runtime island:

- a fixed summary row for checkpoints, tool requests, and unique effects;
- newest events in a stable grid or vertical list;
- full history behind a disclosure;
- event type, timestamp, and IDs in mono;
- explanation in body text;
- the journal as a disclosure rather than a permanent full-height list.

### Diagrams and illustration

Restate uses soft 3D or isometric technical illustrations, simple line icons, blue-to-teal gradients, and diagrams with clear nodes and directional relationships. Illustrations explain architecture rather than decorate empty space.

Break My Agent already has real runtime data, so the most useful “diagram” is the before/after execution identity:

```text
Worker A  ── dies ──┐
                    ├── same invocation ── answer delivered
Worker B  ─ resumes ┘
```

This can become a compact inline visual inside the Restate outcome card when both worker PIDs are observed. It should use live data and hide when evidence is unavailable.

## Content design

### Voice

Restate's strongest copy is direct, technical, and outcome-led. Sentences are short. Mechanisms support benefits. Calls to action use verbs. Metrics are specific.

Break My Agent should use the same sequence:

1. State what happened.
2. State what Restate preserved or retried.
3. State the evidence.
4. State the user outcome.

Example after a worker kill:

> Worker 63803 stopped. Restate kept invocation `…9f4a` durable, resumed it on worker 63821, and returned the answer. Completed journaled work did not run again.

The sentence must adapt to observed evidence. If a replacement PID or deduplicated effect has not been observed, omit that claim.

### Terminology

- **Invocation** is the durable execution identity.
- **Worker** is the disposable process running the handler.
- **Journal entry** is completed durable work Restate can replay or reuse.
- **Tool request** is a physical request attempt.
- **Unique effect** is the idempotent external effect count.
- **Restart/regenerate** creates a new invocation and links it to the parent.
- **Resume** continues a paused invocation.

Do not say Restate “moved the worker.” The local supervisor starts a replacement process; Restate resumes the durable invocation and reuses journaled results.

### Baseline wording

The Without Restate card is an illustrative comparison. Other systems can implement persistence and retry logic. Keep the qualification visible and concise:

> Illustrative baseline: in-memory execution without application-owned recovery.

Describe the immediate user consequence: the request stops, waits indefinitely, or must be retried. Avoid emotional mascots as the primary explanation.

## Responsive behavior

### Desktop, 1200px and wider

- Floating navigation inside a maximum-width frame.
- Two-column hero: statement left, composer right.
- Full-width Break It bar below the hero.
- Full-width runtime evidence directly below the controls.
- Two-column comparison cards.
- Response below the durability explanation.

### Tablet, 768–1199px

- Hero remains two columns while each side has at least 360px; stack below that threshold.
- Failure controls wrap into fault and lifecycle rows.
- Evidence metrics remain three columns.
- Comparison cards can remain two columns until each becomes narrower than 320px.

### Mobile, below 768px

- Navigation reduces to wordmark plus a health/menu disclosure.
- Hero and composer stack.
- Hero heading targets `44–48px / 1.0` with intentional line breaks.
- Buttons retain a 44px minimum target.
- Failure controls use a two-column grid; Crash worker can span both columns.
- Evidence events become one stable vertical list.
- Comparison stacks Without Restate first, With Restate second.
- No horizontally scrolling event strip.
- Long invocation IDs wrap or truncate with a dedicated copy button.

## Accessibility requirements

- Maintain at least WCAG AA contrast: 4.5:1 for normal text and 3:1 for large text and component boundaries.
- Use `:focus-visible` with a high-contrast blue ring and at least 2px offset.
- Provide text labels for every icon-only action.
- Keep DOM order aligned with visual order at every breakpoint.
- Announce fault arming, applied failure, recovery, cancellation, and completion through a polite status region. Do not announce every poll.
- Use `aria-live="assertive"` only for a terminal error that blocks the demo.
- Preserve headings in logical order and keep disclosures as native `details/summary` where practical.
- Respect reduced-motion and avoid auto-scrolling the page as events arrive.
- Do not communicate running, warning, success, or failure by color alone.

## Application strategy for Break My Agent

### Recommended visual direction

Use the marketing system for the narrative frame:

- pale blue canvas;
- deep blue display headings;
- floating dark navigation;
- white editorial cards;
- blue primary actions;
- pale blue durable outcome.

Use a dark runtime island for live evidence:

- near-black panel;
- compact mono metadata;
- stable newest-first event cards;
- restrained green, amber, and red state accents;
- expandable journal and full history.

The current acid-lime hacker aesthetic should be replaced at the token level. Preserve its useful qualities: strong fault affordances, compact evidence, and visible process identity.

The behavioral rules in [`docs/ui-redesign-plan.md`](docs/ui-redesign-plan.md) remain the source for honest recovery claims. This document supplies the visual system and implementation sequence.

## File-by-file plan

### 1. Establish tokens and fonts

**Files:** `app/globals.css`, `app/layout.tsx`

- Replace global dark color scheme with the Restate light canvas and semantic tokens.
- Add display, body, and mono font tokens.
- Use `next/font/local` only when licensed local files are available. Otherwise keep the fallback stack above.
- Add shared tokens for 4px spacing, 12/16/24px radii, borders, low shadows, and the 150ms easing curve.
- Add light and runtime-surface focus styles.
- Add a `prefers-reduced-motion` block.

Deliverable: every later component can be restyled using semantic variables rather than raw hex values.

### 2. Rebuild the shell and top navigation

**Files:** `components/demo-app.tsx`, `components/wordmark.tsx`, `components/status-dot.tsx`, `app/globals.css`

- Convert `.topbar` into the floating 50px dark capsule.
- Keep Break My Agent as the product name; use supplied Restate assets only if permitted.
- Turn runtime health into compact dark-nav indicators with readable text and non-color state icons.
- Constrain the main content to a 1152–1244px frame.
- Increase the gap between navigation and hero while reducing unused hero height.

Deliverable: the app reads as part of the Restate family before the user starts a run.

### 3. Restyle the hero and composer

**Files:** `components/demo-app.tsx`, `app/globals.css`

- Keep the existing left/right hero-composer layout.
- Restyle the heading to regular-weight deep blue display type.
- Change the eyebrow to a small blue category label without the long lime rule.
- Make the composer a white 16px-radius card with a thin gray border and minimal shadow.
- Convert preset buttons to blue-tint pills.
- Change the prompt field to white or very-light-blue with a clear blue focus ring.
- Make Run agent the blue gradient primary action.
- Keep Demo pacing as a quiet utility option.

Deliverable: prompt entry feels like a polished Restate product interaction rather than a terminal control.

### 4. Clarify the Break It control bar

**Files:** `components/failure-controls.tsx`, `app/globals.css`

- Keep the full-width location immediately below the hero.
- Use a white card or very-light branded section with one line of context.
- Group physical failure and injected faults together; group lifecycle controls separately.
- Give Crash worker the strongest red outline treatment.
- Render 429, 500, and +10s as compact technical glyphs.
- Use an inline armed state inside the bar. Avoid a page-wide success banner.
- Keep busy and disabled labels stable so the bar does not jump.

Deliverable: the viewer understands which controls damage the current run and which manage its lifecycle.

### 5. Turn execution evidence into the runtime island

**Files:** `components/execution-evidence.tsx`, `app/globals.css`

- Keep the panel directly under Break It and full width.
- Use the dark runtime palette only within this panel.
- Retain the fixed metric row and expandable journal.
- Present the four newest events in a stable grid at large widths, two columns on tablet, and one column on mobile.
- Keep newest-first ordering and mark the latest item without auto-scrolling.
- Keep full history in a vertical disclosure.
- Add a compact identity row when invocation ID and worker transition data are available.

Deliverable: the live demo remains readable while events arrive, with no horizontal watching experience.

### 6. Emphasize the durability comparison

**Files:** `components/recovery-comparison.tsx`, `components/recovery-story.ts`, `app/globals.css`

- Use a centered or left-aligned deep-blue section heading above the two cards.
- Style Without Restate as a white neutral card with a local danger accent.
- Style With Restate as pale blue with a blue border and a clear observed/durable badge.
- Keep “Illustrative baseline” visibly attached to the baseline heading.
- Turn proof rows into concise label/value pairs with IDs and PIDs in mono.
- Add the live worker-transition mini-diagram only when both PIDs are observed.
- Keep user outcome as the last line in both cards.
- Preserve all evidence-gating logic in the story selector.

Deliverable: a viewer can explain Restate's value without inspecting the timeline.

### 7. Restyle the response as editorial content

**Files:** `components/markdown-response.tsx`, `components/demo-app.tsx`, `app/globals.css`

- Use a white response card with dark body text and deep-blue headings.
- Keep rendered Markdown and GFM support.
- Style lists, tables, blockquotes, code, links, and horizontal rules with the Restate palette.
- Give code blocks a dark runtime surface and horizontal overflow inside the block only.
- Keep line length near 72ch within the wide response card.
- Use a restrained status pill in the heading.

Deliverable: long Claude answers read like a polished developer article rather than raw terminal output.

### 8. Refine status, footer, and external proof

**Files:** `components/demo-app.tsx`, `app/globals.css`

- Keep transient success updates as a quiet inline activity line.
- Keep blocking errors as local red callouts near the affected control.
- Turn the footer evidence bar into a compact invocation/proof strip.
- Make Open in Restate a clear secondary action and preserve the external-link cue.
- On mobile, separate copy and open actions into full-width accessible controls.

Deliverable: identity remains easy to copy and the Restate UI remains one click away.

### 9. Verification

**Files:** existing unit tests plus focused component or selector tests where behavior changes

Run:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Then verify at minimum:

- 1440×900 desktop;
- 1280×720 presentation viewport;
- 1024×768 tablet;
- 390×844 mobile;
- keyboard-only navigation;
- reduced-motion mode;
- long Markdown with tables and code;
- long invocation IDs and event details;
- SIGKILL recovery;
- injected 429 and 500;
- latency, pause/resume, cancel, and regenerate;
- controller or worker offline at initial load.

Use visual regression screenshots for idle, running, fault armed, recovering, completed, cancelled, and failed states.

## Suggested implementation order

1. Tokens, background, type, and generic controls.
2. Navigation, content frame, hero, and composer.
3. Break It bar and inline status behavior.
4. Runtime evidence island.
5. Durability comparison cards.
6. Markdown response and footer proof strip.
7. Responsive, accessibility, state, and real-recovery validation.

Each step should leave the app usable. Avoid changing recovery semantics during the visual pass. If a component needs new observed data, add that data and its selector test before exposing the claim.

## Acceptance criteria

The redesign is complete when:

- the page is visually identifiable as Restate-adjacent within five seconds, without copying unlicensed assets;
- the hero, prompt, and Break It controls form one clear opening sequence;
- live evidence sits immediately below the controls and never requires horizontal event scrolling;
- Without Restate and With Restate explain the same disruption side by side on desktop;
- the Restate card distinguishes worker identity from invocation identity;
- every recovery statement is backed by the selected invocation's observed data;
- the response renders Markdown as structured editorial content;
- state changes do not cause large layout jumps or involuntary page scrolling;
- all controls are usable by keyboard and have visible focus;
- all status meanings survive grayscale and color-vision differences;
- desktop, tablet, and mobile layouts pass without horizontal page overflow;
- typecheck, lint, tests, and production build pass.

## Proposed token starter

This is the recommended starting layer for `app/globals.css`. It is intentionally semantic so values can be updated when official brand assets or guidance are supplied.

```css
:root {
  color-scheme: light;

  --font-display: "Stack Sans Headline", Inter, ui-sans-serif, system-ui, sans-serif;
  --font-body: Inter, ui-sans-serif, system-ui, sans-serif;
  --font-mono: "JetBrains Mono", "SFMono-Regular", Consolas, monospace;

  --color-canvas: #f5f8fc;
  --color-surface: #ffffff;
  --color-surface-brand: #d3eff7;
  --color-text: #14151a;
  --color-text-muted: oklch(37.3% 0.034 259.733);
  --color-brand: oklch(29.59% 0.1713 263.99);
  --color-action: #3258ff;
  --color-action-medium: #2064fa;
  --color-border: #dee0e3;
  --color-border-brand: #b6d8e1;

  --color-success: #198754;
  --color-success-surface: #eaf7ef;
  --color-warning: #a46600;
  --color-warning-surface: #fff6df;
  --color-danger: #c53b3f;
  --color-danger-surface: #fff0f0;

  --color-runtime: #15161a;
  --color-runtime-surface: #1d1f24;
  --color-runtime-text: #f5f6f8;
  --color-runtime-muted: #a9adb7;
  --color-runtime-border: rgba(255, 255, 255, 0.1);

  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;
  --space-12: 48px;
  --space-16: 64px;
  --space-20: 80px;

  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 16px;
  --radius-xl: 24px;
  --shadow-card: 0 1px 3px rgba(20, 21, 26, 0.06);
  --ease-standard: 150ms cubic-bezier(0.4, 0, 0.2, 1);
  --content-max: 72rem;
}
```

