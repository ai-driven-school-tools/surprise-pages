import { z } from "zod";
import { deckEditOperationsSchema,deckEditRecordOperationsSchema } from "../deck/edit/model";

export const PAGE_AGENT_PROTOCOL = 1;
export const PAGE_AGENT_TTL_MS = 3 * 86400000;
export const agentIssueSchema = z
  .object({
    slideId: z.string(),
    target: z.string().optional(),
    kind: z.enum(["overflow", "overlap", "asset", "runtime", "structure"]),
    message: z.string().max(500),
  })
  .strict();
export const agentVerificationSchema = z
  .object({
    digest: z.string().length(64),
    scopeDigest: z.string().length(64).optional(),
    baseVersionId: z.string(),
    status: z.enum(["passed", "failed", "unverified"]),
    slides: z.array(z.string()).max(1000),
    issues: z.array(agentIssueSchema).max(500),
    assessment: z.string().max(4000).default(""),
    unresolved: z.array(z.string().max(500)).max(100).default([]),
  })
  .strict();
export type AgentVerification = z.infer<typeof agentVerificationSchema>;
export const agentDraftSchema = z.object({
  id: z.string().uuid(),
  page_id: z.string(),
  owner_email: z.string(),
  base_version_id: z.string(),
  operations: deckEditRecordOperationsSchema,
  summary: z.string().min(1).max(500),
  client: z.string().max(80),
  fingerprint: z.string(),
  expires_at: z.string(),
  created_at: z.string(),
  unresolved: z.array(z.string()).default([]),
  verification: agentVerificationSchema.nullable(),
  restore_version_id: z.string().nullable(),
  restore_assets: z.record(z.string(), z.string()).default({}),
});
export type AgentDraft = z.infer<typeof agentDraftSchema>;
export const agentRequestSchema = z
  .object({
    action: z.enum([
      "read",
      "prepare",
      "preview",
      "verify",
      "apply",
      "history",
      "revert",
      "restore",
      "reimport",
    ]),
    page: z.string().min(1).max(2000),
    id: z.string().uuid().optional(),
    versionId: z.string().min(1).max(100).optional(),
    baseVersionId: z.string().min(1).max(100).optional(),
    view: z
      .enum(["overview", "detail", "source", "comments", "design", "layout"])
      .default("overview"),
    target: z.string().max(100).optional(),
    query: z.string().max(200).optional(),
    offset: z.number().int().min(0).default(0),
    limit: z.number().int().min(1).max(50).default(20),
    operations: deckEditOperationsSchema.optional(),
    summary: z.string().min(1).max(500).optional(),
    client: z.string().max(80).default("agent"),
    verification: agentVerificationSchema.optional(),
    undoId: z.string().uuid().optional(),
    targets: z.array(z.string().max(100)).max(256).optional(),
    html: z
      .string()
      .max(5 * 1024 * 1024)
      .optional(),
  })
  .strict();
export type AgentRequest = z.infer<typeof agentRequestSchema>;
