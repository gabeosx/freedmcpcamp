import { spawn } from 'child_process';
import { randomUUID } from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Store test state
let createdTaskId: string | null = null;
let createdBulkTaskIds: string[] = [];
let currentTest: any = null; // To help response handler identify context

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
          title: 'Test task from MCP (single)',
          description: 'This is a single test task created via MCP CLI',
          priority: 1
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
          task_id: createdTaskId,
          title: 'Updated test task from MCP (single)',
          description: 'This task was updated via MCP CLI (single)',
          priority: 2,
          status: 1 // Set to completed
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
          task_id: createdTaskId
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
      arguments: [
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
        arguments: [
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
        arguments: createdBulkTaskIds.map(id => ({ task_id: id }))
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
const serverPath = path.resolve(__dirname, '..', 'dist', 'server.js');
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
          } else if (currentTest?.name === 'bulk_add_tasks') {
            createdBulkTaskIds = []; // Reset
            if (!hasOperationError) {
              for (const item of response.result.content) {
                if (item.type === 'text' && typeof item.text === 'string') {
                  try {
                    const parsedText = JSON.parse(item.text);
                    if (parsedText && parsedText.task_id) {
                      createdBulkTaskIds.push(parsedText.task_id);
                    } else {
                      console.warn(`Could not extract task_id from bulk_add_tasks response item: ${item.text}`);
                    }
                  } catch (e) { console.warn(`Could not parse JSON from bulk_add_tasks response item: ${item.text}`, e); }
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

  currentTest = null; // Clear context
  console.log("\n--- All tests completed ---");
  server.stdin.end();
}

runTests().catch(console.error);

// Handle server exit
server.on('exit', (code) => {
  console.log(`\nServer exited with code ${code}`);
  process.exit(code || 0);
}); 