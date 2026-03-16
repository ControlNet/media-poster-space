# Onboarding Multi-Provider UI Phase 1

## Goal
Redesign the shared onboarding interface to match `designs/design_onboard1.html` while keeping current Jellyfin-only backend behavior intact.

## Scope
- Update the shared onboarding form visual structure and styling to add a three-provider selector and dynamic provider theming.
- Keep existing onboarding functionality: automatic preflight on blur, login flow, library selection, saved credentials/preferences, and desktop platform extras.
- Preserve existing critical `data-testid` selectors so current flows stay automatable.
- Add a first-phase product guard: Emby and Plex are visible/selectable in the UI, but clearly marked unavailable so users cannot enter a broken Jellyfin-only auth path.

## Planned Changes
1. Extend shared onboarding view options/state to carry provider presentation metadata.
2. Rebuild `packages/core/src/runtime/onboarding-form.ts` to follow the reference design:
   - card/header layout
   - provider selector tiles
   - dynamic accent color/theme
   - redesigned inputs, status pill, and primary action
   - preserved step-2 library selection compatibility
3. Update web and desktop runtimes to provide provider selection state and disabled-provider messaging.
4. Update affected onboarding tests to cover the new provider selector and phase-1 disabled-provider behavior.

## Constraints
- Do not implement real Emby or Plex provider backends in this change.
- Do not remove existing onboarding behavior or working Jellyfin login flow.
- Do not change `designs/` files.
- Do not remove required existing `data-testid` hooks; additive selectors are allowed.

## Verification
- LSP diagnostics: zero errors on every modified onboarding/runtime/test file.
- Web onboarding success path: `pnpm --filter @mps/web e2e -- e2e/onboarding-auth.spec.ts --grep "completes preflight -> login -> library selection and enters poster wall"`
- Desktop onboarding success path: `pnpm --filter @mps/desktop test -- -t "completes 3-step onboarding and persists encrypted remember-password data"`
- Web mandatory gate safety check: `pnpm --filter @mps/web e2e -- e2e/gates/mandatory-v1-gates.spec.ts`
- Affected workspace type/build checks: `pnpm --filter @mps/core typecheck`, `pnpm --filter @mps/web build`, `pnpm --filter @mps/desktop build`
- Manual browser verification: launch the web app, confirm the onboarding card matches `designs/design_onboard1.html` in overall layout, provider selector, dynamic accent/theme, status pill styling, and primary action treatment.

## QA Scenarios

### Scenario 1 — Jellyfin path still works on web
- Tool: Playwright
- Steps:
  1. Open onboarding.
  2. Leave Jellyfin selected.
  3. Enter server URL and blur the field to trigger preflight.
  4. Confirm server status updates to a success state.
  5. Sign in, select libraries, and enter the wall.
- Expected result: Existing Jellyfin preflight, auth, library-selection, and wall-entry behavior stays green.

### Scenario 2 — Jellyfin path still works on desktop
- Tool: Vitest
- Steps:
  1. Start desktop onboarding runtime test harness.
  2. Leave Jellyfin selected.
  3. Run preflight, login, remember-password, and finish flow.
- Expected result: Existing desktop onboarding flow still completes and persists encrypted password data.

### Scenario 3 — Emby and Plex do not enter a broken auth path
- Tool: Automated onboarding tests plus manual browser check
- Steps:
  1. Open onboarding.
  2. Select Emby, then Plex.
  3. Observe provider-specific visual theming and updated CTA copy.
  4. Attempt to continue.
- Expected result: UI clearly marks these providers as not yet available in phase 1 and prevents the current Jellyfin-only authentication flow from running under the wrong provider.

### Scenario 4 — Existing automation hooks stay stable
- Tool: Playwright + Vitest
- Steps:
  1. Run affected onboarding specs.
  2. Confirm preserved `data-testid` hooks for server URL, server status, remember toggles, login submit, library selection, finish, and change-server controls.
- Expected result: Existing tests continue using the same critical selectors with only additive selector coverage for the new provider UI.
