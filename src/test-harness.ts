import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import { randomUUID } from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import express, { Express } from 'express';
import { Server as HttpServer } from 'http';
import fetch, { Response as FetchResponse } from 'node-fetch';
import { FreedcampMcpServer } from './core/server.js'; // MCP server
import { StreamableHTTPServerTransport, StreamableHTTPServerTransportOptions } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { McpResponse } from '@modelcontextprotocol/sdk/types.js';


// Load environment variables
dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// HTTP Test Server State
let httpTestServerInstance: HttpServer | null = null;
let httpTestServerPort: number = 3001; // Default port for HTTP tests, can be made dynamic
const MCP_HTTP_ENDPOINT = "/mcp_test";

// Function to start the MCP HTTP test server
async function startHttpTestServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (httpTestServerInstance) {
      resolve();
      return;
    }

    const app: Express = express();
    const mcpServer = new FreedcampMcpServer();

    const transportOptions: StreamableHTTPServerTransportOptions = {};
    const httpTransport = new StreamableHTTPServerTransport(app, MCP_HTTP_ENDPOINT, transportOptions);

    mcpServer.getServer().connect(httpTransport)
      .then(() => {
        httpTestServerInstance = app.listen(httpTestServerPort, () => {
          console.log(`HTTP Test Server listening on http://localhost:${httpTestServerPort}${MCP_HTTP_ENDPOINT}`);
          resolve();
        });
        httpTestServerInstance.on('error', (err) => {
          console.error('HTTP Test Server failed to start:', err);
          reject(err);
        });
      })
      .catch(err => {
        console.error('Failed to connect MCP server to HTTP transport for testing:', err);
        reject(err);
      });
  });
}

// Function to stop the MCP HTTP test server
async function stopHttpTestServer(): Promise<void> {
  return new Promise((resolve) => {
    if (httpTestServerInstance) {
      httpTestServerInstance.close(() => {
        console.log('HTTP Test Server stopped.');
        httpTestServerInstance = null;
        resolve();
      });
    } else {
      resolve();
    }
  });
}

// Helper function to send HTTP MCP requests
async function sendHttpMcpRequest(requestBody: any): Promise<McpResponse> {
  const response = await fetch(`http://localhost:${httpTestServerPort}${MCP_HTTP_ENDPOINT}`, {
    method: 'POST',
    body: JSON.stringify(requestBody),
    headers: { 'Content-Type': 'application/json' }
  });
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<McpResponse>;
}

// HTTP Test Cases
// Re-using createdTaskId and createdBulkTaskIds for HTTP tests too, will need careful reset or separation if running both test suites in one go.
// For now, assuming they are run separately or state is managed.

const httpTests = [
  {
    name: 'http_list_tools',
    request: {
      mcp_version: '1.0', // Using mcp_version for HTTP, though server might not strictly require if following JSON-RPC like structure
      id: randomUUID(),
      method: 'ListTools', // MCP SDK uses ListTools
      params: {}
    }
  },
  {
    name: 'http_add_task',
    request: {
      mcp_version: '1.0',
      id: randomUUID(),
      method: 'CallTool', // MCP SDK uses CallTool
      params: {
        name: 'freedcamp_add_task',
        arguments: {
          tasks: [
            {
              title: 'Test task from MCP via HTTP',
              description: 'This is a test task created via MCP HTTP endpoint',
              priority: 1
            }
          ]
        }
      }
    }
  },
  // list_tasks_after_add will be dynamically constructed or called
];

// Dynamically generated HTTP tests (similar to stdio ones)
function getHttpUpdateTaskTest(taskId: string) {
  if (!taskId) {
    throw new Error('No task ID available for HTTP update test');
  }
  return {
    name: 'http_update_task',
    request: {
      mcp_version: '1.0',
      id: randomUUID(),
      method: 'CallTool',
      params: {
        name: 'freedcamp_update_task',
        arguments: {
          tasks: [
            {
              task_id: taskId,
              title: 'Updated HTTP test task from MCP',
              description: 'This task was updated via MCP HTTP (single)',
              priority: 2,
              status: 1 // Set to completed
            }
          ]
        }
      }
    }
  };
}

