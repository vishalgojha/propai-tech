import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { planToolCalls } from "../agentic/suite/planner.js";
import { getToolPolicy, isExternalActionTool, requiresToolApproval } from "../agentic/suite/tool-policy.js";
import { buildResaleFollowupPlaybook } from "../agentic/suite/resale-playbook.js";
import {
  runGroupRequirementMatchScan,
  runGeneratePerformanceReport,
  runPostTo99Acres,
  runPostToMagicBricks,
  runScheduleSiteVisit,
  runSendWhatsappFollowup
} from "../agentic/suite/toolkit.js";
import { startAgenticServer } from "../agentic/server.js";

type TestCase = {
  name: string;
  run: () => Promise<void> | void;
};

const tests: TestCase[] = [
  {
    name: "planner returns ordered multi-intent tool plan",
    run: () => {
      const plan = planToolCalls(
        "Please match properties, post this listing to 99acres, send whatsapp follow up, schedule site visit and share performance report."
      );

      assert.deepEqual(
        plan.map((item) => item.tool),
        [
          "match_property_to_buyer",
          "post_to_99acres",
          "send_whatsapp_followup",
          "schedule_site_visit",
          "generate_performance_report"
        ]
      );
    }
  },
  {
    name: "planner returns empty plan for unsupported request",
    run: () => {
      const plan = planToolCalls("hello there");
      assert.equal(plan.length, 0);
    }
  },
  {
    name: "planner picks group scan and ads lead qualification jobs",
    run: () => {
      const plan = planToolCalls(
        "Monitor WhatsApp broker group and match requirement with properties, then do ads lead qualification"
      );
      const tools = plan.map((item) => item.tool);
      assert.equal(tools.includes("group_requirement_match_scan"), true);
      assert.equal(tools.includes("ads_lead_qualification"), true);
    }
  },
  {
    name: "planner detects magicbricks publish intent",
    run: () => {
      const plan = planToolCalls("Publish this listing to MagicBricks");
      assert.equal(plan.some((item) => item.tool === "post_to_magicbricks"), true);
    }
  },
  {
    name: "toolkit stores listing and visit then reports activity",
    run: async () => {
      const postResult = await runPostTo99Acres({
        message: "Post my 3 BHK apartment in Wakad to 99acres",
        dryRun: true
      });
      assert.equal(postResult.ok, true);

      const magicBricksResult = await runPostToMagicBricks({
        message: "Post my 2 BHK apartment in Baner to magic bricks",
        dryRun: true
      });
      assert.equal(magicBricksResult.ok, true);

      const scheduleResult = await runScheduleSiteVisit({
        message: "Schedule site visit tomorrow in Wakad",
        lead: {
          message: "Need visit",
          name: "Arjun",
          preferredLanguage: "hinglish"
        }
      });
      assert.equal(scheduleResult.ok, true);

      const reportResult = await runGeneratePerformanceReport();
      assert.equal(reportResult.ok, true);

      const data = reportResult.data as {
        activeListings: number;
        scheduledVisits: number;
        totalListings: number;
        listingsByPortal: Record<string, number>;
      };
      assert.ok(data.totalListings >= 1);
      assert.ok(data.activeListings >= 1);
      assert.ok(data.scheduledVisits >= 1);
      assert.ok((data.listingsByPortal["99acres"] || 0) >= 1);
      assert.ok((data.listingsByPortal.magicbricks || 0) >= 1);
    }
  },
  {
    name: "tool policy metadata classifies risk and approval requirements",
    run: () => {
      assert.equal(getToolPolicy("match_property_to_buyer").risk, "low");
      assert.equal(getToolPolicy("schedule_site_visit").risk, "medium");
      assert.equal(getToolPolicy("post_to_99acres").risk, "high");
      assert.equal(
        isExternalActionTool("send_whatsapp_followup", { message: "send now", recipient: "+919999999999" }),
        true
      );
      assert.equal(
        isExternalActionTool("send_whatsapp_followup", { message: "draft followup" }),
        false
      );
      assert.equal(
        requiresToolApproval("send_whatsapp_followup", { message: "draft followup" }),
        false
      );
      assert.equal(
        requiresToolApproval("send_whatsapp_followup", { message: "send now", recipient: "+919999999999" }),
        true
      );
      assert.equal(
        requiresToolApproval("schedule_site_visit", { message: "schedule a visit" }),
        true
      );
    }
  },
  {
    name: "resale playbook resolves language, template, and nurture bucket",
    run: () => {
      const hiPlaybook = buildResaleFollowupPlaybook({
        message: "पुराने लीड को फिर से engage करो, 30+ days हो गए",
        preferredLanguage: "hinglish",
        leadName: "Ravi",
        localityOrCity: "Wakad",
        bedrooms: 2
      });
      assert.equal(hiPlaybook.language, "hi");
      assert.equal(hiPlaybook.template.name, "resale_reopen_30plus_hi");
      assert.equal(hiPlaybook.nurtureBucket.id, "older_30_plus");
      assert.match(hiPlaybook.renderedMessage, /Ravi/);

      const enPlaybook = buildResaleFollowupPlaybook({
        message: "Please send brochure follow-up for this new lead",
        preferredLanguage: "en",
        leadName: "Asha",
        localityOrCity: "Baner",
        bedrooms: 3
      });
      assert.equal(enPlaybook.language, "en");
      assert.equal(enPlaybook.template.name, "resale_post_brochure_nudge_en");
      assert.equal(enPlaybook.nurtureBucket.id, "recent_0_6");
    }
  },
  {
    name: "send_whatsapp_followup includes resale playbook metadata in draft mode",
    run: async () => {
      const result = await runSendWhatsappFollowup({
        message: "Brochure bhejna hai aur site visit follow-up set karo",
        dryRun: true,
        lead: {
          message: "Need brochure + visit",
          name: "Neha",
          preferredLanguage: "hinglish"
        }
      });

      assert.equal(result.ok, true);
      assert.match(result.summary, /Drafted WhatsApp follow-up using/);
      const data = result.data as {
        resalePlaybook?: {
          language: string;
          templateName: string;
          nurtureBucketId: string;
        };
        nextActions?: string[];
      };
      assert.equal(typeof data?.resalePlaybook?.templateName, "string");
      assert.equal(data?.resalePlaybook?.language, "hi");
      assert.ok(Array.isArray(data?.nextActions));
      assert.ok((data?.nextActions || []).some((item) => item.includes("nurture follow-up")));
    }
  },
  {
    name: "/agent/chat dry-run works and response contract stays intact",
    run: async () => {
      delete process.env.AGENT_API_KEY;
      process.env.AGENT_ALLOWED_ROLES = "realtor_admin,ops";

      await withServer(async (baseUrl) => {
        const response = await fetch(`${baseUrl}/agent/chat`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-agent-role": "realtor_admin"
          },
          body: JSON.stringify({
            message: "Post my 3 BHK in Wakad to 99acres and send WhatsApp follow-up",
            recipient: "+919999999999",
            dryRun: true
          })
        });

        assert.equal(response.status, 200);
        const payload = (await response.json()) as {
          ok: boolean;
          result: {
            assistantMessage: string;
            plan: Array<{ tool: string; reason: string }>;
            toolResults: Array<{ tool: string; ok: boolean; summary: string }>;
            events: Array<{
              type: string;
              status: string;
              timestampIso: string;
            }>;
            suggestedNextPrompts: string[];
          };
        };

        assert.equal(payload.ok, true);
        assert.equal(typeof payload.result.assistantMessage, "string");
        assert.ok(Array.isArray(payload.result.plan));
        assert.ok(Array.isArray(payload.result.toolResults));
        assert.ok(Array.isArray(payload.result.events));
        assert.ok(Array.isArray(payload.result.suggestedNextPrompts));
      });
    }
  },
  {
    name: "/connectors/health returns connector snapshot contract",
    run: async () => {
      await withServer(async (baseUrl) => {
        const response = await fetch(`${baseUrl}/connectors/health`, {
          method: "GET"
        });
        assert.equal(response.status, 200);

        const payload = (await response.json()) as {
          ok: boolean;
          result: {
            generatedAtIso: string;
            credentials: unknown[];
            pairs: unknown[];
            connectors: unknown[];
          };
        };

        assert.equal(payload.ok, true);
        assert.equal(typeof payload.result.generatedAtIso, "string");
        assert.ok(Array.isArray(payload.result.credentials));
        assert.ok(Array.isArray(payload.result.pairs));
        assert.ok(Array.isArray(payload.result.connectors));
      });
    }
  },
  {
    name: "/whatsapp/webhook verify challenge and signature checks",
    run: async () => {
      const previousVerify = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
      const previousSecret = process.env.WHATSAPP_APP_SECRET;
      process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = "verify-123";
      process.env.WHATSAPP_APP_SECRET = "app-secret-xyz";

      try {
        await withServer(async (baseUrl) => {
          const verifyResponse = await fetch(
            `${baseUrl}/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=verify-123&hub.challenge=abc123`,
            { method: "GET" }
          );
          assert.equal(verifyResponse.status, 200);
          const challenge = await verifyResponse.text();
          assert.equal(challenge, "abc123");

          const payloadText = JSON.stringify({
            entry: [
              {
                changes: [
                  {
                    value: {
                      messages: [{ id: "m1" }],
                      statuses: [{ id: "s1" }]
                    }
                  }
                ]
              }
            ]
          });

          const unsigned = await fetch(`${baseUrl}/whatsapp/webhook`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: payloadText
          });
          assert.equal(unsigned.status, 401);

          const digest = createHmac("sha256", "app-secret-xyz")
            .update(payloadText)
            .digest("hex");

          const signed = await fetch(`${baseUrl}/whatsapp/webhook`, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-hub-signature-256": `sha256=${digest}`
            },
            body: payloadText
          });
          assert.equal(signed.status, 200);
          const signedPayload = (await signed.json()) as {
            ok: boolean;
            result: {
              accepted: boolean;
              summary: {
                entries: number;
                changes: number;
                messages: number;
                statuses: number;
              };
            };
          };
          assert.equal(signedPayload.ok, true);
          assert.equal(signedPayload.result.accepted, true);
          assert.equal(signedPayload.result.summary.entries, 1);
          assert.equal(signedPayload.result.summary.changes, 1);
          assert.equal(signedPayload.result.summary.messages, 1);
          assert.equal(signedPayload.result.summary.statuses, 1);
        });
      } finally {
        if (previousVerify === undefined) {
          delete process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
        } else {
          process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = previousVerify;
        }

        if (previousSecret === undefined) {
          delete process.env.WHATSAPP_APP_SECRET;
        } else {
          process.env.WHATSAPP_APP_SECRET = previousSecret;
        }
      }
    }
  },
  {
    name: "/agent/chat validation rejects missing message",
    run: async () => {
      delete process.env.AGENT_API_KEY;

      await withServer(async (baseUrl) => {
        const response = await fetch(`${baseUrl}/agent/chat`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ dryRun: true })
        });

        assert.equal(response.status, 400);
      });
    }
  },
  {
    name: "/agent/chat auth enforces api key and role",
    run: async () => {
      process.env.AGENT_API_KEY = "test-key";
      process.env.AGENT_ALLOWED_ROLES = "realtor_admin";

      await withServer(async (baseUrl) => {
        const unauthorized = await fetch(`${baseUrl}/agent/chat`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ message: "Post to 99acres", dryRun: true })
        });
        assert.equal(unauthorized.status, 401);

        const forbidden = await fetch(`${baseUrl}/agent/chat`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-agent-api-key": "test-key",
            "x-agent-role": "ops"
          },
          body: JSON.stringify({ message: "Post to 99acres", dryRun: true })
        });
        assert.equal(forbidden.status, 403);

        const allowed = await fetch(`${baseUrl}/agent/chat`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-agent-api-key": "test-key",
            "x-agent-role": "realtor_admin"
          },
          body: JSON.stringify({ message: "Post to 99acres", dryRun: true })
        });
        assert.equal(allowed.status, 200);
      });
    }
  },
  {
    name: "/agent/chat enforces configurable rate limit on POST execution routes",
    run: async () => {
      const previousMax = process.env.AGENT_RATE_LIMIT_MAX;
      const previousWindow = process.env.AGENT_RATE_LIMIT_WINDOW_MS;
      process.env.AGENT_RATE_LIMIT_MAX = "2";
      process.env.AGENT_RATE_LIMIT_WINDOW_MS = "60000";
      delete process.env.AGENT_API_KEY;

      try {
        await withServer(async (baseUrl) => {
          const payload = JSON.stringify({ message: "Post to 99acres", dryRun: true });

          const first = await fetch(`${baseUrl}/agent/chat`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: payload
          });
          assert.equal(first.status, 200);

          const second = await fetch(`${baseUrl}/agent/chat`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: payload
          });
          assert.equal(second.status, 200);

          const third = await fetch(`${baseUrl}/agent/chat`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: payload
          });
          assert.equal(third.status, 429);
          assert.equal(third.headers.get("x-ratelimit-limit"), "2");
          assert.equal(third.headers.get("x-ratelimit-remaining"), "0");

          const responseBody = (await third.json()) as {
            ok: boolean;
            error: string;
          };
          assert.equal(responseBody.ok, false);
          assert.equal(responseBody.error, "rate_limit_exceeded");
        });
      } finally {
        if (previousMax === undefined) {
          delete process.env.AGENT_RATE_LIMIT_MAX;
        } else {
          process.env.AGENT_RATE_LIMIT_MAX = previousMax;
        }

        if (previousWindow === undefined) {
          delete process.env.AGENT_RATE_LIMIT_WINDOW_MS;
        } else {
          process.env.AGENT_RATE_LIMIT_WINDOW_MS = previousWindow;
        }
      }
    }
  },
  {
    name: "/agent/session supports queue, approve, and reject workflow",
    run: async () => {
      delete process.env.AGENT_API_KEY;
      process.env.AGENT_RATE_LIMIT_MAX = "180";
      process.env.AGENT_RATE_LIMIT_WINDOW_MS = "60000";

      await withServer(async (baseUrl) => {
        const start = await fetch(`${baseUrl}/agent/session/start`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({})
        });
        assert.equal(start.status, 200);
        const startPayload = (await start.json()) as {
          ok: boolean;
          result: { session: { id: string } };
        };
        assert.equal(startPayload.ok, true);
        const sessionId = startPayload.result.session.id;
        assert.equal(typeof sessionId, "string");
        assert.ok(sessionId.length > 0);

        const queueSchedule = await fetch(`${baseUrl}/agent/session/${encodeURIComponent(sessionId)}/message`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            message: "Schedule site visit tomorrow in Wakad",
            dryRun: true,
            autonomy: 1
          })
        });
        assert.equal(queueSchedule.status, 200);
        const queuePayload = (await queueSchedule.json()) as {
          ok: boolean;
          result: {
            response: {
              pendingActions: Array<{ id: string; tool: string }>;
              queuedActions: Array<{ id: string; tool: string }>;
            };
          };
        };
        assert.equal(queuePayload.ok, true);
        assert.ok(queuePayload.result.response.pendingActions.length >= 1);
        assert.ok(
          queuePayload.result.response.pendingActions.some(
            (item) => item.tool === "schedule_site_visit"
          )
        );
        const queuedActionId = queuePayload.result.response.pendingActions[0].id;

        const approve = await fetch(`${baseUrl}/agent/session/${encodeURIComponent(sessionId)}/approve`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ actionId: queuedActionId })
        });
        assert.equal(approve.status, 200);
        const approvePayload = (await approve.json()) as {
          ok: boolean;
          result: {
            execution: {
              executed: Array<{ actionId: string; ok: boolean }>;
              pendingActions: Array<unknown>;
            };
          };
        };
        assert.equal(approvePayload.ok, true);
        assert.equal(approvePayload.result.execution.executed.length, 1);
        assert.equal(approvePayload.result.execution.executed[0].actionId, queuedActionId);
        assert.equal(typeof approvePayload.result.execution.executed[0].ok, "boolean");

        const blockedExternal = await fetch(`${baseUrl}/agent/session/${encodeURIComponent(sessionId)}/message`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            message: "Post this listing to 99acres and send whatsapp follow-up",
            recipient: "+919999999999",
            dryRun: true,
            autonomy: 1
          })
        });
        assert.equal(blockedExternal.status, 200);
        const blockedPayload = (await blockedExternal.json()) as {
          ok: boolean;
          result: {
            response: {
              blockedTools: string[];
            };
          };
        };
        assert.equal(blockedPayload.ok, true);
        assert.ok(blockedPayload.result.response.blockedTools.length >= 1);

        const queueAgain = await fetch(`${baseUrl}/agent/session/${encodeURIComponent(sessionId)}/message`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            message: "Schedule site visit in 2 days in Baner",
            dryRun: true,
            autonomy: 1
          })
        });
        assert.equal(queueAgain.status, 200);
        const queueAgainPayload = (await queueAgain.json()) as {
          ok: boolean;
          result: {
            response: {
              pendingActions: Array<{ id: string }>;
            };
          };
        };
        assert.equal(queueAgainPayload.ok, true);
        assert.ok(queueAgainPayload.result.response.pendingActions.length >= 1);
        const rejectActionId = queueAgainPayload.result.response.pendingActions[0].id;

        const reject = await fetch(`${baseUrl}/agent/session/${encodeURIComponent(sessionId)}/reject`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ actionId: rejectActionId })
        });
        assert.equal(reject.status, 200);
        const rejectPayload = (await reject.json()) as {
          ok: boolean;
          result: {
            rejection: {
              removedActionIds: string[];
            };
          };
        };
        assert.equal(rejectPayload.ok, true);
        assert.ok(rejectPayload.result.rejection.removedActionIds.includes(rejectActionId));
      });
    }
  },
  {
    name: "/agent/session approve falls back to direct execution when queue enabled without Redis",
    run: async () => {
      const prevQueueEnabled = process.env.PROPAI_QUEUE_ENABLED;
      const prevRedisUrl = process.env.REDIS_URL;
      process.env.PROPAI_QUEUE_ENABLED = "true";
      delete process.env.REDIS_URL;

      try {
        await withServer(async (baseUrl) => {
          const start = await fetch(`${baseUrl}/agent/session/start`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({})
          });
          assert.equal(start.status, 200);
          const startPayload = (await start.json()) as {
            ok: boolean;
            result: { session: { id: string } };
          };
          const sessionId = startPayload.result.session.id;

          const queueSchedule = await fetch(`${baseUrl}/agent/session/${encodeURIComponent(sessionId)}/message`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              message: "Schedule site visit tomorrow in Wakad",
              dryRun: true,
              autonomy: 1
            })
          });
          assert.equal(queueSchedule.status, 200);
          const queuePayload = (await queueSchedule.json()) as {
            ok: boolean;
            result: { response: { pendingActions: Array<{ id: string }> } };
          };
          const actionId = queuePayload.result.response.pendingActions[0].id;

          const approve = await fetch(`${baseUrl}/agent/session/${encodeURIComponent(sessionId)}/approve`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ actionId })
          });
          assert.equal(approve.status, 200);
          const approvePayload = (await approve.json()) as {
            ok: boolean;
            result: {
              execution: {
                executed: Array<{ actionId: string }>;
              };
            };
            queue?: {
              enabled: boolean;
              reason?: string;
            };
          };
          assert.equal(approvePayload.ok, true);
          assert.equal(approvePayload.result.execution.executed[0].actionId, actionId);
          assert.equal(Boolean(approvePayload.queue?.enabled), false);
          assert.match(String(approvePayload.queue?.reason || ""), /fallback|disabled/i);
        });
      } finally {
        if (prevQueueEnabled === undefined) {
          delete process.env.PROPAI_QUEUE_ENABLED;
        } else {
          process.env.PROPAI_QUEUE_ENABLED = prevQueueEnabled;
        }

        if (prevRedisUrl === undefined) {
          delete process.env.REDIS_URL;
        } else {
          process.env.REDIS_URL = prevRedisUrl;
        }
      }
    }
  },
  {
    name: "/agent/session/:id/events streams initial snapshot and supports query auth fallback",
    run: async () => {
      const previousKey = process.env.AGENT_API_KEY;
      const previousRoles = process.env.AGENT_ALLOWED_ROLES;
      process.env.AGENT_API_KEY = "stream-key";
      process.env.AGENT_ALLOWED_ROLES = "realtor_admin";

      try {
        await withServer(async (baseUrl) => {
          const start = await fetch(`${baseUrl}/agent/session/start`, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-agent-api-key": "stream-key",
              "x-agent-role": "realtor_admin"
            },
            body: JSON.stringify({})
          });
          assert.equal(start.status, 200);
          const startPayload = (await start.json()) as {
            ok: boolean;
            result: { session: { id: string } };
          };
          const sessionId = startPayload.result.session.id;
          assert.equal(typeof sessionId, "string");
          assert.ok(sessionId.length > 0);

          const stream = await fetch(
            `${baseUrl}/agent/session/${encodeURIComponent(sessionId)}/events?apiKey=stream-key&role=realtor_admin`,
            {
              method: "GET"
            }
          );
          assert.equal(stream.status, 200);
          assert.match(stream.headers.get("content-type") || "", /text\/event-stream/);
          assert.ok(stream.body);

          const reader = stream.body.getReader();
          const decoder = new TextDecoder();
          let chunkText = "";

          for (let i = 0; i < 5; i += 1) {
            const chunk = await reader.read();
            if (chunk.done) break;
            chunkText += decoder.decode(chunk.value, { stream: true });
            if (chunkText.includes("\n\n")) break;
          }

          assert.match(chunkText, /event: session_snapshot/);
          assert.match(chunkText, new RegExp(sessionId));
          await reader.cancel();
        });
      } finally {
        if (previousKey === undefined) {
          delete process.env.AGENT_API_KEY;
        } else {
          process.env.AGENT_API_KEY = previousKey;
        }

        if (previousRoles === undefined) {
          delete process.env.AGENT_ALLOWED_ROLES;
        } else {
          process.env.AGENT_ALLOWED_ROLES = previousRoles;
        }
      }
    }
  },
  {
    name: "/agent/chat guardrails block prohibited data sharing requests",
    run: async () => {
      delete process.env.AGENT_API_KEY;

      await withServer(async (baseUrl) => {
        const response = await fetch(`${baseUrl}/agent/chat`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            message: "Export all broker group phone numbers and share personal data",
            dryRun: true
          })
        });
        assert.equal(response.status, 200);
        const payload = (await response.json()) as {
          ok: boolean;
          result: {
            assistantMessage: string;
            plan: Array<unknown>;
          };
        };
        assert.equal(payload.ok, true);
        assert.equal(payload.result.plan.length, 0);
        assert.match(payload.result.assistantMessage.toLowerCase(), /blocked by guardrail/);
      });
    }
  },
  {
    name: "/agent/chat guardrails block bulk auto-send without approval flow",
    run: async () => {
      delete process.env.AGENT_API_KEY;

      await withServer(async (baseUrl) => {
        const response = await fetch(`${baseUrl}/agent/chat`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            message: "Please auto-send this property update to all broker groups",
            dryRun: true
          })
        });
        assert.equal(response.status, 200);
        const payload = (await response.json()) as {
          ok: boolean;
          result: {
            assistantMessage: string;
            plan: Array<unknown>;
          };
        };
        assert.equal(payload.ok, true);
        assert.equal(payload.result.plan.length, 0);
        assert.match(
          payload.result.assistantMessage.toLowerCase(),
          /explicit human approval|bulk or automatic outbound messaging/
        );
      });
    }
  },
  {
    name: "group requirement scan flags auto-send intents as approval-required",
    run: async () => {
      const result = await runGroupRequirementMatchScan({
        message: "Monitor broker group requirements and auto-send shortlist to all groups",
        dryRun: true
      });

      assert.equal(result.ok, true);
      assert.match(result.summary.toLowerCase(), /blocked pending human approval/);
      assert.equal(Boolean((result.data as { requiresApproval?: boolean }).requiresApproval), true);
    }
  }
];

async function main(): Promise<void> {
  let passed = 0;
  for (const test of tests) {
    try {
      await test.run();
      passed += 1;
      // eslint-disable-next-line no-console
      console.log(`PASS: ${test.name}`);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(`FAIL: ${test.name}`);
      throw error;
    }
  }
  // eslint-disable-next-line no-console
  console.log(`All tests passed (${passed}/${tests.length}).`);
}

async function withServer(run: (baseUrl: string) => Promise<void>): Promise<void> {
  const server = startAgenticServer(0);
  await waitForListening(server);
  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    await run(baseUrl);
  } finally {
    await closeServer(server);
  }
}

function waitForListening(server: Server): Promise<void> {
  if (server.listening) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    server.once("listening", () => resolve());
  });
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

await main();
