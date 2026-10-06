import { createServer } from 'node:http';
import { appendFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEventData } from './lib/parse-event.mjs';

const MAX_BODY_BYTES = 1024 * 1024;

export function createSink({ eventsFile, log = console }) {
  return createServer(async (req, res) => {
    if (req.method !== 'POST' || req.url !== '/alert') {
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'POST /alert only' }));
      return;
    }

    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        res.writeHead(413, { 'content-type': 'application/json' });
        // Destroy the request only AFTER the 413 has flushed. Calling req.destroy()
        // synchronously after res.end() tore down the socket before the response could
        // reach the client, so oversized posts surfaced as ECONNRESET instead of a real 413.
        res.end(JSON.stringify({ error: 'payload too large' }), () => req.destroy());
        return;
      }
      chunks.push(chunk);
    }

    let record;
    try {
      record = parseEventData(JSON.parse(Buffer.concat(chunks).toString('utf8')), Date.now());
    } catch (error) {
      log.error(`bad forward payload: ${error.message}`);
      res.writeHead(400, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
      return;
    }

    await mkdir(dirname(resolve(eventsFile)), { recursive: true });
    await appendFile(eventsFile, `${JSON.stringify(record)}\n`);
    log.log(`${record.eventType} forward=${record.forwardLatencyMs}ms`);

    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, eventType: record.eventType }));
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.LAB_FORWARD_PORT ?? 5199);
  const eventsFile = process.env.LAB_EVENTS_FILE
    ?? fileURLToPath(new URL('../artifacts/events.ndjson', import.meta.url));
  createSink({ eventsFile }).listen(port, '127.0.0.1', () => {
    console.log(`sink: http://127.0.0.1:${port}/alert -> ${eventsFile}`);
  });
}
