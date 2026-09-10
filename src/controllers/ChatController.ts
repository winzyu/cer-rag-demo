import { NextFunction, Request, Response } from "express";
import { retrievalRegistry } from "../retrieval";
import type { RetrievalRegistry } from "../retrieval/RetrievalRegistry";
import type { Chunk } from "../types/retrieval.types";
import { buildMessages } from "../prompt/promptBuilder";
import { LlmService } from "../services/LlmService";
import type { LlmUsage } from "../services/LlmService";
import { ChatOrchestrator } from "../services/ChatOrchestrator";
import { buildToolRegistry } from "../tools";
import { parseChatRequest } from "../validators/chatValidators";
import { QuotaService, quotaKeyFor, quotaService } from "../quota";
import { buildAuditLogRecord, writeAuditLog } from "../services/auditLog";
import { createStreamingCommentaryFilter } from "../utils/answerFormat";
import { callerToken } from "../utils/bearerToken";
import { resolveErrorCode } from "../utils/errors";
import { createLogger } from "../utils/logger";
import { openSseStream, writeSseEvent } from "../utils/sse";

const log = createLogger("Chat");

/**
 * Chat endpoint: retrieve context, assemble the prompt, answer.
 *
 * Streaming is **opt-in** via `{ stream: true }`, not the default. The JSON path stays the
 * simple one because the Phase N2 bake-off harness captures whole answers plus token counts,
 * and non-browser callers should not have to parse SSE. Phase N7's chat UI will likely make
 * streaming the default for browsers — revisit then.
 */
export class ChatController {
  private readonly registry: RetrievalRegistry;

  private readonly llm: LlmService;

  private readonly orchestrator: ChatOrchestrator;

  private readonly quota: QuotaService;

  constructor(
    registry: RetrievalRegistry = retrievalRegistry,
    llm: LlmService = new LlmService(),
    // With SENSOR_TOOL off the registry is empty, the orchestrator offers nothing, and its
    // first round is a single tool-free call — byte-identical to the pre-N3 request the
    // bake-off arms were captured against.
    orchestrator: ChatOrchestrator = new ChatOrchestrator(llm, buildToolRegistry()),
    // The process-wide counters. Refusing is `quotaGuard`'s job, one layer up; the controller
    // only records what a request spent, and every method here is inert while QUERY_QUOTA is off.
    quota: QuotaService = quotaService,
  ) {
    this.registry = registry;
    this.llm = llm;
    this.orchestrator = orchestrator;
    this.quota = quota;
  }

  postChat = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const {
        query, retrieval, stream, history, device,
      } = parseChatRequest(req.body);

      // Counted here rather than in the gate: a request that failed validation never reached
      // retrieval or the model, so charging a weekly allowance for a typo'd body would be a
      // bill for nothing. `quotaKeyFor` is pure, so this is the same bucket `quotaGuard` read.
      const quotaKey = quotaKeyFor(req);
      this.quota.recordRequest(quotaKey);

      // Caller identity for the audit record (`docs/RESPONSIBILITY.md` #6). Forced to "caller"
      // scope regardless of `QUERY_QUOTA_SCOPE` — the audit trail must identify who asked even
      // when the quota counter itself is bucketed globally.
      const callerId = quotaKeyFor(req, "caller");

      // Selection rules (including the DEBUG_RETRIEVAL override rule) live in the
      // registry, so this controller stays a thin HTTP wrapper.
      const adapter = this.registry.resolve(retrieval);
      const chunks = await adapter.getContext(query);

      // Ordering is load-bearing for prompt caching — see promptBuilder.
      const messages = buildMessages({ query, chunks, history });

      // The device API scopes every response to the token holder's organization, so the caller's
      // own token has to reach the tool. Falling back to `DEVICE_API_TOKEN` — which is what
      // happened before this was threaded, and again inside `DeviceApiClient` until that default
      // was removed — answers one user's question out of the deployment's own fleet.
      //
      // Not gated by `requireCallerToken`: chat over the document corpus reads nothing org-scoped
      // and must keep working without a token. The org-scoped half is the tool path, which
      // refuses on its own (`querySensorData.ts`, `generateReport.ts`) when this is undefined.
      const token = callerToken(req);

      if (stream) {
        await this.streamAnswer(
          res,
          messages,
          adapter.mode,
          chunks,
          quotaKey,
          query,
          callerId,
          device,
          token,
        );
        return;
      }

      // The chosen pod travels as a call argument, not as controller or orchestrator state:
      // both are constructed once at boot and shared by every request, so anything stored on
      // them would be visible to whatever request runs next. With SENSOR_TOOL off the
      // orchestrator has no tools and this is simply ignored — accepted, with no effect.
      const answer = await this.orchestrator.run(messages, { device, token });

      // Retrospective by necessity — a prompt's cost is not knowable before the call. The
      // request that crosses a token ceiling completes; the next one is refused.
      this.quota.recordTokens(quotaKey, answer.usage.totalTokens);

      // Fire-and-forget: `writeAuditLog` never throws and must not delay a response already
      // decided (§ "A logging failure must never fail a user's answer").
      writeAuditLog(buildAuditLogRecord({
        query,
        answer: answer.content,
        chunks,
        model: answer.model,
        mode: adapter.mode,
        caller: callerId,
      }));