function getHttpDeleteTaskTest(taskId: string) {
  if (!taskId) {
    throw new Error('No task ID available for HTTP delete test');
  }
  return {
    name: 'http_delete_task',
    request: {
      mcp_version: '1.0',
      id: randomUUID(),
      method: 'CallTool',
      params: {
        name: 'freedcamp_delete_task',
        arguments: {
          tasks: [
            { task_id: taskId }
          ]
        }
      }
    }
  };
}

function getHttpListTasksTest() {
  return {
    name: 'http_list_tasks',
    request: {
      mcp_version: '1.0',
      id: randomUUID(),
      method: 'CallTool',
      params: {
        name: 'freedcamp_list_tasks',
        arguments: {}
      }
    }
  };
}


// Store test state
let createdTaskId: string | null = null; // Shared between stdio and http tests for now
let createdBulkTaskIds: string[] = []; // Shared between stdio and http tests for now
let currentTest: any = null; // To help response handler identify context

// Response handler for HTTP tests
function handleHttpMcpResponse(response: McpResponse, testName: string) {
  console.log(`\nReceived HTTP response for ${testName}:`, JSON.stringify(response, null, 2));

  if (response.error) {
    console.error(`Error in HTTP JSON-RPC response for ${testName}:`, response.error);
  }

  // Similar logic to stdio handler for extracting task IDs and checking errors
  if (response.result?.content && Array.isArray(response.result.content)) {
    let hasOperationError = false;
    for (const contentItem of response.result.content) {
      if (contentItem.type === 'text' && typeof contentItem.text === 'string') {
        try {
          const parsedContent = JSON.parse(contentItem.text);
          if (parsedContent.text && (parsedContent.text.toLowerCase().includes("error") || parsedContent.text.toLowerCase().includes("failed"))) {
            console.error(`Operation error for ${testName} (item: ${contentItem.text}): ${parsedContent.text}`, parsedContent.details || parsedContent.error_details || '');
            hasOperationError = true;
          }
        } catch (e) { /* Not a JSON string from our server's format, or doesn't have an error structure, ignore for error checking */ }
      }
    }

    if (testName === 'http_add_task') {
      if (!hasOperationError && response.result.content.length > 0 && response.result.content[0].type === 'text') {
        try {
          const parsedText = JSON.parse(response.result.content[0].text);
          if (parsedText && parsedText.task_id) {
            createdTaskId = parsedText.task_id; // Update shared state
            console.log(`Stored single task ID (from HTTP): ${createdTaskId}`);
          } else {
             console.warn(`Could not extract task_id from http_add_task response item: ${response.result.content[0].text}`);
          }
        } catch (e) { console.warn(`Could not parse JSON from http_add_task response item: ${response.result.content[0].text}`, e); }
      }
    } else if (testName === 'http_bulk_add_tasks') { // Assuming a future http_bulk_add_tasks
      createdBulkTaskIds = []; // Reset
      if (!hasOperationError) {
        for (const item of response.result.content) {
          if (item.type === 'text' && typeof item.text === 'string') {
            try {
              const parsedText = JSON.parse(item.text);
              if (parsedText && parsedText.task_id) {
                createdBulkTaskIds.push(parsedText.task_id);
              } else {
                console.warn(`Could not extract task_id from ${testName} response item: ${item.text}`);
              }
            } catch (e) { console.warn(`Could not parse JSON from ${testName} response item: ${item.text}`, e); }
          }
        }
      }
      if (createdBulkTaskIds.length > 0) {
        console.log(`Stored bulk task IDs (from HTTP): ${createdBulkTaskIds.join(', ')}`);
      } else if (!hasOperationError && response.result.content.length > 0) {
        console.warn("HTTP Bulk add operation reported success, but no task IDs were extracted.");
      }
    } else if (testName.includes('list_tasks')) {
      console.log(`${testName} results:`);
      // Log content as is, specific parsing for validation would be more complex here
      response.result.content.forEach(item => console.log("- ", item.type === 'text' ? item.text : JSON.stringify(item)));
    } else if (testName.includes('update') || testName.includes('delete')) {
       console.log(`${testName} results:`);
       response.result.content.forEach(item => console.log("- ", item.type === 'text' ? item.text : JSON.stringify(item)));
    }
  }
}

