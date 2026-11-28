# stripe

The AntelopeJS Stripe provider, published as `@antelopejs/stripe`. `src/index.ts` is the module entry: it implements the legacy `@antelopejs/interface-stripe` API (payment watchers, optional Redis fan-out through `@antelopejs/interface-redis`) and binds `src/implementations/payment` to `@antelopejs/interface-payment` and `src/implementations/subscriptions` to `@antelopejs/interface-subscriptions`.

## Versioning

The interface packages and `@antelopejs/interface-core` are dependencies with capped `>=minimum <cap>` ranges, and the optional API and Redis interfaces are optional dependencies. `README.md` repeats those ranges in its compatibility tables, which the docs check compares with `package.json`; change both together.

## Tests

- Suites are written in `src/test` and compiled to `dist/test`. `src/test/antelope.test.ts` (`antelopeJs.test` in `package.json`) is the `ajs module test` project; it loads this module from `.` with an offline Stripe client that answers only `/v1/invoice_payments`, unless `ANTELOPE_STRIPE_TEST_MODE=live` (set by `pnpm test:stripe`) switches it to the real API with `STRIPE_KEY`.
- `pnpm test`, and so `pnpm run checks`, builds `dist` and runs only the offline suites it names with `-f`: `provider-regressions`, `webhook-events` and `interface-stripe`. Add a new offline suite to that list, or it never runs.
- The other suites (the shared payment and subscriptions conformance suites, test clocks, subscription events and ownership, payment-method listing) call real Stripe. Run them with `STRIPE_KEY=sk_test_... pnpm test:stripe`. `error-mapping.test.ts` mixes offline `TranslateError` tests with live rejection tests, so its offline part also runs only under `pnpm test:stripe`. They refuse a key that is not test-mode, and they refuse to run when `CI` is set, so CI never runs them.
- `pnpm run checks` does not run the documentation check. CI runs it through the `docs-files` inputs in `.github/workflows/ci.yml`. To run it locally, clone `AntelopeJS/tooling-configs` at `v0.0.9` (the ref ci-node pins), run `npm ci --prefix actions/docs --omit=dev`, then run `node <clone>/actions/docs/check.mjs --files "$(printf 'README.md\ndocs')" --typescript-project docs/tsconfig.json` from this repository.

## Shipped files

`docs/` and `skills/` ship in the npm package; `dist/test` does not. `docs/` holds the provider guides that `README.md` links to. `skills/` reaches users through `antelopeJs.skills`; when checkout, payment or webhook behaviour changes, update `skills/integrating-stripe-checkout`.

<!-- antelopejs-guardrails:start -->
<!-- Managed by @antelopejs/tooling-configs. `antelopejs-sync` rewrites everything between these markers; write repository-specific guidance outside them. -->

## Guardrails

CI runs `pnpm run checks` in full on every pull request and reports what failed. The commit hook formats and lints the staged files. Locally, check only what you touched, one test file and not the suite, as the [`verify-changes`](.agents/skills/verify-changes/SKILL.md) skill says.

### Comments

Say it in code: a constraint in a type, a lint rule or a test, a public item's contract in TSDoc. Other comments are lint directives naming their rules, `@ts-expect-error <reason>`, `SAFETY: <reason>` above a type assertion, and license or tool directives. A reason states what the code does now.

### Tests

Each test names the wrong implementation it fails on, or is deleted. Drive behaviour through the public interface. An invariant over many files is a lint rule.

### Review

No tool checks these:

- A type guard checks the nested elements and values it claims.
- A no-upward import rule rejects same-tier peers; probe it with an import.
- A finding only an evasion or a patched internal can trigger goes under Attention and never blocks.

### Suppressions

`guardrails.suppressions.json` caps lint directives, `@ts-expect-error`, `SAFETY:` comments and rules a lint config turns off. Over a cap, fix the code or remove another suppression of that kind; only the operator raises a number. After removing suppressions, run `pnpm run suppressions:update` and commit the file.

<!-- antelopejs-guardrails:end -->
