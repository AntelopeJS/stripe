import { antelopeKnipConfig } from "@antelopejs/tooling-configs/knip";

export default antelopeKnipConfig({
  entry: ["src/index.ts", "src/test/**/*.test.ts", "src/test/antelope.test.ts"],
  ignoreBinaries: ["ajs"],
});
