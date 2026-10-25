# stripe

The AntelopeJS Stripe provider, published as `@antelopejs/stripe`. `src/index.ts` is the module entry: it implements the legacy `@antelopejs/interface-stripe` API (payment watchers, optional Redis fan-out through `@antelopejs/interface-redis`) and binds `src/implementations/payment` to `@antelopejs/interface-payment` and `src/implementations/subscriptions` to `@antelopejs/interface-subscriptions`.

## Versioning

The interface packages and `@antelopejs/interface-core` are dependencies with capped `>=minimum <cap>` ranges, and the optional API and Redis interfaces are optional dependencies. `README.md` repeats those ranges in its compatibility tables, which the docs check compares with `package.json`; change both together.

## Tests

- Suites are written in `src/test` and compiled to `dist/test`. `src/test/antelope.test.ts` (`antelopeJs.test` in `package.json`) is the `ajs module test` project; it loads this module from `.` with an offline Stripe client that answers only `/v1/invoice_payments`.
- `pnpm test`, and so `pnpm run checks`, builds `dist` and runs only the offline suites it names with `-f`: `provider-regressions`, `webhook-events` and `interface-stripe`. Add a new offline suite to that list, or it never runs.
- The other suites (the shared payment and subscriptions conformance suites, test clocks, subscription events and ownership, payment-method listing) call real Stripe. Run them with `STRIPE_KEY=sk_test_... pnpm test:stripe`. `error-mapping.test.ts` mixes offline `TranslateError` tests with live rejection tests, so its offline part also runs only under `pnpm test:stripe`. They refuse a key that is not test-mode, and they refuse to run when `CI` is set, so CI never runs them.
- `pnpm run checks` does not run the documentation check. CI runs it through the `docs-files` inputs in `.github/workflows/ci.yml`. To run it locally, clone `AntelopeJS/tooling-configs` at `v0.0.9` (the ref ci-node pins), run `npm ci --prefix actions/docs --omit=dev`, then run `node <clone>/actions/docs/check.mjs --files "$(printf 'README.md\ndocs')" --typescript-project docs/tsconfig.json` from this repository.

## Shipped files

`docs/` and `skills/` ship in the npm package; `dist/test` does not. `docs/` holds the guides the package `homepage` (https://interfaces.antelopejs.com/docs/stripe/introduction) points to. `skills/` reaches users through `antelopeJs.skills`; when checkout, payment or webhook behaviour changes, update `skills/integrating-stripe-checkout`.

<!-- antelopejs-guardrails:start -->
<!-- Managed by @antelopejs/tooling-configs. `antelopejs-sync` rewrites everything between these markers; write repository-specific guidance outside them. -->

## Guardrails

Finish every change with `pnpm run checks`. It runs typecheck, lint, format, knip, tests, size, ratchet, and sync, and prints only what failed. The change is done when it prints no failure.

The tools enforce most rules, listed in the table at the end. The sections below hold the rules no tool checks.

### Comments

Say it in code. A constraint belongs in a type, a lint rule, or a test. A public item's contract belongs in TSDoc (`/** */`) on that item. The only other comments are lint directives that name their rules, `@ts-expect-error <reason>`, `SAFETY: <reason>` above a type assertion, `/*!` license headers, and bundler or formatter directives.

### Tests

Hold every test you write or keep to this checklist:

- Name the wrong implementation this test fails on. A test with no answer is deleted, not kept.
- No test reads the file it tests. Drive the behaviour through the public interface.
- An invariant over many files is a lint rule, not a test.

### Debt

`guardrails.ratchet.json` records the lint findings and oversize files this repository already had. Its numbers only go down. After you remove debt, run `pnpm run ratchet:update` and commit the lowered file. A rule listed there is off for `oxlint`. The ratchet counts it instead, and the pre-commit hook rejects it on every line you add.

### What enforces what

| Rule                                                                           | Enforced by                               |
| ------------------------------------------------------------------------------ | ----------------------------------------- |
| Formatting                                                                     | oxfmt                                     |
| Lint findings are errors; no rule warns                                        | oxlint preset                             |
| Comments are TSDoc, directives, or `SAFETY:` only                              | `antelopejs/no-comments`                  |
| Every test asserts                                                             | `antelopejs/require-assertion`            |
| Tests read no files outside fixtures, helpers, locales                         | `antelopejs/no-fs-read-in-tests`          |
| No assertion that restates a constant                                          | `antelopejs/no-constant-value-assertion`  |
| No test whose only check is "is a function"                                    | `antelopejs/no-typeof-function-only-test` |
| Params ≤ 5, function ≤ 120 lines, file ≤ 500 lines, depth ≤ 4, complexity ≤ 20 | `eslint/max-*`, `eslint/complexity`       |
| Files ≤ 20,000 bytes, tests included                                           | `antelopejs-check-size` (pre-commit)      |
| Existing debt only shrinks                                                     | `antelopejs-ratchet`                      |
| Types check                                                                    | `tsc` (pre-push)                          |
| No dead files, exports, or dependencies                                        | knip                                      |
| Managed files match the pack                                                   | `antelopejs-sync --check`                 |
| A test names the wrong implementation it catches                               | review; no tool                           |

<!-- antelopejs-guardrails:end -->
