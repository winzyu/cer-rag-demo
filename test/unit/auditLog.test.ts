import type { Firestore } from "@google-cloud/firestore";
import { config } from "../../src/config";
import {
  AUDIT_LOG_COLLECTION, buildAuditLogRecord, findAuditLogRecords, writeAuditLog,
} from "../../src/services/auditLog";
import type { Chunk } from "../../src/types/retrieval.types";

const chunks: Chunk[] = [
  {
    id: "chunk-1", text: "dissolved oxygen readings below 4 mg/L indicate stress", source: "usgs-nfm-a6.2.pdf", score: 0.9,
  },
  { id: "chunk-2", text: "should never appear in the audit record", source: "epa-sop.pdf" },
];

/** A minimal fake standing in for the collection this module actually reads and writes. */
const fakeCollection = (overrides: Partial<{
  add: jest.Mock;
  where: jest.Mock;
  orderBy: jest.Mock;
  limit: jest.Mock;
  get: jest.Mock;
}> = {}) => {
  const collection: any = {
    add: overrides.add ?? jest.fn().mockResolvedValue({ id: "generated-id" }),
    where: overrides.where ?? jest.fn(() => collection),
    orderBy: overrides.orderBy ?? jest.fn(() => collection),
    limit: overrides.limit ?? jest.fn(() => collection),
    get: overrides.get ?? jest.fn().mockResolvedValue({ docs: [] }),
  };
  return collection;
};

const fakeDb = (collection: ReturnType<typeof fakeCollection>): Firestore => ({
  collection: jest.fn().mockReturnValue(collection),
} as unknown as Firestore);

describe("buildAuditLogRecord", () => {
  it("keeps only the chunk id and source, never the chunk text", () => {
    const record = buildAuditLogRecord({
      query: "is dissolved oxygen safe at 3 mg/L?",
      answer: "That is below the threshold discussed in the context.",
      chunks,
      model: "test-model",
      mode: "direct-feed",
      caller: "token:abc123",
      timestamp: "2026-09-09T00:00:00.000Z",
    });

    expect(record).toEqual({
      query: "is dissolved oxygen safe at 3 mg/L?",
      answer: "That is below the threshold discussed in the context.",
      citations: [
        { id: "chunk-1", source: "usgs-nfm-a6.2.pdf" },
        { id: "chunk-2", source: "epa-sop.pdf" },
      ],
      model: "test-model",
      mode: "direct-feed",
      caller: "token:abc123",
      timestamp: "2026-09-09T00:00:00.000Z",
    });
    expect(JSON.stringify(record)).not.toContain("should never appear");
  });

  it("defaults the timestamp to now when none is given", () => {
    const before = Date.now();
    const record = buildAuditLogRecord({
      query: "q", answer: "a", chunks: [], model: "m", mode: "stub", caller: "c",
    });
    const parsed = Date.parse(record.timestamp);
    expect(parsed).toBeGreaterThanOrEqual(before);
    expect(parsed).toBeLessThanOrEqual(Date.now());
  });
});

describe("writeAuditLog", () => {
  const originalEnabled = config.audit.enabled;

  afterEach(() => {
    config.audit.enabled = originalEnabled;
    jest.restoreAllMocks();
  });

  const record = buildAuditLogRecord({
    query: "q", answer: "a", chunks, model: "m", mode: "direct-feed", caller: "c", timestamp: "t",
  });

  it("writes exactly one record with the expected fields when the flag is on", async () => {
    config.audit.enabled = true;
    const add = jest.fn().mockResolvedValue({ id: "generated-id" });
    const collection = fakeCollection({ add });
    const db = fakeDb(collection);

    await writeAuditLog(record, db);

    expect(db.collection).toHaveBeenCalledWith(AUDIT_LOG_COLLECTION);
    expect(add).toHaveBeenCalledTimes(1);
    expect(add).toHaveBeenCalledWith(record);
  });

  it("does not touch Firestore when the flag is off", async () => {
    config.audit.enabled = false;
    const collection = fakeCollection();
    const db = fakeDb(collection);

    await writeAuditLog(record, db);

    expect(db.collection).not.toHaveBeenCalled();
  });

  it("swallows a Firestore failure instead of throwing", async () => {
    config.audit.enabled = true;
    jest.spyOn(console, "error").mockImplementation(() => {});
    const add = jest.fn().mockRejectedValue(new Error("Firestore is unavailable"));
    const db = fakeDb(fakeCollection({ add }));

    await expect(writeAuditLog(record, db)).resolves.toBeUndefined();
    expect(add).toHaveBeenCalledTimes(1);
  });
});

describe("findAuditLogRecords", () => {
  it("filters by caller and time range, ordered newest first", async () => {
    const where = jest.fn();
    const orderBy = jest.fn();
    const limit = jest.fn();
    const collection = fakeCollection({
      where: where.mockImplementation(() => collection),
      orderBy: orderBy.mockImplementation(() => collection),
      limit: limit.mockImplementation(() => collection),
      get: jest.fn().mockResolvedValue({
        docs: [{ id: "doc-1", data: () => ({ query: "q", caller: "token:abc" }) }],
      }),
    });
    const db = fakeDb(collection);

    const results = await findAuditLogRecords(
      db,
      { caller: "token:abc", since: "2026-09-01T00:00:00.000Z", until: "2026-09-09T00:00:00.000Z" },
    );

    expect(where).toHaveBeenCalledWith("caller", "==", "token:abc");
    expect(where).toHaveBeenCalledWith("timestamp", ">=", "2026-09-01T00:00:00.000Z");
    expect(where).toHaveBeenCalledWith("timestamp", "<=", "2026-09-09T00:00:00.000Z");
    expect(orderBy).toHaveBeenCalledWith("timestamp", "desc");
    expect(limit).toHaveBeenCalledWith(50);
    expect(results).toEqual([{ id: "doc-1", query: "q", caller: "token:abc" }]);
  });

  it("defaults to no filters and a caller-supplied limit", async () => {
    const limit = jest.fn();
    const collection = fakeCollection({
      limit: limit.mockImplementation(() => collection),
      get: jest.fn().mockResolvedValue({ docs: [] }),
    });
    const db = fakeDb(collection);

    await findAuditLogRecords(db, { limit: 5 });

    expect(collection.where).not.toHaveBeenCalled();
    expect(limit).toHaveBeenCalledWith(5);
  });
});
