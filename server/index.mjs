import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const port = Number(process.env.PORT || 8787);
const dataFile = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'events.json');

async function readEvents() {
  try {
    return JSON.parse(await readFile(dataFile, 'utf8'));
  } catch {
    return [];
  }
}

async function saveEvents(events) {
  await mkdir(dirname(dataFile), { recursive: true });
  await writeFile(dataFile, JSON.stringify(events, null, 2), 'utf8');
}

function sendJson(response, status, payload) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': process.env.CORS_ORIGIN || '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  });
  response.end(JSON.stringify(payload));
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error('Request body too large'));
        request.destroy();
      }
    });
    request.on('end', () => resolve(body));
    request.on('error', reject);
  });
}

const server = createServer(async (request, response) => {
  if (request.method === 'OPTIONS') return sendJson(response, 204, {});
  if (request.method === 'GET' && request.url === '/health') return sendJson(response, 200, { ok: true });

  if (request.method === 'POST' && request.url === '/api/events/batch') {
    try {
      const body = JSON.parse(await readBody(request));
      if (!body || !Array.isArray(body.events) || body.events.length === 0 || body.events.length > 100) {
        return sendJson(response, 400, { error: 'events must be a non-empty array of at most 100 items' });
      }
      const events = await readEvents();
      const existingIds = new Set(events.map((event) => event.id));
      const accepted = body.events.filter((event) => event && typeof event.id === 'string' && !existingIds.has(event.id));
      await saveEvents(events.concat(accepted).slice(-5000));
      return sendJson(response, 200, { accepted: accepted.length });
    } catch (error) {
      return sendJson(response, 400, { error: error instanceof Error ? error.message : 'Invalid request' });
    }
  }

  return sendJson(response, 404, { error: 'Not found' });
});

server.listen(port, '0.0.0.0', () => {
  console.log(`KidGuard REST API listening on http://localhost:${port}`);
});