// Test cases
const tests = [
  {
    name: 'initialize',
    request: {
      jsonrpc: '2.0',
      id: randomUUID(),
      method: 'initialize',
      params: {
        protocolVersion: '2025-03-26',
        serverName: 'test-client',
        serverVersion: '1.0.0',
        clientInfo: {
          name: 'test-harness',
          version: '1.0.0'
        },
        capabilities: {
          tools: {}
        }
      }
    }
  },
  {
    name: 'list_tools',
    request: {
      jsonrpc: '2.0',
      id: randomUUID(),
      method: 'tools/list',
      params: {}
    }
  },
  {
    name: 'add_task',
    request: {
      jsonrpc: '2.0',
      id: randomUUID(),
      method: 'tools/call',
      params: {
        name: 'freedcamp_add_task',
        arguments: {
          tasks: [
            {
              title: 'Test task from MCP (single)',
              description: 'This is a single test task created via MCP CLI',
              priority: 1
            }
          ]
        }
      }
    }
  },
  {
    name: 'list_tasks_after_single_add',
    request: {
      jsonrpc: '2.0',
      id: randomUUID(),
      method: 'tools/call',
      params: {
        name: 'freedcamp_list_tasks',
        arguments: {}
      }
    }
  },
  // Bulk tests will be added dynamically after single task tests
];

// Dynamically generated tests
function getUpdateTaskTest() {
  if (!createdTaskId) {
    throw new Error('No task ID available for single update test');
  }
  return {
    name: 'update_single_task',
    request: {
      jsonrpc: '2.0',
      id: randomUUID(),
      method: 'tools/call',
      params: {
        name: 'freedcamp_update_task',
        arguments: {
          tasks: [
            {
              task_id: createdTaskId,
              title: 'Updated test task from MCP (single)',
              description: 'This task was updated via MCP CLI (single)',
              priority: 2,
              status: 1 // Set to completed
            }
          ]
        }
      }
    }
  };
}

function getDeleteTaskTest() {
  if (!createdTaskId) {
    throw new Error('No task ID available for single delete test');
  }
  return {
    name: 'delete_single_task',
    request: {
      jsonrpc: '2.0',
      id: randomUUID(),
      method: 'tools/call',
      params: {
        name: 'freedcamp_delete_task',
        arguments: {
          tasks: [
            { task_id: createdTaskId }
          ]
        }
      }
    }
  };
}

const bulkAddTasksTest = {
  name: 'bulk_add_tasks',
  request: {
    jsonrpc: '2.0',
    id: randomUUID(),
    method: 'tools/call',
    params: {
      name: 'freedcamp_add_task',
      arguments: {
        tasks: [
          {
            title: 'Bulk Task 1 (MCP)',
            description: 'First task in bulk operation',
            priority: 0
          },
          {
            title: 'Bulk Task 2 (MCP)',
            description: 'Second task in bulk operation',
            priority: 1
          }
        ]
      }
    }
  }
};

function getBulkUpdateTasksTest() {
  if (createdBulkTaskIds.length < 2) {
    throw new Error('Not enough task IDs available for bulk update test');
  }
  return {
    name: 'bulk_update_tasks',
    request: {
      jsonrpc: '2.0',
      id: randomUUID(),
      method: 'tools/call',
      params: {
        name: 'freedcamp_update_task',
        arguments: {
          tasks: [
            {
              task_id: createdBulkTaskIds[0],
              title: 'Updated Bulk Task 1 (MCP)',
              status: 1 // Completed
            },
            {
              task_id: createdBulkTaskIds[1],
              description: 'Updated description for Bulk Task 2 (MCP)',
              priority: 3
            }
          ]
        }
      }
    }
  };
}

