import express from 'express';
import { FreedcampMcpServer } from './core/server.js';
import { StreamableHTTPServerTransport, StreamableHTTPServerTransportOptions } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

// Redirect console.log to stderr for consistency in logging, even for the HTTP server.
// This helps in containerized environments where stdout might be used for other purposes.
console.log = (...args) => {
  process.stderr.write(args.map(arg =>
    typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
  ).join(' ') + '\n');
};
// console.error already writes to stderr.

async function main() {
  console.log("Initializing Freedcamp MCP server for HTTP transport...");

  const app = express();
  const port = process.env.PORT || 3000;

  // MCP Server Setup
  const mcpServer = new FreedcampMcpServer();

  // Transport Options
  // The endpoint path for MCP requests, e.g., "/mcp"
  // The SDK's StreamableHTTPServerTransport typically handles creating the endpoint.
  const transportOptions: StreamableHTTPServerTransportOptions = {
    // No specific options are strictly required by the SDK for basic functionality,
    // but you can configure aspects like request size limits or specific behaviors if needed.
    // For now, we'll use default behavior.
    // The transport will add its own middleware to the Express app.
  };

  const httpTransport = new StreamableHTTPServerTransport(app, "/mcp", transportOptions);

  try {
    // Connect the MCP server instance to the HTTP transport
    // The `connect` method for HTTP transport usually means integrating with the Express app
    // rather than starting a new server listening process (Express does that).
    await mcpServer.getServer().connect(httpTransport);
    console.log(`MCP server connected to HTTP transport, endpoint available at /mcp`);

    // Start the Express server
    app.listen(port, () => {
      console.log(`HTTP server listening on port ${port}`);
      console.log(`Freedcamp MCP service available at http://localhost:${port}/mcp`);
    });

  } catch (error: any) {
    console.error(`Error starting Freedcamp MCP HTTP server: ${error.message}`);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

main();
