#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import dotenv from "dotenv";
import createMcpServer, { FreedcampMcpConfig } from "./mcpServer.js";

// Load environment variables (for when running via npx)
dotenv.config();

// Get configuration from environment variables
function getConfig(): FreedcampMcpConfig {
  const apiKey = process.env.FREEDCAMP_API_KEY;
  const apiSecret = process.env.FREEDCAMP_API_SECRET;
  const projectId = process.env.FREEDCAMP_PROJECT_ID;

  if (!apiKey || !apiSecret || !projectId) {
    console.error('Missing required environment variables. Please ensure these are set:');
    console.error('  FREEDCAMP_API_KEY - Your Freedcamp API key');
    console.error('  FREEDCAMP_API_SECRET - Your Freedcamp API secret');
    console.error('  FREEDCAMP_PROJECT_ID - Your Freedcamp project ID');
    process.exit(1);
  }

  return {
    apiKey,
    apiSecret,
    projectId
  };
}

// Redirect console.log to stderr so it doesn't interfere with JSON responses
const originalConsoleLog = console.log;
console.log = (...args) => {
  process.stderr.write(args.map(arg => 
    typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
  ).join(' ') + '\n');
};

// Main function
async function main() {
  const config = getConfig();
  
  // Create the MCP server with configuration
  const server = createMcpServer(config);
  
  // Start the server with stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);
  
  console.log('Freedcamp MCP Server started with stdio transport');
}

// Start the server
main().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
