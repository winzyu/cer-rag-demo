import { CORPUS_OUTPUT, readCorpus } from "../../ingestion/ingest";
import { LABEL_DIR, loadLabels } from "../../eval/retrieval/labels";
import type { Chunk, GetContextOptions, RetrievalAdapter } from "../../types/retrieval.types";

/**
 * The generation-ceiling arm: hand the model exactly the labelled-relevant chunks for a query,
 * with no retrieval in the loop at all. This is what measures the model's quality bar on perfect
 * context — if it cannot clear the bar here, no retrieval strategy downstream can rescue it.
 *
 * Looked up by verbatim query text rather than a fixture id, so it runs through the normal
 * `getContext(query)` seam like every other arm. An unknown query throws instead of returning
 * nothing: a silently empty context here would produce a dataset that looks clean and measures
 * nothing.
 */
export class GoldContextAdapter implements RetrievalAdapter {
  readonly mode = "gold-context";

  private readonly labelDir: string;

  private readonly corpusPath: string;

  private index?: Map<string, Chunk[]>;

  constructor(labelDir: string = LABEL_DIR, corpusPath: string = CORPUS_OUTPUT) {
    this.labelDir = labelDir;
    this.corpusPath = corpusPath;
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async getContext(query: string, _opts?: GetContextOptions): Promise<Chunk[]> {
    const index = this.index ?? (this.index = this.buildIndex());
    const chunks = index.get(query);
    if (chunks === undefined) {
      throw new Error(`GoldContextAdapter: no gold-context label for query "${query}".`);
    }
    return chunks;
  }

  private buildIndex(): Map<string, Chunk[]> {
    const { queries } = loadLabels(this.labelDir, this.corpusPath);
    const corpus = readCorpus(this.corpusPath);

    const docOrder = new Map<string, number>();
    const chunkOrder = new Map<string, number>();
    const chunkText = new Map<string, string>();
    const chunkSource = new Map<string, string>();

    corpus.documents.forEach((document, position) => {
      docOrder.set(document.filename, position);
      document.chunks.forEach((chunk) => {
        chunkOrder.set(chunk.id, chunk.index);
        chunkText.set(chunk.id, chunk.text);
        chunkSource.set(chunk.id, document.sourceUrl ?? document.filename);
      });
    });

    const index = new Map<string, Chunk[]>();
    queries.forEach(({ label }) => {
      if (label.relevant.length === 0) {
        index.set(label.query, []);
        return;
      }

      const chunks = [...label.relevant]
        .sort((a, b) => {
          const docDelta = (docOrder.get(a.filename) ?? 0) - (docOrder.get(b.filename) ?? 0);
          if (docDelta !== 0) {
            return docDelta;
          }
          return (chunkOrder.get(a.chunkId) ?? 0) - (chunkOrder.get(b.chunkId) ?? 0);
        })
        .map((relevant): Chunk => {
          const text = chunkText.get(relevant.chunkId);
          if (text === undefined) {
            throw new Error(
              `GoldContextAdapter: label for "${label.query}" names chunk `
              + `${relevant.chunkId}, which is not in the corpus at ${this.corpusPath}.`,
            );
          }
          return {
            id: relevant.chunkId,
            text,
            source: chunkSource.get(relevant.chunkId) ?? relevant.filename,
          };
        });

      index.set(label.query, chunks);
    });

    return index;
  }
}
