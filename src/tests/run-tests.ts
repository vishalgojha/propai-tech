import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { planToolCalls } from "../agentic/suite/planner.js";
import { runGeneratePerformanceReport, runPostTo99Acres, runScheduleSiteVisit } from "../agentic/suite/toolkit.js";
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
    name: "toolkit stores listing and visit then reports activity",
    run: async () => {
      const postResult = await runPostTo99Acres({
        message: "Post my 3 BHK apartment in Wakad to 99acres",
        dryRun: true
      });
      assert.equal(postResult.ok, true);

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
      };
      assert.ok(data.totalListings >= 1);
      assert.ok(data.activeListings >= 1);
      assert.ok(data.scheduledVisits >= 1);
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