function getBulkDeleteTasksTest() {
  if (createdBulkTaskIds.length < 2) {
    throw new Error('Not enough task IDs available for bulk delete test');
  }
  return {
    name: 'bulk_delete_tasks',
    request: {
      jsonrpc: '2.0',
      id: randomUUID(),
      method: 'tools/call',
      params: {
        name: 'freedcamp_delete_task',
        arguments: {
          tasks: createdBulkTaskIds.map(id => ({ task_id: id }))
        }
      }
    }
  };
}

// --- Bulk Operation Test Definitions ---
const explicitBulkAddTest = {
  name: 'explicit_bulk_add_tasks',
  request: {
    jsonrpc: '2.0',
    id: randomUUID(),
    method: 'tools/call',
    params: {
      name: 'freedcamp_add_task',
      arguments: {
        tasks: [
          {
            title: 'Explicit Bulk Task 1 (MCP)',
            description: 'First explicit bulk task',
            priority: 0
          },
          {
            title: 'Explicit Bulk Task 2 (MCP)',
            description: 'Second explicit bulk task',
            priority: 2
          }
        ]
      }
    }
  }
};

function getExplicitBulkUpdateTest(taskIds: string[]) {
  return {
    name: 'explicit_bulk_update_tasks',
    request: {
      jsonrpc: '2.0',
      id: randomUUID(),
      method: 'tools/call',
      params: {
        name: 'freedcamp_update_task',
        arguments: {
          tasks: [
            {
              task_id: taskIds[0],
              title: 'Updated Explicit Bulk Task 1 (MCP)',
              status: 1
            },
            {
              task_id: taskIds[1],
              description: 'Updated description for Explicit Bulk Task 2 (MCP)',
              priority: 3
            }
          ]
        }
      }
    }
  };
}

function getExplicitBulkDeleteTest(taskIds: string[]) {
  return {
    name: 'explicit_bulk_delete_tasks',
    request: {
      jsonrpc: '2.0',
      id: randomUUID(),
      method: 'tools/call',
      params: {
        name: 'freedcamp_delete_task',
        arguments: {
          tasks: taskIds.map(id => ({ task_id: id }))
        }
      }
    }
  };
}

// Verify required environment variables
const requiredEnvVars = ['FREEDCAMP_API_KEY', 'FREEDCAMP_API_SECRET', 'FREEDCAMP_PROJECT_ID'];
const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingEnvVars.length > 0) {
  console.error('Error: Missing required environment variables:', missingEnvVars.join(', '));
  console.error('Please ensure these variables are set in your .env file');
  process.exit(1);
}

// Spawn the MCP server process
const serverPath = path.resolve(__dirname, '..', 'dist', 'cli.js');
const server = spawn('node', [serverPath], { 
  env: process.env, // Pass through all environment variables
  stdio: ['pipe', 'pipe', 'pipe']
});

