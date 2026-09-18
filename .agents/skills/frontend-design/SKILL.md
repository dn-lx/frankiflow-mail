---
name: frontend-design
description: Guide intentional, production-quality frontend design for FrankiFlow Mail while preserving productivity, accessibility and security constraints.
---

# Frontend Design — FrankiFlow Mail

Use this skill for new screens, substantial UI changes, component redesigns or visual-system work. Do not invoke it for a tiny text correction or purely backend change.

## Before coding

1. Read the active page/component and existing styles before proposing a new visual direction.
2. State the user goal, information hierarchy, primary action and responsive behavior.
3. Reuse existing design tokens, spacing, typography and components where they are coherent.
4. Prefer one intentional design direction over a mixture of trendy patterns.
5. Keep accessibility, keyboard/focus behavior, touch targets and reduced-motion needs in scope.

## Project design direction

Use a calm productivity-tool direction: compact but readable density, strong inbox/thread hierarchy, predictable keyboard/focus behavior, clear send/reply states and consistent dark/light themes. Preserve familiar mail interaction patterns and avoid decorative UI that reduces scanning speed. Security/account settings must remain clear and conservative.

## Implementation rules

- Avoid generic AI-generated dashboard/card repetition when a simpler hierarchy works better.
- Do not add a framework, icon system, animation library or design-system dependency solely for appearance.
- Preserve loading, empty, validation, error, success, disabled and offline states.
- Keep keyboard navigation, focus visibility and mobile touch behavior intact.
- For meaningful redesigns, verify rendered behavior and include screenshots or a short visual note in the PR.

## Verification

Inspect the rendered page, console, responsive behavior and affected mail interaction. Use browser automation when available. Visual improvements never justify weakening mailbox authorization, sanitization or send-state correctness.
## Canonical brand assets

Before implementing branded UI, read `.agents/skills/brand-assets/SKILL.md` and inspect `brand/`. Reuse approved repository logos/icons. Do not generate, redraw or approximate a brand mark when a canonical asset exists.