      res.status(200).json({
        answer: answer.content,
        model: answer.model,
        mode: adapter.mode,
        // Retrieved context is returned so the caller can show provenance. N5 turns these
        // into inline quote citations.
        citations: chunks,
        usage: answer.usage,
        // Tool results are traced, never cited (MIGRATION_SPEC §3 rule 4) — a sensor reading is
        // this deployment's own measurement, not a claim attributable to a corpus document.
        // Omitted entirely when no tool ran, so the pre-N3 response shape is unchanged.
        ...(answer.invocations.length > 0 ? { tool_calls: answer.invocations } : {}),
        ...(answer.capped ? { tool_round_cap_reached: true } : {}),
      });
    } catch (error) {
      // Express 4 does not forward async rejections — without this, a failing
      // adapter or LLM call would hang the request instead of reaching the error handler.
      next(error);
    }
  };

  /**
   * Emits `meta` (provenance, before any token), then `token` events, then `done`.
   *
   * Citations go first deliberately: once tokens start arriving the UI needs somewhere to
   * anchor them, and after the first byte the status code can no longer change.
   */
  private streamAnswer = async (
    res: Response,
    messages: ReturnType<typeof buildMessages>,
    mode: string,
    chunks: Chunk[],
    quotaKey: string,
    query: string,
    callerId: string,
    device?: string,
    token?: string,
  ): Promise<void> => {
    const controller = new AbortController();
    /**
     * A client that closes the tab should stop costing us tokens.
     *
     * This must listen on `res`, not `req`. Since Node 16 `req` emits `close` when the *request*
     * finishes, and `express.json()` has already drained the body before this handler runs — so
     * `req.on("close")` fires on the next tick and aborts the upstream call about 3ms after it
     * starts, before a single token arrives. `res` emits `close` when the response is done or the
     * socket really is gone, which is the event this is trying to catch. The `writableEnded`
     * guard keeps a normal completion from aborting a call that already finished.
     */
    res.on("close", () => {
      if (!res.writableEnded) {
        controller.abort();
      }
    });

    openSseStream(res);
    writeSseEvent(res, "meta", { mode, citations: chunks });

    try {
      if (this.orchestrator.hasTools) {
        // **Known limitation.** With tools enabled the answer is not token-streamed: the loop
        // cannot know a round is the last one until it comes back without tool calls, by which
        // point the text already exists. Re-issuing that round as a stream would double the
        // cost of every answer, so the finished text is emitted as a single token event and the
        // SSE contract holds. Real streaming needs incremental `delta.tool_calls` assembly —
        // N7's chat UI is the phase that will want it.
        const answer = await this.orchestrator.run(messages, {
          device,
          token,
          signal: controller.signal,
        });
        this.quota.recordTokens(quotaKey, answer.usage.totalTokens);
        writeSseEvent(res, "token", { text: answer.content });
        writeSseEvent(res, "done", {
          model: answer.model,
          usage: answer.usage,
          ...(answer.invocations.length > 0 ? { tool_calls: answer.invocations } : {}),
          ...(answer.capped ? { tool_round_cap_reached: true } : {}),
        });
        writeSseEvent(res, "end", {});

        writeAuditLog(buildAuditLogRecord({
          query,
          answer: answer.content,
          chunks,
          model: answer.model,
          mode,
          caller: callerId,
        }));
        return;
      }

      let model: string | undefined;
      let usage: LlmUsage | undefined;
      // The tool branch gets its marker stripping from `ChatOrchestrator`; this branch bypasses
      // the orchestrator entirely, so without this a leaked `【commentary…】` reached the UI
      // verbatim on the default configuration — the exact defect `answerFormat` exists to fix.
      const commentary = createStreamingCommentaryFilter();
      // Accumulated for the audit record — nothing else on this path holds the full answer text,
      // since tokens are only ever written out to the client one piece at a time.
      let fullAnswer = "";

      for await (const event of this.llm.completeStream(messages, controller.signal)) {
        if (event.text) {
          const text = commentary.push(event.text);
          if (text) {
            fullAnswer += text;
            writeSseEvent(res, "token", { text });
          }
        }
        if (event.model) {
          model = event.model;
        }
        if (event.usage) {
          usage = event.usage;
        }
      }

      // Recorded whether or not the provider reported usage: `recordTokens` drops an absent
      // count rather than charging zero, since "free" and "not reported" are different facts.
      this.quota.recordTokens(quotaKey, usage?.totalTokens);

      const tail = commentary.flush();
      if (tail) {
        fullAnswer += tail;
        writeSseEvent(res, "token", { text: tail });
      }

      // Unconditional, like the tool branch above. `stream_options.include_usage` support varies
      // by provider (`LlmService.completeStream`), and gating `done` on it meant that against a
      // provider that omits usage the client saw `meta` → `token`* → `end` and never ran the
      // `done` handler that renders provenance and the series chart.
      writeSseEvent(res, "done", { model, ...(usage ? { usage } : {}) });
      writeSseEvent(res, "end", {});

      writeAuditLog(buildAuditLogRecord({
        query,
        answer: fullAnswer,
        chunks,
        // The provider omitting `model` on this path is possible in principle (LlmService's own
        // types allow it) but not observed; "unknown" keeps the record queryable by model rather
        // than dropping the field.
        model: model ?? "unknown",
        mode,
        caller: callerId,
      }));
    } catch (error) {
      // Headers are already sent, so the status code cannot be changed and the central
      // error handler cannot render this. Report it in-band instead of dying silently.
      const message = error instanceof Error ? error.message : "Stream failed.";
      log.error(`Stream failed: ${message}`);
      // Same shape as `errorHandler`'s JSON body, `code` included. The status line went out with
      // `openSseStream` before the LLM was ever called, so this event is the only place a coded
      // failure — `llm_not_configured`, `device_timeout` — can reach the client on this path.
      const code = resolveErrorCode(error);
      writeSseEvent(res, "error", { error: message, message, ...(code ? { code } : {}) });
    } finally {
      res.end();
    }
  };
}
