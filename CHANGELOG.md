# Changelog

## v1.2.2

[compare changes](https://github.com/AntelopeJS/stripe/compare/v1.2.1...v1.2.2)

### 🔥 Performance

- **build:** Skip the lib check in build, typecheck keeps it ([#62](https://github.com/AntelopeJS/stripe/pull/62))
- **test:** Drop the interface-stripe timeout that held the run open ([#63](https://github.com/AntelopeJS/stripe/pull/63))
- **webhooks:** Fetch independent Stripe reads concurrently ([#67](https://github.com/AntelopeJS/stripe/pull/67))

### 📦 Build

- **deps:** Bump @antelopejs/tooling-configs to 0.4.0 ([#64](https://github.com/AntelopeJS/stripe/pull/64))
- **deps:** Bump @antelopejs/tooling-configs to 0.5.0 ([#65](https://github.com/AntelopeJS/stripe/pull/65))
- **deps:** Bump @antelopejs/tooling-configs to 0.5.1 ([#66](https://github.com/AntelopeJS/stripe/pull/66))

### ❤️ Contributors

- Antony Rizzitelli ([@Upd4ting](http://github.com/Upd4ting))

## v1.2.1

[compare changes](https://github.com/AntelopeJS/stripe/compare/v1.2.0...v1.2.1)

### 🩹 Fixes

- **deps:** Update qs and uuid to resolve runtime advisories ([#59](https://github.com/AntelopeJS/stripe/pull/59))

### 📦 Build

- **deps:** Bump @antelopejs packages to the 2026-11-06 releases ([#61](https://github.com/AntelopeJS/stripe/pull/61))

### 🏡 Chore

- **verify:** Remove seeded runs from the verification skill ([#57](https://github.com/AntelopeJS/stripe/pull/57))
- **ci:** Remove the weekly mutation caller ([#58](https://github.com/AntelopeJS/stripe/pull/58))

### 🤖 CI

- Call ci-node.yml@v1 ([#60](https://github.com/AntelopeJS/stripe/pull/60))

### ❤️ Contributors

- Antony Rizzitelli ([@Upd4ting](http://github.com/Upd4ting))

## v1.2.0

[compare changes](https://github.com/AntelopeJS/stripe/compare/v1.1.0...v1.2.0)

### 💅 Refactors

- Clean the repo with the guardrail pack ([#34](https://github.com/AntelopeJS/stripe/pull/34))
- **types:** Justify the two event payload assertions with SAFETY reasons ([#37](https://github.com/AntelopeJS/stripe/pull/37))

### 📖 Documentation

- **readme:** Use one Discord invite ([#46](https://github.com/AntelopeJS/stripe/pull/46))
- **github:** Send questions and ideas to Discord ([#48](https://github.com/AntelopeJS/stripe/pull/48))
- **readme:** Link the package to AntelopeJS and AntelopeJS DMS ([65e97c7](https://github.com/AntelopeJS/stripe/commit/65e97c7))

### 📦 Build

- **deps:** Adopt @antelopejs/interface-payment 0.1.0 ([#35](https://github.com/AntelopeJS/stripe/pull/35))
- **deps:** Adopt @antelopejs/interface-subscriptions 0.1.0 ([#36](https://github.com/AntelopeJS/stripe/pull/36))
- **deps:** Bump @antelopejs/tooling-configs to 0.2.17 ([#39](https://github.com/AntelopeJS/stripe/pull/39))

### 🏡 Chore

- Align public documentation and repository standards ([#30](https://github.com/AntelopeJS/stripe/pull/30))
- Adopt the guardrail pack from tooling-configs 0.2.0 ([#31](https://github.com/AntelopeJS/stripe/pull/31))
- Configure Renovate with the shared preset ([#32](https://github.com/AntelopeJS/stripe/pull/32))
- Land the cleanup campaign on main ([#56](https://github.com/AntelopeJS/stripe/pull/56))

### ❤️ Contributors

- Antony Rizzitelli ([@Upd4ting](http://github.com/Upd4ting))

## v1.1.0

[compare changes](https://github.com/AntelopeJS/stripe/compare/v1.0.3...v1.1.0)

### 🚀 Enhancements

- Implement the payment and subscriptions interfaces ([#23](https://github.com/AntelopeJS/stripe/pull/23))

### ❤️ Contributors

- Thomas

## v1.0.3

[compare changes](https://github.com/AntelopeJS/stripe/compare/v1.0.2...v1.0.3)

### 📖 Documentation

- **readme:** Remove social card image ([#18](https://github.com/AntelopeJS/stripe/pull/18))
- Fix the outdated CLI commands in the README ([#25](https://github.com/AntelopeJS/stripe/pull/25))
- Rewrite the README ([#27](https://github.com/AntelopeJS/stripe/pull/27))
- **agents:** Simplify repository guidance ([#28](https://github.com/AntelopeJS/stripe/pull/28))

### 🏡 Chore

- Replace Biome with oxlint, oxfmt and Knip ([#15](https://github.com/AntelopeJS/stripe/pull/15))
- Align community files with the organization defaults ([#17](https://github.com/AntelopeJS/stripe/pull/17))
- Remove .git-blame-ignore-revs ([#19](https://github.com/AntelopeJS/stripe/pull/19))

### 🤖 CI

- Standardize npm releases ([#14](https://github.com/AntelopeJS/stripe/pull/14))
- Use shared npm release workflow ([#16](https://github.com/AntelopeJS/stripe/pull/16))
- **release:** Release next from a dedicated branch and restore requireCommits ([#20](https://github.com/AntelopeJS/stripe/pull/20))
- **release:** Reference the shared release workflows through v1 ([#21](https://github.com/AntelopeJS/stripe/pull/21))
- Pin the antelope core locally instead of installing it globally ([#22](https://github.com/AntelopeJS/stripe/pull/22))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>
- Thomas

## v1.0.2

[compare changes](https://github.com/AntelopeJS/stripe/compare/v1.0.1...v1.0.2)

### 🩹 Fixes

- Support Core 1.5 interface contracts ([#13](https://github.com/AntelopeJS/stripe/pull/13))

### ❤️ Contributors

- Antony Rizzitelli <upd4ting@gmail.com>

## v1.0.1

[compare changes](https://github.com/AntelopeJS/stripe/compare/v1.0.0...v1.0.1)

### 🏡 Chore

- Update dependencies ([684fa95](https://github.com/AntelopeJS/stripe/commit/684fa95))

### ❤️ Contributors

- Antony Rizzitelli <upd4ting@gmail.com>

## v1.0.0

[compare changes](https://github.com/AntelopeJS/stripe/compare/v0.1.1...v1.0.0)

### 💅 Refactors

- Replace ioredis import with inferred RedisClient type ([2d05dee](https://github.com/AntelopeJS/stripe/commit/2d05dee))

### 📦 Build

- Replace rm -rf with rimraf ([#9](https://github.com/AntelopeJS/stripe/pull/9))

### 🏡 Chore

- Replicate ai agent config files (.agents/.claude) ([#10](https://github.com/AntelopeJS/stripe/pull/10))
- Remove local skills/commands and simplify CI workflows ([6c0cfb0](https://github.com/AntelopeJS/stripe/commit/6c0cfb0))
- Migrate from eslint/prettier to biome ([#11](https://github.com/AntelopeJS/stripe/pull/11))
- Migrate from local beta interfaces to published @antelopejs packages ([e3929f7](https://github.com/AntelopeJS/stripe/commit/e3929f7))

### 🤖 CI

- Remove test:coverage step from CI workflow ([780b6be](https://github.com/AntelopeJS/stripe/commit/780b6be))

### ❤️ Contributors

- Antony Rizzitelli <upd4ting@gmail.com>
- Glastis ([@Glastis](http://github.com/Glastis))

## v0.1.1

[compare changes](https://github.com/AntelopeJS/stripe/compare/v0.1.0...v0.1.1)

### 🚀 Enhancements

- Changelog generation is now using changelogen ([#7](https://github.com/AntelopeJS/stripe/pull/7))

### 📖 Documentation

- Improved shields ([#5](https://github.com/AntelopeJS/stripe/pull/5))

### 📦 Build

- Update prepare command ([e47fa5a](https://github.com/AntelopeJS/stripe/commit/e47fa5a))
- Command 'build' that remove previous one before building ([#6](https://github.com/AntelopeJS/stripe/pull/6))
- Update changelog config ([27c7480](https://github.com/AntelopeJS/stripe/commit/27c7480))

### 🏡 Chore

- Update tsconfig.json paths ([5be7df4](https://github.com/AntelopeJS/stripe/commit/5be7df4))

### 🤖 CI

- Add GitHub Workflow to validate interface export ([#8](https://github.com/AntelopeJS/stripe/pull/8))

### ❤️ Contributors

- Antony Rizzitelli <upd4ting@gmail.com>
- Thomas ([@Thomasims](http://github.com/Thomasims))
- Fabrice Cst <fabrice@altab.be>
- Glastis ([@Glastis](http://github.com/Glastis))

## [0.1.0](https://github.com/AntelopeJS/stripe/compare/v0.0.1...v0.1.0) (2025-05-29)

### Features

- default config ([#4](https://github.com/AntelopeJS/stripe/issues/4)) ([ba52fca](https://github.com/AntelopeJS/stripe/commit/ba52fcafd9b17070457d7498f8b99c47d865367d))

## 0.0.1 (2025-05-08)