// Handle server output
let responseBuffer = '';
server.stdout.on('data', (data) => {
  try {
    responseBuffer += data.toString();
    let newlineIndex;
    while ((newlineIndex = responseBuffer.indexOf('\n')) !== -1) {
      const jsonStr = responseBuffer.slice(0, newlineIndex);
      responseBuffer = responseBuffer.slice(newlineIndex + 1);
      
      try {
        const response = JSON.parse(jsonStr);
        console.log(`\nReceived response for ${currentTest?.name || 'unknown test'}:`, JSON.stringify(response, null, 2));

        if (response.error) {
          console.error(`Error in JSON-RPC response for ${currentTest?.name}:`, response.error);
        }

        if (response.result?.content && Array.isArray(response.result.content)) {
          let hasOperationError = false;
          for (const contentItem of response.result.content) {
            if (contentItem.type === 'text' && typeof contentItem.text === 'string') {
              try {
                const parsedContent = JSON.parse(contentItem.text); // Each item.text is a JSON string
                if (parsedContent.text && (parsedContent.text.toLowerCase().includes("error") || parsedContent.text.toLowerCase().includes("failed"))) {
                  console.error(`Operation error for ${currentTest?.name} (item: ${contentItem.text}): ${parsedContent.text}`, parsedContent.details || parsedContent.error_details || '');
                  hasOperationError = true;
                }
              } catch (e) { /* Not a JSON string from our server's format, or doesn't have an error structure, ignore for error checking */ }
            }
          }

          if (currentTest?.name === 'add_task') {
            if (!hasOperationError && response.result.content.length > 0 && response.result.content[0].type === 'text') {
              try {
                const parsedText = JSON.parse(response.result.content[0].text);
                if (parsedText && parsedText.task_id) {
                  createdTaskId = parsedText.task_id;
                  console.log(`Stored single task ID: ${createdTaskId}`);
                } else {
                   console.warn(`Could not extract task_id from add_task response item: ${response.result.content[0].text}`);
                }
              } catch (e) { console.warn(`Could not parse JSON from add_task response item: ${response.result.content[0].text}`, e); }
            }
          } else if (currentTest?.name === 'bulk_add_tasks' || currentTest?.name === 'explicit_bulk_add_tasks') {
            createdBulkTaskIds = []; // Reset
            if (!hasOperationError) {
              for (const item of response.result.content) {
                if (item.type === 'text' && typeof item.text === 'string') {
                  try {
                    const parsedText = JSON.parse(item.text);
                    if (parsedText && parsedText.task_id) {
                      createdBulkTaskIds.push(parsedText.task_id);
                    } else {
                      console.warn(`Could not extract task_id from ${currentTest.name} response item: ${item.text}`);
                    }
                  } catch (e) { console.warn(`Could not parse JSON from ${currentTest.name} response item: ${item.text}`, e); }
                }
              }
            }
            if (createdBulkTaskIds.length > 0) {
              console.log(`Stored bulk task IDs: ${createdBulkTaskIds.join(', ')}`);
            } else if (!hasOperationError && response.result.content.length > 0) {
              console.warn("Bulk add operation reported success, but no task IDs were extracted from items.");
            } else if (!hasOperationError && response.result.content.length === 0) {
              console.warn("Bulk add operation reported success, but content array was empty.");
            }
          } else if (currentTest?.name.includes('list_tasks')) {
            console.log(`${currentTest.name} results:`);
            for (const item of response.result.content) {
              if (item.type === 'text' && typeof item.text === 'string') {
                 // For list_tasks, the first item is often a summary string, not JSON
                 console.log("- ", item.text);
              } else {
                console.log("- ", JSON.stringify(item)); // Print other items
              }
            }
          } else if (currentTest?.name.includes('update') || currentTest?.name.includes('delete')) {
             console.log(`${currentTest.name} results:`);
             for (const item of response.result.content) {
                if (item.type === 'text' && typeof item.text === 'string') {
                    try {
                        const parsedText = JSON.parse(item.text);
                        console.log("- ", parsedText);
                    } catch (e) {
                        console.warn(`Could not parse JSON from ${currentTest.name} response item: ${item.text}`, e);
                    }
                }
             }
          }
        }
      } catch (parseErr) {
        if (parseErr instanceof SyntaxError && responseBuffer.length > 0) { 
          responseBuffer = jsonStr + responseBuffer; 
          break; 
        }
        console.error('Error parsing or handling response JSON:', parseErr, 'Original string:', jsonStr);
      }
    }
  } catch (err) {
    console.error('Critical error in response handling logic:', err);
  }
});

server.stderr.on('data', (data) => {
  console.error('Server STDERR:', data.toString());
});

