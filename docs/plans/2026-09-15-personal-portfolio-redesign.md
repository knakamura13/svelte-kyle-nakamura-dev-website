# Personal Portfolio Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rebuild Kyle Nakamura's website into a personal, visually distinctive portfolio for employers hiring a senior full-stack/product engineer with a strong ML specialty.

**Architecture:** Keep SvelteKit server rendering, TypeScript, and the existing Node deployment. Store curated portfolio content locally and render it without a GitHub dependency. Use small Svelte components, CSS transitions, and progressive enhancement for motion, floating navigation, and contact controls.

**Tech Stack:** Existing Svelte 5, SvelteKit 2, TypeScript, Vite 6, Tailwind CSS 4, Yarn; browser-driven verification. Add a small browser regression suite during production implementation if needed; do not introduce an animation framework or CMS by default.

---

## 1. Status and authority

Two interactive concepts have been built in the isolated worktree `/Users/kylenakamura/.codex/worktrees/website-redesign-concepts`, branch `knakamura/website-redesign-concepts`. Kyle slightly prefers Gallery and approved retaining its colors, icons, and motion while revising its corporate-feeling layout and copy.

On 2026-09-16, after reviewing Joshua Comeau's *Building an Effective Dev Portfolio*, Kyle authorized the recommended content-first refinement. The Learning Korean story is drafted from pinned public sources in `docs/content/learning-korean-case-study.md`. Revised Gallery and the first project reading page are local prototypes; the original remains at `/prototype/gallery-original`. Production rollout, commits, pushing, and deployment remain outside this prototype revision.

Next content priorities are attribution/personal-reflection review, current professional experience, and a second substantial project story. The existing résumé contains older “Present” dates and needs a separate content refresh before publication. The revised homepage uses only its clearly historical APU role and completed education.

The personal-interest section is explicitly deferred. Omit it from the initial rendered experience until actual content is provided; do not fill it with invented hobbies or generic personality copy.

## 2. Settled design brief

| Decision | Requirement |
| --- | --- |
| Audience | Prospective employers evaluating Kyle's work |
| Positioning | Senior full-stack/product engineer with a strong ML specialty |
| Scope | All visual design, structure, copy, and existing animations are open to change |
| Character | Museum-like spacious composition with Ente-like playful details |
| Palette | Light neutral canvas, dark text, selective vivid accents |
| Opening | Concise introduction alongside real project previews |
| Project browsing | Concise homepage highlights; a project story is the primary destination for featured work, with demo/source links available |
| Work mix | Personal/open-source projects and selected professional work described at a public-safe level |
| Primary action | Contact; résumé and GitHub remain easy to find |
| Contact | Email and LinkedIn links, plus copy-email |
| Motion | Subtle throughout, with a few playful moments; native scrolling |
| Reveals | Run once, then keep content visible |
| Navigation | Floating capsule; hide on downward scrolling, return on upward scrolling or keyboard focus |
| Menus | Mostly direct links; expandable Contact panel |
| Maintenance | Evergreen content with occasional curated project updates |
| Evaluation | Compare two small interactive homepage concepts, then refine one |

Reference observations came from live interaction with https://lucasmuseum.org/our-museum and https://ente.com/ in this conversation. Borrow interaction principles and composition, not their copy, imagery, mascots, or branded assets.

## 3. Visual thesis

Make Kyle's judgment visible through the presentation of real work: clear explanations, substantial imagery, deliberate spacing, and responsive interactions. The page should immediately communicate who he is, then reward closer inspection with specific engineering decisions and outcomes.

Replace the current newsprint treatment with a lighter visual system. Remove the paper texture, decorative catalog numbers, double-rule masthead, and pervasive serif/monospace treatment where they no longer serve the chosen direction. Use a readable contemporary text face; compare a restrained serif display face against an expressive sans-serif in the two concepts. Load only the chosen fonts for production.

Use rounded forms for the floating navigation, controls, and selected media frames. Project stories should have distinct compositions rather than identical cards. Let actual screenshots provide much of the color. Reserve accent color for emphasis, selected states, and a small number of intentional details.

