import { defineConfig } from "@trigger.dev/sdk"

/**
 * Background jobs.
 *
 * Rendering a PDF runs here rather than on Vercel, so it is not bounded by a
 * function timeout and a failed stage can be retried without redoing the rest
 * (ARCHITECTURE.md §3 and §6).
 *
 * The project ref comes from the environment so that this file carries no
 * account-specific value — the same reason the R2 bucket and site URL are
 * environment variables: moving account or domain should be a variable change,
 * not an edit to the codebase.
 */
export default defineConfig({
  project: process.env.TRIGGER_PROJECT_REF ?? "proj_set_TRIGGER_PROJECT_REF",
  dirs: ["./src/trigger"],

  // A material here averages 1.68 pages, but the largest are 13 MB photographs
  // and the whole point of running off Vercel is not having to race a clock.
  maxDuration: 600,

  retries: {
    enabledInDev: false,
    default: {
      maxAttempts: 3,
      minTimeoutInMs: 1_000,
      maxTimeoutInMs: 10_000,
      factor: 2,
      randomize: true,
    },
  },

  build: {
    /**
     * None of these can be bundled. `sharp` ships a compiled binary, `mupdf` is
     * WebAssembly, and `@huggingface/transformers` pulls in `onnxruntime-node`,
     * which is a `.node` binary per platform. Trigger's own docs name exactly
     * this case — left out, the task builds fine and then fails at runtime,
     * which is the worst order to find out.
     */
    external: ["sharp", "mupdf", "@huggingface/transformers", "onnxruntime-node"],
  },
})