// Run tests sequentially
async function runTests() {
  const singleTestTimeout = 2000;
  const bulkTestTimeout = 4000; // Longer for bulk operations
  const listTaskTimeout = 3000;

  console.log("--- Starting Single Operation Tests ---");
  for (const test of tests) { // `tests` array contains initialize, list_tools, add_task (single), list_tasks_after_single_add
    currentTest = test;
    console.log(`\nRunning test: ${currentTest.name}`);
    console.log('Sending request:', JSON.stringify(currentTest.request, null, 2));
    server.stdin.write(JSON.stringify(currentTest.request) + '\n');
    await new Promise(resolve => setTimeout(resolve, singleTestTimeout));

    if (currentTest.name === 'add_task') {
      await new Promise(resolve => setTimeout(resolve, 500)); // Short extra wait for ID processing
      if (createdTaskId) {
        const updateTest = getUpdateTaskTest();
        currentTest = updateTest;
        console.log(`\nRunning test: ${currentTest.name}`);
        console.log('Sending request:', JSON.stringify(currentTest.request, null, 2));
        server.stdin.write(JSON.stringify(currentTest.request) + '\n');
        await new Promise(resolve => setTimeout(resolve, singleTestTimeout));
        
        const deleteTest = getDeleteTaskTest();
        currentTest = deleteTest;
        console.log(`\nRunning test: ${currentTest.name}`);
        console.log('Sending request:', JSON.stringify(currentTest.request, null, 2));
        server.stdin.write(JSON.stringify(currentTest.request) + '\n');
        await new Promise(resolve => setTimeout(resolve, singleTestTimeout));
      } else {
        console.error('Failed to get task ID for single update/delete tests. Skipping them.');
      }
    }
  }

  console.log("\n--- Starting Bulk Operation Tests ---");

  const listTasksAfterBulkAdd = { name: 'list_tasks_after_bulk_add', request: { jsonrpc: '2.0', id: randomUUID(), method: 'tools/call', params: { name: 'freedcamp_list_tasks', arguments: {} } } };
  const listTasksAfterBulkUpdate = { name: 'list_tasks_after_bulk_update', request: { jsonrpc: '2.0', id: randomUUID(), method: 'tools/call', params: { name: 'freedcamp_list_tasks', arguments: {} } } };
  const listTasksAfterBulkDelete = { name: 'list_tasks_after_bulk_delete', request: { jsonrpc: '2.0', id: randomUUID(), method: 'tools/call', params: { name: 'freedcamp_list_tasks', arguments: {} } } };

  // Bulk Add
  currentTest = bulkAddTasksTest;
  console.log(`\nRunning test: ${currentTest.name}`);
  console.log('Sending request:', JSON.stringify(currentTest.request, null, 2));
  server.stdin.write(JSON.stringify(currentTest.request) + '\n');
  await new Promise(resolve => setTimeout(resolve, bulkTestTimeout));

  if (createdBulkTaskIds.length > 0) {
    currentTest = listTasksAfterBulkAdd;
    console.log(`\nRunning test: ${currentTest.name}`);
    console.log('Sending request:', JSON.stringify(currentTest.request, null, 2));
    server.stdin.write(JSON.stringify(currentTest.request) + '\n');
    await new Promise(resolve => setTimeout(resolve, listTaskTimeout));

    const bulkUpdateTest = getBulkUpdateTasksTest();
    currentTest = bulkUpdateTest;
    console.log(`\nRunning test: ${currentTest.name}`);
    console.log('Sending request:', JSON.stringify(currentTest.request, null, 2));
    server.stdin.write(JSON.stringify(currentTest.request) + '\n');
    await new Promise(resolve => setTimeout(resolve, bulkTestTimeout));

    currentTest = listTasksAfterBulkUpdate;
    console.log(`\nRunning test: ${currentTest.name}`);
    console.log('Sending request:', JSON.stringify(currentTest.request, null, 2));
    server.stdin.write(JSON.stringify(currentTest.request) + '\n');
    await new Promise(resolve => setTimeout(resolve, listTaskTimeout));
    
    const bulkDeleteTest = getBulkDeleteTasksTest();
    currentTest = bulkDeleteTest;
    console.log(`\nRunning test: ${currentTest.name}`);
    console.log('Sending request:', JSON.stringify(currentTest.request, null, 2));
    server.stdin.write(JSON.stringify(currentTest.request) + '\n');
    await new Promise(resolve => setTimeout(resolve, bulkTestTimeout));

    currentTest = listTasksAfterBulkDelete;
    console.log(`\nRunning test: ${currentTest.name}`);
    console.log('Sending request:', JSON.stringify(currentTest.request, null, 2));
    server.stdin.write(JSON.stringify(currentTest.request) + '\n');
    await new Promise(resolve => setTimeout(resolve, listTaskTimeout));

  } else {
    console.error('No task IDs captured from bulk add. Skipping subsequent bulk tests.');
  }

  // --- Explicit Bulk Operation Tests ---
  let explicitBulkTaskIds: string[] = [];
  currentTest = explicitBulkAddTest;
  console.log(`\nRunning test: ${currentTest.name}`);
  console.log('Sending request:', JSON.stringify(currentTest.request, null, 2));
  server.stdin.write(JSON.stringify(currentTest.request) + '\n');
  await new Promise(resolve => setTimeout(resolve, 4000));

  // Extract task IDs from explicit bulk add
  if (createdBulkTaskIds.length > 0) {
    explicitBulkTaskIds = [...createdBulkTaskIds];
    // List tasks after explicit bulk add (debugging step)
    const listTasksAfterExplicitBulkAdd = {
      name: 'list_tasks_after_explicit_bulk_add',
      request: {
        jsonrpc: '2.0',
        id: randomUUID(),
        method: 'tools/call',
        params: { name: 'freedcamp_list_tasks', arguments: {} }
      }
    };
    currentTest = listTasksAfterExplicitBulkAdd;
    console.log(`\nRunning test: ${currentTest.name}`);
    console.log('Sending request:', JSON.stringify(currentTest.request, null, 2));
    server.stdin.write(JSON.stringify(currentTest.request) + '\n');
    await new Promise(resolve => setTimeout(resolve, 4000));
    // Bulk update
    const explicitBulkUpdateTest = getExplicitBulkUpdateTest(explicitBulkTaskIds);
    currentTest = explicitBulkUpdateTest;
    console.log(`\nRunning test: ${currentTest.name}`);
    console.log('Sending request:', JSON.stringify(currentTest.request, null, 2));
    server.stdin.write(JSON.stringify(currentTest.request) + '\n');
    await new Promise(resolve => setTimeout(resolve, 4000));

    // Bulk delete
    const explicitBulkDeleteTest = getExplicitBulkDeleteTest(explicitBulkTaskIds);
    currentTest = explicitBulkDeleteTest;
    console.log(`\nRunning test: ${currentTest.name}`);
    console.log('Sending request:', JSON.stringify(currentTest.request, null, 2));
    server.stdin.write(JSON.stringify(currentTest.request) + '\n');
    await new Promise(resolve => setTimeout(resolve, 4000));
  } else {
    console.error('No task IDs captured from explicit bulk add. Skipping explicit bulk update/delete tests.');
  }

  currentTest = null; // Clear context
  console.log("\n--- All tests completed ---");
  server.stdin.end();
}