## 4. Initial comparison and selected refinement

Both concepts must use the same verified copy and project assets, include the same navigation/contact behavior, and work on narrow and wide screens. Each includes the introduction, two representative project highlights, a short professional summary, and a closing contact invitation. They must differ in composition, not merely color.

### Concept A: Gallery

- Left-aligned introduction with a large, legible project image alongside it.
- Restrained serif headline paired with a contemporary sans-serif body.
- Wide whitespace, alternating image/text project stories, captions with clear roles and outcomes.
- White floating capsule offset from the viewport edges.
- Playful detail: a secondary preview peeks from behind the primary image and shifts slightly on deliberate interaction; it never obstructs essential content.

### Concept B: Workbench

- Strong sans-serif introduction with two or three offset project previews arranged as a purposeful composition.
- More compact opening and greater variation in project image size.
- Small project labels and selective accent surfaces associated with actual work.
- Same floating capsule and information hierarchy as Concept A.
- Playful detail: hovering or focusing a project preview brings that preview forward and emphasizes its caption. On touch, keep the caption visible and use a direct link.

### Selection criteria

1. Can an employer identify Kyle's role and specialty immediately?
2. Is real work visible without a long scroll?
3. Do screenshots and text remain legible on mobile?
4. Does the design feel tied to Kyle's work rather than a reusable agency template?
5. Are Contact, Résumé, and GitHub easy to locate?
6. Does motion feel responsive without delaying reading or navigation?

The comparison is a bounded prototype exercise. Do not implement two complete websites or carry both systems into production.

### Approved Gallery refinement (2026-09-16)

- Personal introduction and name beside the selected projects, with quiet résumé/GitHub links.
- One featured project with a short concrete engineering hook; a smaller second project entry. Avoid repeating promotional image/headline/button sections.
- A source-backed Learning Korean story covering interactive lesson design, review scheduling, and guest use. Keep demo/source links secondary to the write-up.
- A compact background section and direct contact block; preserve the capsule navigation and one-time reveals.
- Preserve original Gallery and Workbench for comparison, without maintaining multiple production systems.
- Choose two to five projects by evidence and role relevance. Three remains a target, not a reason to pad the homepage with unsupported content.
- Adapt the book's early-career advice to senior work: show ownership, judgment, collaboration, constraints, and supported outcomes. Never infer sole authorship from repository ownership.
- Personal interests remain deferred. Do not invent biography, retrospective decisions, users, measured learning gains, or performance numbers.

## 5. Information architecture and content

### Homepage `/`

1. **Introduction:** name, senior full-stack/product positioning, one concise sentence about the work, real project previews, Contact primary action, Résumé secondary action.
2. **Selected work:** target three strong stories covering product engineering, ML depth, and independent initiative. Each shows a real preview, the problem, Kyle's contribution, and a supported result. Feature professional work only when publishable evidence is available.
3. **Professional summary / About:** short, concrete background and engineering interests. Avoid duplicating the résumé or making unsupported claims about impact, tenure, ownership, or availability.
4. **Personal section:** deferred; no empty placeholder section on the delivered site.
5. **Contact invitation and footer:** direct email, LinkedIn, GitHub, résumé access, and understated site credits.

Use homepage anchors for Work and About. The name links home. Résumé has its own route. Contact expands an accessible disclosure panel. Keep non-career utility links out of the main employer-focused navigation.

### Project detail `/work/[slug]`

Create pages only for stories with enough evidence to justify them. Structure: summary; role and scope; problem; important decisions and trade-offs; implementation visuals; supported outcomes; source/live links where available; next project/contact. Clearly distinguish individual contributions from team results. Use qualitative outcomes when no reliable measurements exist.

### Existing destinations

- `/resume`: restyle the page and PDF controls; preserve direct PDF access and a useful fallback on mobile or when embedding fails.
- `/send-money`: preserve payment destinations and clipboard behavior; adapt the design system without promoting the page in the professional navigation. Verify controls without initiating transactions.
- `/playground` and `/curling`: both files were empty at inspection. Do not invent a game or experiment as part of this redesign. Preserve their URLs with a minimal honest empty state or redirect where appropriate; do not advertise unfinished destinations.

