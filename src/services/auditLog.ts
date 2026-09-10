import type { Firestore, Query } from "@google-cloud/firestore";
import { getFirestore } from "../config/database";
import { config } from "../config";
import { createLogger } from "../utils/logger";
import type { Chunk } from "../types/retrieval.types";

const log = createLogger("AuditLog");

/** One record per chat response (`docs/RESPONSIBILITY.md` #6). */
export const AUDIT_LOG_COLLECTION = "chat_audit_log";

/**
 * Chunk id + source (filename) identify the citation without duplicating its body.
 * `docs/SPECS.md` §11 is why chunk text is deliberately kept out of a Firestore document —
 * the corpus already owns it and a document has a size limit.
 */
export interface AuditLogCitation {
  id: string;
  source: string;
}

export interface AuditLogRecord {
  query: string;
  answer: string;
  citations: AuditLogCitation[];
  model: string;
  mode: string;
  /** Caller identity — same scheme `quotaKeyFor` uses (token hash, IP, or "anonymous"). */
  caller: string;
  timestamp: string;
}

export const buildAuditLogRecord = (input: {
  query: string;
  answer: string;
  chunks: Chunk[];
  model: string;
  mode: string;
  caller: string;
  timestamp?: string;
}): AuditLogRecord => ({
  query: input.query,
  answer: input.answer,
  citations: input.chunks.map((chunk) => ({ id: chunk.id, source: chunk.source })),
  model: input.model,
  mode: input.mode,
  caller: input.caller,
  timestamp: input.timestamp ?? new Date().toISOString(),
});

/**
 * Best-effort write of one audit record.
 *
 * **Never throws.** Callers fire this without awaiting it, so an unhandled rejection here would
 * surface as a process-level warning rather than a request-level one either way — but the real
 * reason is the contract itself: losing an audit row is bad, dropping a customer's answer because
 * Firestore hiccuped is worse, so every failure is swallowed and logged instead of propagated.
 */
export const writeAuditLog = async (record: AuditLogRecord, db?: Firestore): Promise<void> => {
  if (!config.audit.enabled) {
    return;
  }
  try {
    const firestore = db ?? getFirestore();
    await firestore.collection(AUDIT_LOG_COLLECTION).add(record);
  } catch (error) {
    log.error("Failed to write an audit log record; the response was still sent.", error);
  }
};

/**
 * The lookup path (`docs/RESPONSIBILITY.md` #6): a record that exists but cannot be pulled under
 * time pressure is not an audit trail. Filters by caller and/or an ISO timestamp range — both
 * optional, both combinable — newest first.
 */
export const findAuditLogRecords = async (
  db: Firestore | undefined,
  filter: { caller?: string; since?: string; until?: string; limit?: number } = {},
): Promise<Array<AuditLogRecord & { id: string }>> => {
  const firestore = db ?? getFirestore();
  let query: Query = firestore.collection(AUDIT_LOG_COLLECTION);
  if (filter.caller) {
    query = query.where("caller", "==", filter.caller);
  }
  if (filter.since) {
    query = query.where("timestamp", ">=", filter.since);
  }
  if (filter.until) {
    query = query.where("timestamp", "<=", filter.until);
  }
  query = query.orderBy("timestamp", "desc").limit(filter.limit ?? 50);

  const snapshot = await query.get();
  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...(doc.data() as AuditLogRecord),
  }));
};
