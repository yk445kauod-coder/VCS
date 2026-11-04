import { createRuntime } from '../server/runtime.js';
import { startMcpStdio } from './server.js';

/** Entrypoint: `node --import tsx src/mcp/stdio.ts` (used by MCP clients). */
const runtime = await createRuntime();
await startMcpStdio(runtime);