### Content source

Create `src/lib/content/portfolio.ts` with typed, locally curated entries. Suggested shape: slug, title, kind, summary, role, contributions, outcomes, media with alt/width/height, links, featured order, optional detailed sections. Use an explicit publishable/draft boundary so incomplete professional stories never leak into the UI. Keep evidence/provenance notes in a private working document or local planning artifact, not in client-delivered content.

Choose project candidates from public repositories, existing résumé material, and public-safe descriptions. Verify current project identity and links before writing final copy. The live homepage's recent-repository list is a candidate source, not an endorsement or ranking. Do not expose private work screenshots, ticket IDs, customer data, or internal architecture merely to fill a visual slot.

Keep the GitHub feed optional and secondary, such as a compact further-work list. Curated project visibility and ordering must not depend on an API call. A feed failure should leave the main portfolio complete and may show a simple GitHub link instead.

## 6. Interaction specification

### Floating navigation

- Desktop: name at the left and compact capsule at the right with Work, About, Résumé, Contact.
- Small screens: compact home/name control and menu disclosure with the same destinations; Contact remains reachable. Minimum 44px interactive targets.
- Begin visible. Hide after deliberate downward travel; reveal on upward travel. Starting tuning values: 80px top zone and 12px directional accumulation to avoid jitter.
- Keep visible while focus is inside, a panel is open, or the pointer is interacting with it. Hidden controls must reveal before keyboard focus becomes obscured. Prevent dropdown clipping and viewport overflow.
- Contact disclosure supports Enter/Space, Escape with focus restoration, outside dismissal, accurate expanded state, and ordinary Tab order. It is a disclosure, not an ARIA application menu.
- Use semantic links for navigation. Anchor destinations account for the floating header using scroll margins. Handle browser back/forward and direct hash navigation.
- Email remains selectable if copying fails. Announce copy success through a polite status message and provide a clear failure state.

### Motion

Starting values, to tune in browser:

| Interaction | Treatment |
| --- | --- |
| Below-fold reveal | 12–20px upward translation and opacity over 400–550ms |
| Small reveal groups | 40–70ms stagger, capped so reading is never held back |
| Navigation show/hide | 180–240ms transform transition |
| Contact opening | 160–220ms opacity and small translation |
| Link/button feedback | 120–180ms color/underline/icon feedback |
| Project media hover | At most about 1.02 scale or 4px travel, inside a stable frame |

Use a shared ease-out curve and tokens rather than per-element arbitrary timing. No scroll interception, pinned story sequences, autoplay carousels, cursor replacement, or perpetual floating decorations. Initial headline and primary action render visibly in server HTML. Only below-fold elements may receive progressive reveal behavior; content remains visible without JavaScript or when observer setup fails. Disconnect observers after reveal and clean up listeners on route changes.

Reduced-motion preference removes translation, scaling, stagger, and animated scrolling. Content and controls remain fully usable. Hover-only enhancements must have focus equivalents and must not hide content on touch.

## 7. Repository evidence and change map

Planning inspected the graph and exact relevant source on 2026-09-15 local time. Graph generation: `2026-09-16T01:18:04Z`, status ready, full mode. Coverage metadata matched the inspected paths. `Header.svelte` had a recorded parse gap at line 71; the surrounding source was read directly. These are task-directed checks, not proof of exhaustive graph completeness.

Current structure:

- `src/routes/+layout.svelte` imports global CSS and wraps pages with Header/Footer and a skip link.
- `src/routes/+page.server.ts` streams `loadHomeProjects()` so GitHub does not block initial rendering.
- `src/lib/server/github.ts`: `loadHomeProjects()` is also called by `src/routes/api/repositories/+server.ts`; do not remove the shared service merely because the homepage changes.
- `src/routes/+page.svelte` currently combines introduction, biography, and repository grid.
- `src/app.css`, `src/app.html`, and `package.json` contain current font/token/preload choices that must be updated together.
- Shared controls include `Header.svelte`, `Footer.svelte`, `AnimatedButton.svelte`, and `IframePDFViewer.svelte`.

