import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { lookupCanonEntry } from "./canon.mjs";
import { FileCampaignStore } from "./store.mjs";

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

function createRouter({ store, canonRoot }) {
  return async function route(request, response) {
    const url = new URL(request.url, "http://localhost");
    const pathname = url.pathname;

    try {
      if (request.method === "GET" && pathname === "/health") {
        jsonResponse(response, 200, { status: "ok" });
        return;
      }

      if (request.method === "POST" && pathname === "/campaigns") {
        const payload = await readJsonBody(request);
        const created = await store.createCampaign(payload);
        jsonResponse(response, 200, created);
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
        const result = await lookupCanonEntry({
          canonRoot,
          query: payload.query,
          queryType: payload.query_type ?? "unknown",
        });
        jsonResponse(response, 200, result);
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
  dataDir,
  canonRoot,
} = {}) {
  const resolvedDataDir =
    dataDir ?? path.join(process.cwd(), ".local", "gpt-actions-api-data");
  const resolvedCanonRoot = canonRoot ?? path.join(process.cwd(), "content", "canon");

  const store = new FileCampaignStore({ dataDir: resolvedDataDir });
  await store.init();

  const httpServer = createServer(createRouter({ store, canonRoot: resolvedCanonRoot }));

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
  const dataDir = process.env.DATA_DIR;
  const canonRoot = process.env.CANON_ROOT;

  const server = await startGptActionsServer({ port, host, dataDir, canonRoot });
  process.stdout.write(`ASOIAF GPT Actions API listening at ${server.baseUrl}\n`);
}
