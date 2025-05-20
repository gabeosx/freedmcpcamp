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
          title: 'Test task from MCP',
          description: 'This is a test task created via MCP CLI',
          priority: 1
        }
      }
    }
  },
  {
    name: 'list_tasks',
    request: {
      jsonrpc: '2.0',
      id: randomUUID(),
      method: 'tools/call',
      params: {
        name: 'freedcamp_list_tasks',
        arguments: {}
      }
    }
  }
];

// Add update task test dynamically after we get the task ID
function getUpdateTaskTest() {
  if (!createdTaskId) {
    throw new Error('No task ID available for update test');
  }
  
  return {
    name: 'update_task',
    request: {
      jsonrpc: '2.0',
      id: randomUUID(),
      method: 'tools/call',
      params: {
        name: 'freedcamp_update_task',
        arguments: {
          task_id: createdTaskId,
          title: 'Updated test task from MCP',
          description: 'This task was updated via MCP CLI',
          priority: 2,
          status: 1 // Set to completed
        }
      }
    }
  };
}

function getDeleteTaskTest() {
  if (!createdTaskId) {
    throw new Error('No task ID available for delete test');
  }
  return {
    name: 'delete_task',
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
    // Append new data to buffer
    responseBuffer += data.toString();
    
    // Try to parse complete JSON objects
    let newlineIndex;
    while ((newlineIndex = responseBuffer.indexOf('\n')) !== -1) {
      const jsonStr = responseBuffer.slice(0, newlineIndex);
      responseBuffer = responseBuffer.slice(newlineIndex + 1);
      
      try {
        const response = JSON.parse(jsonStr);
        console.log('\nReceived response:', JSON.stringify(response, null, 2));

        // Check for errors
        if (response.error) {
          console.error('Error in response:', response.error);
        }

        // Store task ID from add_task response
        if (response.result?.content && Array.isArray(response.result.content)) {
          for (const item of response.result.content) {
            if (typeof item.text === 'string') {
              try {
                const parsed = JSON.parse(item.text);
                if (parsed && parsed.task_id) {
                  createdTaskId = parsed.task_id;
                  break;
                }
              } catch (e) {
                // Not a JSON string, skip
              }
            }
          }
        }
      } catch (parseErr) {
        // Ignore parse errors for incomplete chunks
        if (parseErr instanceof SyntaxError) {
          responseBuffer = jsonStr + responseBuffer;
          break;
        }
        console.error('Error parsing response:', parseErr);
      }
    }
  } catch (err) {
    console.error('Error handling response:', err);
  }
});

server.stderr.on('data', (data) => {
  console.error('Server error:', data.toString());
});

// Run tests sequentially
async function runTests() {
  for (const test of tests) {
    console.log(`\nRunning test: ${test.name}`);
    console.log('Sending request:', JSON.stringify(test.request, null, 2));
    
    // Send request to server
    server.stdin.write(JSON.stringify(test.request) + '\n');
    
    // Wait a bit between tests
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Add update test after add_task
    if (test.name === 'add_task') {
      // Wait a bit longer to ensure we have the task ID
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      if (createdTaskId) {
        const updateTest = getUpdateTaskTest();
        console.log(`\nRunning test: ${updateTest.name}`);
        console.log('Sending request:', JSON.stringify(updateTest.request, null, 2));
        server.stdin.write(JSON.stringify(updateTest.request) + '\n');
        await new Promise(resolve => setTimeout(resolve, 1000));
        // Add delete test after update
        const deleteTest = getDeleteTaskTest();
        console.log(`\nRunning test: ${deleteTest.name}`);
        console.log('Sending request:', JSON.stringify(deleteTest.request, null, 2));
        server.stdin.write(JSON.stringify(deleteTest.request) + '\n');
        await new Promise(resolve => setTimeout(resolve, 1000));
      } else {
        console.error('Failed to get task ID for update/delete test');
      }
    }
  }

  // Close the server after tests
  server.stdin.end();
}

// Run the tests
runTests().catch(console.error);

// Handle server exit
server.on('exit', (code) => {
  console.log(`\nServer exited with code ${code}`);
  process.exit(code || 0);
}); 