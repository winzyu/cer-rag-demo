import { config } from "../config";
import { RetrievalRegistry } from "./RetrievalRegistry";
import { StubAdapter } from "./adapters/StubAdapter";
import { DirectFeedAdapter } from "./adapters/DirectFeedAdapter";
import { GoldContextAdapter } from "./adapters/GoldContextAdapter";
import { FirestoreVectorAdapter } from "./adapters/FirestoreVectorAdapter";
import { HybridSliceVectorAdapter } from "./adapters/HybridSliceVectorAdapter";
import { RrfHybridAdapter } from "./adapters/RrfHybridAdapter";
import { LocalVectorAdapter } from "./adapters/LocalVectorAdapter";
import { ArtifactCorpusSource } from "./sources/ArtifactCorpusSource";
import { FirestoreCorpusSource } from "./sources/FirestoreCorpusSource";
import type { CorpusSource } from "./sources/corpusSource";

/** Builds the corpus source named by `CORPUS_SOURCE`. Construction is cheap and opens nothing. */
export const createCorpusSource = (name = config.retrieval.corpusSource): CorpusSource => (
  name === "firestore" ? new FirestoreCorpusSource() : new ArtifactCorpusSource()
);

/**
 * The process-wide registry, with the built-in adapters registered.
 *
 * Registration happens here — one place — so adding a bake-off arm (Firestore vector) is a
 * single line next to the others rather than a side effect scattered through module imports.
 */
export const retrievalRegistry = new RetrievalRegistry();

retrievalRegistry.register(new StubAdapter());
retrievalRegistry.register(new DirectFeedAdapter(createCorpusSource()));

/**
 * The generation-ceiling arm: labelled-relevant chunks, verbatim, with no retrieval involved.
 * Reads only the label files and the ingestion artifact — no network, no embeddings.
 */
retrievalRegistry.register(new GoldContextAdapter());

/**
 * Bake-off arm ◆G10. Unlike the pgvector arm — now archived under `archive/pgvector-rag/` — this
 * one survives ◆G7: it runs on the store the service already uses, so keeping it costs no
 * infrastructure even if direct-feed wins.
 *
 * The Firestore client is constructed lazily and holds no connection, so registering this needs
 * no credentials — same reason the direct-feed arm can be registered with a Firestore source in a
 * process that never reads from it.
 */
retrievalRegistry.register(new FirestoreVectorAdapter());

/**
 * The same dense retrieval as the arm above, computed in process against a pre-built cache. It
 * needs no credentials, no vector index, and no network at registration time — the cache is read
 * lazily on the first query, so a process that never selects this mode never touches the disk.
 *
 * Registered alongside `firestore-vector` rather than replacing it: the bake-off's Firestore-cost
 * question (◆G10) is still answered by that arm, while this one makes retrieval-only evaluation
 * runnable offline and free.
 */
retrievalRegistry.register(new LocalVectorAdapter());

/**
 * The composed arm: the operator tier always, plus dense retrieval over the manuals.
 *
 * Registered from the two adapters above rather than re-implementing either, because the seam
 * was designed for exactly this — `timeline.md` names a split outcome (direct-feed the
 * authoritative tier, RAG the long manuals) as a legitimate result of ◆G7, and composing it here
 * is the whole cost of acting on that. Rationale and the measurements that motivated it are in
 * the adapter's own doc comment.
 */
retrievalRegistry.register(new HybridSliceVectorAdapter(
  new DirectFeedAdapter(createCorpusSource()),
  new LocalVectorAdapter(),
));

/**
 * Dense + lexical, fused with RRF — the legacy hybrid restored (`RETRIEVAL_BAKEOFF.md` §4b records
 * its loss as the "dead lexical branch"). The BM25 index is built from `corpus.json` on first use,
 * so this needs no embedding cache to *register* and no credentials.
 */
retrievalRegistry.register(new RrfHybridAdapter(new LocalVectorAdapter()));

/**
 * The full stack: operator tier always, plus dense+lexical fusion over the manuals. Composed from
 * the three adapters above rather than reimplementing any of them.
 */
retrievalRegistry.register(new HybridSliceVectorAdapter(
  new DirectFeedAdapter(createCorpusSource()),
  new RrfHybridAdapter(new LocalVectorAdapter(), "local-hybrid-inner"),
  undefined,
  "hybrid-slice-lexvec",
));

export { RetrievalRegistry } from "./RetrievalRegistry";
export { StubAdapter } from "./adapters/StubAdapter";
export { HybridSliceVectorAdapter } from "./adapters/HybridSliceVectorAdapter";
export { RrfHybridAdapter, RRF_K, FUSION_DEPTH } from "./adapters/RrfHybridAdapter";
export { DirectFeedAdapter } from "./adapters/DirectFeedAdapter";
export { GoldContextAdapter } from "./adapters/GoldContextAdapter";
export {
  CHUNK_COLLECTION,
  DISTANCE_FIELD,
  DISTANCE_MEASURE,
  FirestoreVectorAdapter,
  VECTOR_FIELD,
  chunkDocumentFields,
  chunkDocumentId,
} from "./adapters/FirestoreVectorAdapter";
export {
  BUILD_COMMAND,
  EMBEDDING_CACHE_PATH,
  LocalVectorAdapter,
  cosineSimilarity,
  dotProduct,
  magnitude,
  readEmbeddingCache,
  validateEmbeddingCache,
} from "./adapters/LocalVectorAdapter";
export type { CachedChunk, EmbeddingCache } from "./adapters/LocalVectorAdapter";
export { ArtifactCorpusSource } from "./sources/ArtifactCorpusSource";
export { FirestoreCorpusSource, CORPUS_COLLECTION } from "./sources/FirestoreCorpusSource";
export type { CorpusDocument, CorpusSource } from "./sources/corpusSource";
export { DEFAULT_TOP_K, MAX_TOP_K, resolveTopK } from "./options";
export type {
  Chunk,
  GetContextOptions,
  RetrievalAdapter,
} from "../types/retrieval.types";
