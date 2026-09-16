import { pipeline } from "@huggingface/transformers"
import { assertDimensions, DIMENSIONS } from "../../lib/vector"

/**
 * Turning text into vectors, locally. ARCHITECTURE.md §3 and §9.
 *
 * This runs on our own machine — no API, no account, no quota, and nothing
 * sent anywhere. That is the whole reason for the choice: the archive can be
 * indexed and searched by meaning without a paid service or a training-data
 * question.
 *
 * bge-small-en-v1.5 gives 384 dimensions, which is what src/db/schema/search.ts
 * declares. It also keeps the index small enough for Neon's 0.5 GB free plan —
 * a larger model would not fit. Changing the model means changing the schema
 * and re-embedding everything.
 *
 * Lives in server/ rather than lib/ because it downloads and caches a model:
 * network and filesystem, which lib/ does not do (CLAUDE.md).
 */

const MODEL = "Xenova/bge-small-en-v1.5"

/**
 * bge asks for this prefix on the *query* side of a search, and nothing on the
 * document side. Skipping it measurably weakens retrieval, so it is applied
 * here rather than left to each caller to remember.
 */
const QUERY_PREFIX = "Represent this sentence for searching relevant passages: "

// biome-ignore lint/suspicious/noExplicitAny: the pipeline's type is not exported
let extractor: Promise<any> | null = null

/**
 * The model is fetched once (~33 MB) and cached on disk, so the first call is
 * slow and every later one is not.
 */
function model() {
  if (!extractor) extractor = pipeline("feature-extraction", MODEL)
  return extractor
}

async function run(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return []

  const extract = await model()
  const output = await extract(texts, { pooling: "cls", normalize: true })

  const vectors = output.tolist() as number[][]
  for (const vector of vectors) assertDimensions(vector)
  return vectors
}

/**
 * Embed material text. Batched, because the whole archive is ~1,100 pages and
 * feeding them one at a time wastes most of the model's throughput.
 */
export async function embedDocuments(texts: string[], batchSize = 16): Promise<number[][]> {
  const out: number[][] = []
  for (let i = 0; i < texts.length; i += batchSize) {
    out.push(...(await run(texts.slice(i, i + batchSize))))
  }
  return out
}

/** Embed one document — a chunk, or a category name for suggestion matching. */
export async function embedDocument(text: string): Promise<number[]> {
  const [vector] = await run([text])
  return vector
}

/** Embed a search query. Carries the prefix bge expects; documents do not. */
export async function embedQuery(text: string): Promise<number[]> {
  const [vector] = await run([QUERY_PREFIX + text])
  return vector
}

export { DIMENSIONS, MODEL }
