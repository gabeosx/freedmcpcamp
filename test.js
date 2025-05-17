import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import 'dotenv/config';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load environment variables from .env file
if (!process.env.FREEDCAMP_API_KEY || !process.env.FREEDCAMP_API_SECRET || !process.env.FREEDCAMP_PROJECT_ID) {
  console.error("Error: Required environment variables are not set. Please check your .env file.");
  process.exit(1);
}

// You can either set these as environment variables:
// FREEDCAMP_API_KEY
// FREEDCAMP_API_SECRET
// FREEDCAMP_PROJECT_ID
//
// Or pass them directly:
const API_KEY = process.env.FREEDCAMP_API_KEY;
const API_SECRET = process.env.FREEDCAMP_API_SECRET;
const PROJECT_ID = process.env.FREEDCAMP_PROJECT_ID;

async function testMcpServer() {
  const client = new Client({
    name: "freedcamp-mcp-client",
    version: "1.0.0",
    capabilities: {
      tools: {}  // Enable tools capability
    }
  });

  // Set up the transport
  const serverPath = resolve(__dirname, 'dist/server.js');
  const transport = new StdioClientTransport({
    command: "node",
    args: [serverPath]
  });

  try {
    // Connect to the server
    await client.connect(transport);
    console.log("Connected!");

    // Test the tools
    const tools = await client.listTools();
    console.log("Available tools:", tools);

    // Test add_task
    const addResult = await client.callTool({
      name: "add_task",
      arguments: {
        api_key: API_KEY,
        api_secret: API_SECRET,
        project_id: PROJECT_ID,
        title: "Test task",
        description: "This is a test task"
      }
    });
    console.log("Add task result:", addResult);

    // Extract task ID from the response
    const taskIdMatch = addResult.content[0].text.match(/Task created with ID: (\d+)/);
    if (!taskIdMatch) {
      throw new Error("Failed to get task ID from response");
    }
    const taskId = taskIdMatch[1];

    // Test update_task
    const updateResult = await client.callTool({
      name: "update_task",
      arguments: {
        api_key: API_KEY,
        api_secret: API_SECRET,
        task_id: taskId,
        title: "Updated test task",
        description: "This is an updated test task"
      }
    });
    console.log("Update task result:", updateResult);

    // Test delete_task
    const deleteResult = await client.callTool({
      name: "delete_task",
      arguments: {
        api_key: API_KEY,
        api_secret: API_SECRET,
        task_id: taskId
      }
    });
    console.log("Delete task result:", deleteResult);

  } catch (error) {
    console.error("Error:", error);
  } finally {
    await client.close();
  }
}

testMcpServer(); 