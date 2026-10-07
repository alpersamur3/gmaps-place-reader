#!/usr/bin/env node
// MCP server for AI agents (Claude Code, Claude Desktop and other MCP clients) over stdio; see docs/mcp.md.
//   gmaps-mcp     tools: search, place, reviews, photos
// Configuration: MAPS_CHROME_PATH, MAPS_PROFILE_DIR (recommended), MAPS_MCP_MAX_READS, MAPS_MCP_MAX_PHOTOS, MAPS_MCP_PAUSE_MS.
// stdout carries only protocol messages, one JSON object per line.
import readline from 'node:readline';
import { createMcpServer } from '../src/mcp.js';

const write = message => { if (message) process.stdout.write(JSON.stringify(message) + '\n'); };
const server = createMcpServer({ notify: write });
const lines = readline.createInterface({ input: process.stdin });
lines.on('line', line => {
  if (!line.trim()) return;
  let message;
  try { message = JSON.parse(line); } catch {
    write({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
    return;
  }
  server.handle(message).then(write, () => {});
});
// The client closed the connection or stopped the server: close Chrome, then exit.
let stopping = false;
const stop = async () => {
  if (stopping) return;
  stopping = true;
  await server.close();
  process.exit(0);
};
lines.on('close', stop);
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