runTests().catch(console.error);

// Handle server exit
server.on('exit', (code) => {
  console.log(`\nStdio Server exited with code ${code}`);
  // Removed process.exit here to allow HTTP tests to run if main decides so
});

// Function to run HTTP tests
async function runHttpTests() {
  console.log("\n--- Starting HTTP Operation Tests ---");
  await startHttpTestServer();

  // Reset task IDs for HTTP tests if needed, or manage state more carefully
  createdTaskId = null;
  // createdBulkTaskIds = []; // If doing bulk HTTP tests

  const singleTestTimeout = 2000; // ms
  // const bulkTestTimeout = 4000; // ms
  const listTaskTimeout = 3000; // ms
  let httpTestFailures = 0;

  try {
    for (const test of httpTests) { // httpTests array
      currentTest = test; // Set context for potential generic error handlers
      console.log(`\nRunning HTTP test: ${test.name}`);
      console.log('Sending HTTP request:', JSON.stringify(test.request, null, 2));
      try {
        const response = await sendHttpMcpRequest(test.request);
        handleHttpMcpResponse(response, test.name); // Process the response
        await new Promise(resolve => setTimeout(resolve, 500)); // Small delay between requests
      } catch (error) {
        console.error(`Error during HTTP test ${test.name}:`, error);
        httpTestFailures++;
      }
    }

    // After adding a task, list, update, then delete it
    if (createdTaskId) {
      console.log(`\n--- HTTP Single Task Follow-up (ID: ${createdTaskId}) ---`);
      const followUpTests = [
        getHttpListTasksTest(),
        getHttpUpdateTaskTest(createdTaskId),
        getHttpDeleteTaskTest(createdTaskId),
        { ...getHttpListTasksTest(), name: `${getHttpListTasksTest().name}_after_delete` }
      ];

      for (const test of followUpTests) {
        currentTest = test;
        console.log(`\nRunning HTTP follow-up test: ${test.name}`);
        console.log('Sending HTTP request:', JSON.stringify(test.request, null, 2));
        try {
          const response = await sendHttpMcpRequest(test.request);
          handleHttpMcpResponse(response, test.name);
          const timeout = test.name.includes('list') ? listTaskTimeout : singleTestTimeout;
          await new Promise(resolve => setTimeout(resolve, timeout));
        } catch (error) {
          console.error(`Error during HTTP follow-up test ${test.name}:`, error);
          httpTestFailures++;
        }
      }
    } else {
      console.warn('HTTP add_task did not yield a task ID. Skipping follow-up HTTP tests.');
      // Consider if this itself should be a failure
      // For now, it's a warning, and follow-up tests are skipped.
    }

  } catch (e) {
    console.error("A critical error occurred in the HTTP test runner:", e);
    httpTestFailures++; // Count this as a general failure
  } finally {
    try {
      await stopHttpTestServer();
    } catch (e) {
      console.error("Error stopping HTTP test server:", e);
      httpTestFailures++;
    }
    console.log(`\n--- HTTP tests completed. Failures: ${httpTestFailures} ---`);
    if (httpTestFailures > 0 && (process.argv.includes('--http-only') || process.argv.includes('--all-tests'))) {
      // Only exit with error if HTTP tests were specifically run and failed.
      // Avoid exiting if stdio tests also ran and might have their own exit code.
      if (process.argv.includes('--http-only')) process.exitCode = 1;
    }
  }
}


// Main execution logic
async function main() {
  // Determine which tests to run, e.g., via command line args or env var
  const runStdio = !process.argv.includes('--http-only');
  const runHttp = process.argv.includes('--http-only') || process.argv.includes('--all-tests');

  if (runStdio) {
    await runTests(); // Original runTests for stdio, perhaps rename to runStdioTests
  }
  if (runHttp) {
    await runHttpTests();
  }

  if (!runStdio && !runHttp) {
    console.log("No tests specified. Use --http-only or --all-tests, or run without args for stdio tests.");
  }

  // Ensure process exits after tests if stdio server is not running or has exited
  if (server && server.exitCode !== null) {
     process.exit(server.exitCode || 0);
  } else if (!runStdio && runHttp) { // If only HTTP tests ran
     process.exit(0); // Exit cleanly
  }
  // If stdio server is still running, its exit will trigger process.exit
}

main().catch(err => {
  console.error("Unhandled error in main test execution:", err);
  process.exit(1);
});