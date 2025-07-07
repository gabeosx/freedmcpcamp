#!/usr/bin/env node

import { FreedcampMcpServer } from './core/server.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

// Redirect console.log to stderr so it doesn't interfere with JSON responses
// This is important for stdio transport.
// const originalConsoleLog = console.log; // Keep a reference to the original
console.log = (...args) => { // Direct assignment for console.log
  process.stderr.write(args.map(arg =>
    typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
  ).join(' ') + '\n');
};
// console.error already writes to stderr by default.

async function main() {
  try {
    // Log startup message to stderr so it's visible but doesn't break MCP
    console.log("Initializing Freedcamp MCP server for CLI (stdio)...");

    const mcpServer = new FreedcampMcpServer();
    const transport = new StdioServerTransport();

    // The connect method in the SDK typically handles the lifecycle.
    // Logging after connect might not be reached if connect blocks indefinitely.
    await mcpServer.getServer().connect(transport);

    // This line might only be reached if connect has a way to complete or is backgrounded.
    // For stdio, it usually runs until the process is terminated.
    console.log("Freedcamp MCP server connected via Stdio transport."); // This will go to stderr

  } catch (error: any) {
    // Use console.error for errors as it goes to stderr
    console.error(`Error starting Freedcamp MCP server (CLI): ${error.message}`);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

main();