import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { lookupCanonEntry } from "./canon.mjs";
import { createPool } from "./db.mjs";
import { PostgresCampaignStore } from "./store.mjs";

function jsonResponse(response, statusCode, body) {
  response.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

async function readJsonBody(request) {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function readBooleanQuery(value) {
  return value === "true" || value === "1" || value === "yes";
}

function createRouter({ store, canonRoot }) {
  return async function route(request, response) {
    const url = new URL(request.url, "http://localhost");
    const pathname = url.pathname;

    try {
      if (request.method === "GET" && pathname === "/health") {
        jsonResponse(response, 200, { status: "ok" });
        return;
      }

      if (request.method === "GET" && pathname === "/campaigns") {
        const campaigns = await store.listCampaigns({
          includeArchived: readBooleanQuery(url.searchParams.get("include_archived")),
        });
        jsonResponse(response, 200, campaigns);
        return;
      }

      if (request.method === "POST" && pathname === "/campaigns") {
        const payload = await readJsonBody(request);
        const created = await store.createCampaign(payload);
        jsonResponse(response, 200, created);
        return;
      }

      const campaignMatch = pathname.match(/^\/campaigns\/([^/]+)$/);
      if (request.method === "GET" && campaignMatch) {
        const campaign = await store.getCampaign(campaignMatch[1]);
        if (!campaign) {
          jsonResponse(response, 404, { error: "Campaign not found." });
          return;
        }

        jsonResponse(response, 200, campaign);
        return;
      }

      const archiveMatch = pathname.match(/^\/campaigns\/([^/]+)\/archive$/);
      if (request.method === "POST" && archiveMatch) {
        const archived = await store.archiveCampaign(archiveMatch[1]);
        if (!archived) {
          jsonResponse(response, 404, { error: "Campaign not found." });
          return;
        }

        jsonResponse(response, 200, archived);
        return;
      }

      const cloneMatch = pathname.match(/^\/campaigns\/([^/]+)\/clone$/);
      if (request.method === "POST" && cloneMatch) {
        const payload = await readJsonBody(request);
        const cloned = await store.cloneCampaign(cloneMatch[1], payload);
        if (!cloned) {
          jsonResponse(response, 404, { error: "Campaign not found." });
          return;
        }

        jsonResponse(response, 200, cloned);
        return;
      }

      const sceneMatch = pathname.match(/^\/campaigns\/([^/]+)\/scene-packet$/);
      if (request.method === "GET" && sceneMatch) {
        const scenePacket = await store.getScenePacket(sceneMatch[1]);
        if (!scenePacket) {
          jsonResponse(response, 404, { error: "Campaign not found." });
          return;
        }

        jsonResponse(response, 200, scenePacket);
        return;
      }

      const auditMatch = pathname.match(/^\/campaigns\/([^/]+)\/continuity-audit$/);
      if (request.method === "GET" && auditMatch) {
        const audit = await store.getContinuityAudit(auditMatch[1]);
        if (!audit) {
          jsonResponse(response, 404, { error: "Campaign not found." });
          return;
        }

        jsonResponse(response, 200, audit);
        return;
      }

      const checkpointMatch = pathname.match(/^\/campaigns\/([^/]+)\/checkpoints$/);
      if (request.method === "POST" && checkpointMatch) {
        const payload = await readJsonBody(request);
        const saved = await store.saveCheckpoint(checkpointMatch[1], payload);
        if (!saved) {
          jsonResponse(response, 404, { error: "Campaign not found." });
          return;
        }

        jsonResponse(response, 200, saved);
        return;
      }

      if (request.method === "POST" && pathname === "/canon/lookup") {
        const payload = await readJsonBody(request);
        const query = payload.query;
        const queryType = payload.query_type ?? "unknown";
        const cached = await store.getCanonCache({ query, queryType });

        if (cached) {
          jsonResponse(response, 200, {
            ...cached.result,
            cache: {
              hit: true,
              cached_at: cached.cached_at,
            },
          });
          return;
        }

        const result = await lookupCanonEntry({
          canonRoot,
          query,
          queryType,
        });
        await store.saveCanonCache({ query, queryType, result });
        jsonResponse(response, 200, {
          ...result,
          cache: {
            hit: false,
          },
        });
        return;
      }

      jsonResponse(response, 404, { error: "Route not found." });
    } catch (error) {
      jsonResponse(response, 500, {
        error: error instanceof Error ? error.message : "Unknown server error.",
      });
    }
  };
}

export async function startGptActionsServer({
  port = 3000,
  host = "127.0.0.1",
  canonRoot,
  store,
  connectionString,
} = {}) {
  const resolvedCanonRoot = canonRoot ?? path.join(process.cwd(), "content", "canon");
  const resolvedStore =
    store ??
    new PostgresCampaignStore({
      pool: createPool({ connectionString }),
    });

  await resolvedStore.init();

  const httpServer = createServer(createRouter({ store: resolvedStore, canonRoot: resolvedCanonRoot }));

  await new Promise((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(port, host, resolve);
  });

  const address = httpServer.address();
  const actualPort = typeof address === "object" && address ? address.port : port;

  return {
    baseUrl: `http://${host}:${actualPort}`,
    close: () =>
      new Promise((resolve, reject) => {
        httpServer.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      }),
  };
}

const entryFilePath = fileURLToPath(import.meta.url);

if (process.argv[1] === entryFilePath) {
  const port = Number(process.env.PORT ?? 3000);
  const host = process.env.HOST ?? "127.0.0.1";
  const canonRoot = process.env.CANON_ROOT;
  const connectionString = process.env.DATABASE_URL;

  const server = await startGptActionsServer({ port, host, canonRoot, connectionString });
  process.stdout.write(`ASOIAF GPT Actions API listening at ${server.baseUrl}\n`);
}
