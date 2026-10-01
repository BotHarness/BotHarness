# Browser typing editability — #644

Base: `530bd30f7dc5a974b78fb7c663a844f7f83a3243` (includes the merged native-key fix #642).

## Real E2E result

A real DeepSeek DM turn opens and observes the fixture through scoped Browser tools. The deterministic probe then uses the same live Agent's native `ctx.tools.execute` path through the authenticated QA adapter, production Provider, queue, Access/Authorization/Pause checks, runtime and Audit. It does not use independent page scripting to perform the interactions or claim autonomous model planning of all input attempts.

Before: five protected inputs/textareas accept `changed` and emit five input events; all six typing attempts report success. Native Enter submits once, including the incorrectly changed readonly values.

After: those five attempts return readonly/disabled errors, leave values and focus unchanged and emit no input events. The current owned tab survives; an editable field receives `complete` and native Enter submits exactly once with the original readonly values. Disabled controls are excluded by native form submission. Six attributed typing audit rows record five errors and one success, using character counts rather than typed text.

`before-page.jpg` / `after-page.jpg` show the same page after the five protected-field attempts, before the editable field is filled. `before-completed.jpg` / `after-completed.jpg` show the native form receipt. All four are original production Browser observation JPEG frames, 2400 × 1472, same English fixture, light theme, browser profile and viewport; no image editing. `before.json` / `after.json` contain only public-safe assertion results.

## Reproduce

1. Install locked dependencies and build a dedicated worktree; boot its pinned DSH 0.2.0-rc.1 with `scripts/dev-instance.mjs`, an isolated home and a free port.
2. In that disposable Profile only, enable Browser `autoAllowActions`, and insert `scripts/fixtures/browser-queue-qa.mjs` through DSH's native Patch `insert` / `name` mechanism; restart that exact owned Host PID.
3. Start `node scripts/e2e-browser-editability.mjs --serve` (fixture port 32009).
4. Set private `BH_E2E_ORIGIN`, `BH_E2E_HOME`, `BH_E2E_STATE`. Run `node scripts/e2e-browser-editability.mjs --prepare`. This verifies a real model tool round trip and saves the private checkpoint (0600).
5. Set `BH_E2E_RESULTS`, optionally `BH_E2E_SCREENSHOT` and `BH_E2E_COMPLETED_SCREENSHOT`. Run `node scripts/e2e-browser-editability.mjs --probe` on the fix, or add `--before` on the base.
6. The probe refuses a completed checkpoint before mutation. Use a fresh prepare for another run. Keep credentials, cookie jars and checkpoints local; never publish them.

The standard regression suite runs the production Runtime.evaluate typing expression against a DOM, checking value, focus and both input/change events. It covers disabled fieldset inheritance, a disabled second legend, and the enabled first-legend exception; six protected cases fail on the base and all nine cases pass on the fix. Real E2E checks the native Chrome behavior separately.

Scope: native readonly and disabled input/textarea controls. This slice does not add inert/ARIA policies, change existing input types or contenteditable handling, or replace the existing text setter with native keystroke insertion. The native disabled selector preserves the HTML fieldset first-legend exception ([HTML Standard](https://html.spec.whatwg.org/multipage/form-control-infrastructure.html#enabling-and-disabling-form-controls:-the-disabled-attribute)).