Proposed new modules, subject to keeping the implementation simple:

- `src/lib/content/portfolio.ts`
- `src/lib/components/ContactPanel.svelte`
- `src/lib/components/ProjectFeature.svelte`
- `src/lib/motion/reveal.ts`
- `src/lib/motion/navigation.ts` only if extracting the scroll-state logic makes it easier to test and maintain
- `src/routes/work/[slug]/+page.ts` and `+page.svelte`
- `static/images/work/` for optimized, verified portfolio assets

## 8. Implementation sequence

### Task 1 — Establish baseline and gather content

**Files:** read current routes/components and résumé assets; create a bounded working content inventory.

1. Check Git status, local instructions, and baseline HEAD before editing. Create a dedicated worktree on a `knakamura/` branch for implementation; preserve the supplied checkout.
2. Install from the existing lockfile with `yarn install --frozen-lockfile` and run `yarn run check` and `yarn build`. Record baseline failures separately.
3. Capture current desktop/mobile behavior, including navigation, résumé, and payment clipboard controls.
4. Select and verify candidate project assets and claims. Gather two suitable public project previews for the concept comparison.
5. Create a factual content inventory with explicit missing evidence; do not guess outcomes.

**Exit:** a baseline record and sufficient real material for two concepts. Missing personal-interest content is not a blocker.

### Task 2 — Build the two bounded concepts

**Create, prototype worktree only:** `/prototype/gallery` and `/prototype/workbench` routes and a small shared prototype content module. Isolate prototype styling from existing production globals; if route groups are needed, make that layout restructuring prototype-only.

1. Implement matching factual content in both compositions.
2. Add responsive floating navigation, working Contact disclosure/copy-email, one-time reveals, and project hover/focus states.
3. Implement mobile layouts with naturally stacked media and no hover dependency.
4. Inspect live at 390px, 768px, and 1440px widths, plus a narrow 320px check.
5. Capture short interaction recordings or live demonstrations as well as still screenshots. Screenshots alone do not establish animation quality.
6. Present both concepts together with the selection criteria in section 4.

**Exit:** user selection of one concept is the planned design checkpoint; no full-site build before that choice. This plan does not ask another interview question now.

### Task 3 — Implement the selected foundation

**Modify:** `src/app.css`, `src/app.html`, `package.json`, `yarn.lock`, `src/routes/+layout.svelte`, `src/lib/components/Header.svelte`, `Footer.svelte`, `AnimatedButton.svelte`.
**Create:** `ContactPanel.svelte`, motion helpers as needed.

1. Move the selected type, palette, spacing, radii, and motion values into a compact token system.
2. Update font imports, actual font files, fallback metrics, theme color, and preloads coherently; remove unused font loads only after checking all pages.
3. Implement the shared navigation and Contact behavior, including mobile and keyboard states.
4. Add progressive one-time reveal support without hiding initial critical content.
5. Preserve button semantics and existing clipboard/link functionality while replacing presentation.
6. Run `yarn run check`, `yarn build`, and targeted interaction checks.

**Exit:** a coherent shared shell with reliable navigation and no first-paint regression.

### Task 4 — Build curated homepage and project stories

**Modify:** `src/routes/+page.svelte`, `src/routes/+page.server.ts` if retaining optional streamed metadata.
**Create:** `src/lib/content/portfolio.ts`, `src/lib/components/ProjectFeature.svelte`, `src/routes/work/[slug]/+page.ts`, `src/routes/work/[slug]/+page.svelte`, verified assets under `static/images/work/`.

1. Add typed curated entries with explicit featured order and draft handling.
2. Render introduction, selected work, professional summary, and contact invitation.
3. Add static, deterministic project lookup by slug; unknown or draft slugs return 404.
4. Build detail pages using the same content source; do not emit empty detail links.
5. Keep optional GitHub activity secondary and handle slow/error states without removing curated work.
6. Add page titles, descriptions, canonical URLs, and suitable social previews using verified content.

**Exit:** employers can understand the positioning, inspect evidence, access the résumé, and contact Kyle without waiting for external data.

