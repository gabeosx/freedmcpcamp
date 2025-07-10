#!/usr/bin/env node

import express, { Request, Response } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import dotenv from "dotenv";
import createMcpServer, { FreedcampMcpConfig } from "./mcpServer.js";

// Load environment variables
dotenv.config();

// Validate required environment variables
function validateEnvironment(): FreedcampMcpConfig {
  const required = ['FREEDCAMP_API_KEY', 'FREEDCAMP_API_SECRET', 'FREEDCAMP_PROJECT_ID'];
  const missing = required.filter(envVar => !process.env[envVar]);
  
  if (missing.length > 0) {
    console.error(`Missing required environment variables: ${missing.join(', ')}`);
    console.error('Please ensure these environment variables are set:');
    console.error('  FREEDCAMP_API_KEY - Your Freedcamp API key');
    console.error('  FREEDCAMP_API_SECRET - Your Freedcamp API secret');
    console.error('  FREEDCAMP_PROJECT_ID - Your Freedcamp project ID');
    process.exit(1);
  }

  return {
    apiKey: process.env.FREEDCAMP_API_KEY!,
    apiSecret: process.env.FREEDCAMP_API_SECRET!,
    projectId: process.env.FREEDCAMP_PROJECT_ID!
  };
}

// Helper function to create a new server instance
function getServer(config: FreedcampMcpConfig) {
  return createMcpServer(config);
}

// Main function
async function main() {
  // Validate environment and get config
  const config = validateEnvironment();

  const app = express();
  app.use(express.json());

  // Health check endpoint
  app.get('/health', (req, res) => {
    res.json({ 
      status: 'healthy', 
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      transport: 'http-stateless'
    });
  });

  // Handle POST requests for client-to-server communication (STATELESS MODE)
  app.post('/mcp', async (req: Request, res: Response) => {
    // In stateless mode, create a new instance of transport and server for each request
    // to ensure complete isolation. A single instance would cause request ID collisions
    // when multiple clients connect concurrently.
    
    try {
      const server = getServer(config); 
      const transport: StreamableHTTPServerTransport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });
      res.on('close', () => {
        console.log('Request closed');
        transport.close();
        server.close();
      });
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error('Error handling MCP request:', error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: 'Internal server error',
          },
          id: null,
        });
      }
    }
  });

  // SSE notifications not supported in stateless mode
  app.get('/mcp', async (req: Request, res: Response) => {
    console.log('Received GET MCP request');
    res.writeHead(405).end(JSON.stringify({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Method not allowed."
      },
      id: null
    }));
  });

  // Session termination not needed in stateless mode
  app.delete('/mcp', async (req: Request, res: Response) => {
    console.log('Received DELETE MCP request');
    res.writeHead(405).end(JSON.stringify({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Method not allowed."
      },
      id: null
    }));
  });

  // Start the server
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Freedcamp MCP Stateless HTTP Server listening on port ${PORT}`);
    console.log(`Health check available at: http://localhost:${PORT}/health`);
    console.log(`MCP endpoint available at: http://localhost:${PORT}/mcp`);
    console.log(`Server running in STATELESS mode - no sessions are maintained`);
    console.log('Environment variables loaded:');
    console.log(`  FREEDCAMP_API_KEY: ${config.apiKey ? '***' : 'NOT SET'}`);
    console.log(`  FREEDCAMP_API_SECRET: ${config.apiSecret ? '***' : 'NOT SET'}`);
    console.log(`  FREEDCAMP_PROJECT_ID: ${config.projectId || 'NOT SET'}`);
  });
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('Received SIGINT, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

// Start the server
main().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
