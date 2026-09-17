# Project Stack Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Restore three playful overlapping project cards without crowding the introduction, with visibly smooth foreground transitions.

**Architecture:** Add an isolated ProjectStack component beside the introduction. Move project descriptions below the opening. Card activation animates clear of the overlap before changing stacking order, then settles; cancellation resumes from the current visual position. Anchor links target the descriptions. Mobile uses normal document flow and reduced motion bypasses Web Animations explicitly.

**Tech Stack:** Svelte 5, TypeScript, CSS, Web Animations API.

### Task 1: Card component
Create src/lib/prototype/ProjectStack.svelte with three named anchors, existing images, staged promotion, keyboard focus parity, responsive layout and explicit reduced-motion handling. Keep labels visible and the opening bounded.

### Task 2: Page composition
Modify src/routes/prototype/gallery/+page.svelte and src/lib/prototype/portfolio.css: intro plus stack above a three-row project section; replace the oversized repeated Korean image with a thumbnail. Preserve project copy, links, university records and existing shell.

### Task 3: Verification
Run yarn run check, yarn build, git diff --check. Inspect desktop and 390px/320px layouts in the live browser. Verify anchor destinations, keyboard focus, and the promotion timeline rather than only a final screenshot. Verify reduced-motion bypass. Leave Gallery available for review. Do not commit or publish.