### Task 5 — Complete remaining frontend surfaces

**Modify:** `src/routes/resume/+page.svelte`, `src/lib/components/IframePDFViewer.svelte`, `src/routes/send-money/+page.svelte`, empty routes as described above.

1. Apply the chosen visual system to résumé and utility pages.
2. Make direct résumé opening/downloading clear and usable on narrow screens.
3. Preserve payment destinations and copy values; test without sending payments.
4. Give empty destinations an honest treatment and remove misleading navigation to them.
5. Add the personal-interest section later only when authentic content exists.

**Exit:** every existing frontend route is accounted for and useful behavior remains intact.

### Task 6 — Validate and prepare delivery

**Proposed tests:** `tests/portfolio.spec.ts`, `tests/navigation.spec.ts`, `tests/contact.spec.ts`, and a minimal `playwright.config.ts` if the repository still lacks a browser test harness when implementation begins. Add only needed scripts/dependencies to `package.json`.

1. Add behavior tests for downward/upward nav visibility, focus visibility, open-panel pinning, Escape/outside dismissal, clipboard success/failure, project 404s, and feed-failure independence.
2. Verify initial core content and project links with JavaScript disabled; verify reduced-motion behavior independently.
3. Run `yarn run check`, `yarn build`, and the new browser suite, e.g. `yarn test:e2e` once that script exists.
4. Browse every route at desktop and mobile widths; inspect focus, contrast, 200% zoom, wrapping, image cropping, route transitions, anchor positions, and back/forward navigation.
5. Check Chrome, Firefox, and WebKit behavior where available. Report actual coverage instead of implying unrun checks passed.
6. Record performance under consistent conditions. Aim for LCP <=2.5s and CLS <=0.1 in representative lab runs; treat these as targets, not claims about production field data. Reserve media dimensions, optimize images, lazy-load below-fold media, and avoid oversized font/JS payloads.
7. Remove prototype-only routes and unused assets from the production change. Review the final diff and keep generated screenshots/recordings outside shipped assets unless intentionally used.

**Exit:** passing applicable checks, a reviewed responsive implementation, and a concise delivery summary. Commit/push/PR/deployment follow user authorization; do not auto-deploy from this planning request.

## 9. Completion criteria

- The first viewport establishes Kyle's positioning and includes a meaningful glimpse of real work.
- Both prototype alternatives were compared; the chosen direction is consistent across production pages.
- Navigation, Contact, Résumé, and GitHub are easy to find on desktop, touch, and keyboard.
- Main content stays readable without animation, JavaScript, or a successful GitHub request.
- Native scrolling remains under browser/user control.
- Hover, focus, selection, disclosure, and reveal transitions were checked live, not inferred from screenshots.
- All public claims and portfolio media are supported; deferred personal details remain deferred.
- Existing useful routes and controls remain functional; unfinished routes are not advertised as finished work.
- Exact fonts, assets, screenshots, and copy come from the approved concept and verified content rather than generic placeholders.

## 10. Immediate next step

Implement the two bounded interactive homepage concepts in an isolated worktree, using the same real project content. Compare them in the live browser, select one, and then execute the remaining tasks in order.

## Gallery refinement validation — 2026-09-16

- `yarn run check`: zero errors and warnings. Production build succeeds; `git diff --check` passes.
- Revised homepage and Learning Korean page checked in the live browser at 320px and desktop widths, including 1440px homepage; no horizontal overflow in checked content. A missing mobile name separator was found and corrected.
- Contact copy success feedback, Escape focus return, mobile menu, project navigation, and case-study section navigation exercised. Floating navigation hides on downward scroll and returns upward. Reduced-motion mode shows all reveal content and disables transitions.
- SSR checks: homepage, case study, original Gallery, and Workbench each return 200, one h1, expected text, images with alt/dimensions, and visible initial content. This is focused prototype verification, not a full accessibility or cross-browser audit.
- The graph covers the original checkout, not this prototype worktree. Prototype source was inspected directly; source coverage is not claimed for new files.
- Local development server: `http://127.0.0.1:5187/prototype/gallery`. No commit, push, or deployment performed.
