import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import { randomUUID } from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import assert from 'node:assert/strict';
import { TaskPriority, TaskStatus } from '../src/types.js'; // Adjust path if necessary

// Load environment variables
dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Store test state
let createdTaskId: string | null = null;

// For managing pending requests
interface PendingRequest {
  resolve: (value: any) => void;
  reject: (reason?: any) => void;
  request: any; // Store the original request for context if needed
}
const pendingRequests = new Map<string, PendingRequest>();

// Verify required environment variables
const requiredEnvVars = [
  'FREEDCAMP_API_KEY',
  'FREEDCAMP_API_SECRET',
  'FREEDCAMP_PROJECT_ID',
];
const missingEnvVars = requiredEnvVars.filter(
  (varName) => !process.env[varName]
);

if (missingEnvVars.length > 0) {
  console.error(
    'FATAL: Missing required environment variables:',
    missingEnvVars.join(', ')
  );
  console.error(
    'Please ensure these variables are set in your .env file or environment.'
  );
  process.exit(1);
}

// Spawn the MCP server process
const serverPath = path.resolve(__dirname, '..', 'dist', 'server.js');
let server: ChildProcessWithoutNullStreams;

// Helper to send requests and await responses
const REQUEST_TIMEOUT_MS = 10000; // 10 seconds

async function sendRequest(requestObject: any): Promise<any> {
  const requestId = requestObject.id || randomUUID();
  requestObject.id = requestId;

  let timeoutId: NodeJS.Timeout;

  const promise = new Promise((resolve, reject) => {
    timeoutId = setTimeout(() => {
      pendingRequests.delete(requestId); // Clean up
      reject(
        new Error(
          `Request ${requestId} (${requestObject.method}) timed out after ${REQUEST_TIMEOUT_MS}ms`
        )
      );
    }, REQUEST_TIMEOUT_MS);

    pendingRequests.set(requestId, { resolve, reject, request: requestObject });
  });

  console.log(
    `\n--> Sending request (ID: ${requestId}): ${requestObject.method}`,
    JSON.stringify(requestObject.params || requestObject.arguments || {})
  );
  server.stdin.write(JSON.stringify(requestObject) + '\n');

  // Clear timeout when promise settles
  return promise.finally(() => clearTimeout(timeoutId));
}

// Handle server output
let responseBuffer = '';
function setupServerListeners() {
  server.stdout.on('data', (data) => {
    responseBuffer += data.toString();
    let newlineIndex;
    while ((newlineIndex = responseBuffer.indexOf('\n')) !== -1) {
      const jsonStr = responseBuffer.substring(0, newlineIndex);
      responseBuffer = responseBuffer.substring(newlineIndex + 1);

      if (jsonStr.trim() === '') continue;

      try {
        const response = JSON.parse(jsonStr);
        console.log(
          `<-- Received response (ID: ${response.id}):`,
          JSON.stringify(response, null, 2)
        );

        const pending = pendingRequests.get(response.id);
        if (pending) {
          if (response.error) {
            pending.reject(response.error);
          } else {
            pending.resolve(response.result);
          }
          pendingRequests.delete(response.id);
        } else {
          console.warn(
            `Received response for unknown request ID: ${response.id}`
          );
        }
      } catch (e) {
        console.error(
          'Error parsing server response JSON:',
          e,
          `\nRaw JSON string: "${jsonStr}"`
        );
        // If there's a parsing error, we might have a corrupted stream or an error
        // in how the server formats JSON. It's hard to recover from this for a specific request.
        // We could try to reject all pending requests, or just log and continue.
        // For now, just log. If a request times out, its promise will be rejected.
      }
    }
  });

  server.stderr.on('data', (data) => {
    console.error(`SERVER STDERR: ${data.toString()}`);
  });

  server.on('exit', (code, signal) => {
    console.log(`Server process exited with code ${code} and signal ${signal}`);
    // Reject any pending requests if server exits unexpectedly
    pendingRequests.forEach((pending) => {
      pending.reject(
        new Error(
          `Server exited unexpectedly with code ${code} signal ${signal} while request ${pending.request.id} was pending.`
        )
      );
    });
  });

  server.on('error', (err) => {
    console.error('Failed to start server process:', err);
    process.exit(1); // Exit if server fails to start
  });
}

// --- Test Definitions ---
async function testInitialize() {
  console.log('\n--- Running Test: Initialize ---');
  const request = {
    jsonrpc: '2.0',
    id: randomUUID(),
    method: 'initialize',
    params: {
      protocolVersion: '2025-03-26', // Use a fixed version for testing
      serverName: 'test-client',
      serverVersion: '1.0.0',
      clientInfo: { name: 'test-harness', version: '1.0.0' },
      capabilities: { tools: {} },
    },
  };
  const result = await sendRequest(request);
  assert.ok(result, 'Initialize: Response should have a result field');
  assert.strictEqual(
    result.protocolVersion,
    '2025-03-26',
    'Initialize: Protocol version mismatch'
  );
  assert.strictEqual(
    result.serverInfo.name,
    'freedcamp-mcp',
    'Initialize: Server name mismatch'
  );
  console.log('Initialize Test Passed!');
}

async function testListTools() {
  console.log('\n--- Running Test: List Tools ---');
  const request = {
    jsonrpc: '2.0',
    id: randomUUID(),
    method: 'tools/list',
    params: {},
  };
  const result = await sendRequest(request);
  assert.ok(result.tools, 'List Tools: Response should have a tools array');
  assert.ok(
    Array.isArray(result.tools),
    'List Tools: tools field should be an array'
  );

  const toolNames = result.tools.map((t: any) => t.name);
  assert.ok(
    toolNames.includes('freedcamp_add_task'),
    'List Tools: Missing freedcamp_add_task'
  );
  assert.ok(
    toolNames.includes('freedcamp_update_task'),
    'List Tools: Missing freedcamp_update_task'
  );
  assert.ok(
    toolNames.includes('freedcamp_list_tasks'),
    'List Tools: Missing freedcamp_list_tasks'
  );
  assert.strictEqual(
    toolNames.includes('freedcamp_delete_task'),
    false,
    'List Tools: freedcamp_delete_task should NOT be listed'
  );
  console.log('List Tools Test Passed!');
}

async function testErrorConditionsAddTask() {
  console.log('\n--- Running Test: Error Conditions for Add Task ---');

  // Test 1: Missing title
  try {
    console.log('Attempting Add Task with missing title...');
    const requestMissingTitle = {
      jsonrpc: '2.0',
      id: randomUUID(),
      method: 'tools/call',
      params: {
        name: 'freedcamp_add_task',
        arguments: {
          description: 'This task is missing a title',
          priority: TaskPriority.NORMAL,
        },
      },
    };
    await sendRequest(requestMissingTitle);
    assert.fail(
      'Add Task (Missing Title): Should have thrown an error but succeeded.'
    );
  } catch (error: any) {
    assert.ok(
      error,
      'Add Task (Missing Title): Error object should be present.'
    );
    // MCP SDK might wrap the error, so check for error.message and potentially error.data for JSON-RPC details
    console.log(
      'Caught expected error for missing title:',
      JSON.stringify(error, null, 2)
    );
    assert.match(
      error.message,
      /Validation Error/i,
      'Add Task (Missing Title): Error message should indicate validation error.'
    );
    assert.strictEqual(
      error.data?.errorCode,
      'VALIDATION_ERROR',
      'Add Task (Missing Title): errorCode should be VALIDATION_ERROR.'
    );
    assert.ok(
      Array.isArray(error.data?.issues),
      'Add Task (Missing Title): Validation error should have an issues array.'
    );
    const titleIssue = error.data.issues.find((issue: any) =>
      issue.path?.includes('title')
    );
    assert.ok(
      titleIssue,
      "Add Task (Missing Title): Should be an issue reported for the 'title' field."
    );
    assert.strictEqual(
      titleIssue.code,
      'invalid_type',
      "Add Task (Missing Title): Title issue code should be invalid_type (as it's required)."
    );
    console.log('Add Task (Missing Title) Test Passed!');
  }

  // Test 2: Invalid priority
  try {
    console.log('Attempting Add Task with invalid priority...');
    const requestInvalidPriority = {
      jsonrpc: '2.0',
      id: randomUUID(),
      method: 'tools/call',
      params: {
        name: 'freedcamp_add_task',
        arguments: {
          title: 'Task with invalid priority',
          priority: 99,
        },
      },
    };
    await sendRequest(requestInvalidPriority);
    assert.fail(
      'Add Task (Invalid Priority): Should have thrown an error but succeeded.'
    );
  } catch (error: any) {
    assert.ok(
      error,
      'Add Task (Invalid Priority): Error object should be present.'
    );
    console.log(
      'Caught expected error for invalid priority:',
      JSON.stringify(error, null, 2)
    );
    assert.match(
      error.message,
      /Validation Error/i,
      'Add Task (Invalid Priority): Error message should indicate validation error.'
    );
    assert.strictEqual(
      error.data?.errorCode,
      'VALIDATION_ERROR',
      'Add Task (Invalid Priority): errorCode should be VALIDATION_ERROR.'
    );
    assert.ok(
      Array.isArray(error.data?.issues),
      'Add Task (Invalid Priority): Validation error should have an issues array.'
    );
    const priorityIssue = error.data.issues.find((issue: any) =>
      issue.path?.includes('priority')
    );
    assert.ok(
      priorityIssue,
      "Add Task (Invalid Priority): Should be an issue reported for the 'priority' field."
    );
    assert.strictEqual(
      priorityIssue.code,
      'invalid_enum_value',
      'Add Task (Invalid Priority): Priority issue code should be invalid_enum_value.'
    );
    console.log('Add Task (Invalid Priority) Test Passed!');
  }

  // Test 3: Unknown tool
  try {
    console.log('Attempting to call an unknown tool...');
    const requestUnknownTool = {
      jsonrpc: '2.0',
      id: randomUUID(),
      method: 'tools/call',
      params: {
        name: 'freedcamp_non_existent_tool',
        arguments: {},
      },
    };
    await sendRequest(requestUnknownTool);
    assert.fail('Unknown Tool: Should have thrown an error but succeeded.');
  } catch (error: any) {
    assert.ok(error, 'Unknown Tool: Error object should be present.');
    console.log(
      'Caught expected error for unknown tool:',
      JSON.stringify(error, null, 2)
    );
    assert.match(
      error.message,
      /Tool Execution Error/i,
      'Unknown Tool: Error message should indicate tool execution error.'
    );
    assert.strictEqual(
      error.data?.errorCode,
      'TOOL_EXECUTION_ERROR',
      'Unknown Tool: errorCode should be TOOL_EXECUTION_ERROR.'
    );
    assert.ok(
      error.message.includes('Unknown tool: freedcamp_non_existent_tool'),
      'Unknown Tool: Error message detail mismatch.'
    );
    console.log('Unknown Tool Test Passed!');
  }
}

async function testAddTask() {
  console.log('\n--- Running Test: Add Task ---');
  const taskTitle = `Test Task ${randomUUID()}`;
  const taskDescription =
    'This is a test task created via MCP CLI for robust testing.';
  const request = {
    jsonrpc: '2.0',
    id: randomUUID(),
    method: 'tools/call',
    params: {
      name: 'freedcamp_add_task',
      arguments: {
        title: taskTitle,
        description: taskDescription,
        priority: TaskPriority.LOW,
      },
    },
  };
  const result = await sendRequest(request);
  assert.ok(result, 'Add Task: Response should have a result field');
  assert.ok(result.data, 'Add Task: Result should have a data field');
  assert.ok(result.data.task_id, 'Add Task: Result data should have a task_id');
  assert.strictEqual(
    typeof result.data.task_id,
    'string',
    'Add Task: task_id should be a string'
  );
  assert.ok(
    result.data.task_id.length > 0,
    'Add Task: task_id should not be empty'
  );
  createdTaskId = result.data.task_id; // Store for subsequent tests

  assert.ok(result.content, 'Add Task: Response should have content field');
  assert.ok(
    Array.isArray(result.content) && result.content.length > 0,
    'Add Task: Content should be a non-empty array'
  );
  assert.strictEqual(
    result.content[0].type,
    'text',
    'Add Task: Content type should be text'
  );
  assert.ok(
    result.content[0].text.includes(`Task created with ID: ${createdTaskId}`),
    'Add Task: Content text mismatch'
  );
  console.log(`Add Task Test Passed! Created Task ID: ${createdTaskId}`);
  return { createdTaskId, taskTitle, taskDescription }; // Return details for next tests
}

async function testListTasksAfterAdd(
  expectedTaskId: string,
  expectedTitle: string
) {
  console.log('\n--- Running Test: List Tasks After Add ---');
  const request = {
    jsonrpc: '2.0',
    id: randomUUID(),
    method: 'tools/call',
    params: { name: 'freedcamp_list_tasks', arguments: {} },
  };
  const result = await sendRequest(request);
  assert.ok(
    result,
    'List Tasks (After Add): Response should have a result field'
  );
  assert.ok(
    result.data,
    'List Tasks (After Add): Result should have a data field'
  );
  assert.ok(
    Array.isArray(result.data),
    'List Tasks (After Add): Result data should be an array'
  );

  const addedTask = result.data.find((task: any) => task.id === expectedTaskId);
  assert.ok(
    addedTask,
    `List Tasks (After Add): Created task with ID ${expectedTaskId} not found`
  );
  assert.strictEqual(
    addedTask.title,
    expectedTitle,
    `List Tasks (After Add): Task title mismatch for ID ${expectedTaskId}`
  );

  assert.ok(
    result.content,
    'List Tasks (After Add): Response should have content field'
  );
  assert.ok(
    Array.isArray(result.content) && result.content.length > 0,
    'List Tasks (After Add): Content should be a non-empty array'
  );
  assert.strictEqual(
    result.content[0].type,
    'text',
    'List Tasks (After Add): Content type should be text'
  );
  assert.ok(
    result.content[0].text.includes(expectedTitle),
    `List Tasks (After Add): Content text should include title "${expectedTitle}"`
  );
  console.log('List Tasks After Add Test Passed!');
}

async function testUpdateTask(taskId: string) {
  console.log('\n--- Running Test: Update Task ---');
  assert.ok(taskId, 'Update Task: requires a valid taskId to run');
  const updatedTitle = `Updated Test Task ${randomUUID()}`;
  const updatedDescription =
    'This task was updated for robust testing via MCP CLI.';
  const request = {
    jsonrpc: '2.0',
    id: randomUUID(),
    method: 'tools/call',
    params: {
      name: 'freedcamp_update_task',
      arguments: {
        task_id: taskId,
        title: updatedTitle,
        description: updatedDescription,
        priority: TaskPriority.HIGH,
        status: TaskStatus.COMPLETED,
      },
    },
  };
  const result = await sendRequest(request);
  assert.ok(result, 'Update Task: Response should have a result field');
  assert.ok(result.data, 'Update Task: Result should have a data field');
  assert.strictEqual(
    result.data.id,
    taskId,
    'Update Task: Task ID in response mismatch'
  );
  assert.strictEqual(
    result.data.title,
    updatedTitle,
    'Update Task: Task title was not updated'
  );
  assert.strictEqual(
    result.data.priority,
    TaskPriority.HIGH,
    'Update Task: Task priority was not updated'
  );
  assert.strictEqual(
    result.data.status,
    TaskStatus.COMPLETED,
    'Update Task: Task status was not updated'
  );

  assert.ok(result.content, 'Update Task: Response should have content field');
  assert.ok(
    Array.isArray(result.content) && result.content.length > 0,
    'Update Task: Content should be a non-empty array'
  );
  assert.strictEqual(
    result.content[0].type,
    'text',
    'Update Task: Content type should be text'
  );
  assert.ok(
    result.content[0].text.includes(`Task updated successfully. ID: ${taskId}`),
    'Update Task: Content text mismatch'
  );
  console.log(`Update Task Test Passed! Updated Task ID: ${taskId}`);
  return { updatedTitle }; // Return details for next list test
}

async function testListTasksAfterUpdate(
  expectedTaskId: string,
  expectedUpdatedTitle: string
) {
  console.log('\n--- Running Test: List Tasks After Update ---');
  const request = {
    jsonrpc: '2.0',
    id: randomUUID(),
    method: 'tools/call',
    params: { name: 'freedcamp_list_tasks', arguments: {} },
  };
  const result = await sendRequest(request);
  assert.ok(
    result,
    'List Tasks (After Update): Response should have a result field'
  );
  assert.ok(
    result.data,
    'List Tasks (After Update): Result should have a data field'
  );
  assert.ok(
    Array.isArray(result.data),
    'List Tasks (After Update): Result data should be an array'
  );

  const updatedTask = result.data.find(
    (task: any) => task.id === expectedTaskId
  );
  assert.ok(
    updatedTask,
    `List Tasks (After Update): Updated task with ID ${expectedTaskId} not found`
  );
  assert.strictEqual(
    updatedTask.title,
    expectedUpdatedTitle,
    `List Tasks (After Update): Task title mismatch for ID ${expectedTaskId}`
  );
  assert.strictEqual(
    updatedTask.status,
    TaskStatus.COMPLETED,
    `List Tasks (After Update): Task status mismatch for ID ${expectedTaskId}`
  );
  assert.strictEqual(
    updatedTask.priority,
    TaskPriority.HIGH,
    `List Tasks (After Update): Task priority mismatch for ID ${expectedTaskId}`
  );

  console.log('List Tasks After Update Test Passed!');
}

async function runAllTests() {
  server = spawn('node', [serverPath], {
    env: process.env,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  setupServerListeners();

  // Give server a moment to start
  await new Promise((resolve) => setTimeout(resolve, 500));

  try {
    await testInitialize();
    await testListTools();

    const { createdTaskId: newTaskId, taskTitle: originalTitle } =
      await testAddTask();
    if (newTaskId) {
      await testListTasksAfterAdd(newTaskId, originalTitle);
      const { updatedTitle } = await testUpdateTask(newTaskId);
      await testListTasksAfterUpdate(newTaskId, updatedTitle);
    } else {
      console.error(
        'Critical: Skipping update/list after update tests due to add_task failure to return ID.'
      );
      // This is a critical failure for the test suite's flow.
      throw new Error(
        'add_task did not return a task ID, subsequent tests cannot run reliably.'
      );
    }

    await testErrorConditionsAddTask();
  } catch (error) {
    console.error('\n--- A TEST FAILED ---');
    if (error instanceof assert.AssertionError) {
      console.error('AssertionError:', error.message);
      console.error('Actual:', error.actual);
      console.error('Expected:', error.expected);
      console.error('Operator:', error.operator);
    } else {
      console.error('Error:', error);
    }
    process.exitCode = 1; // Indicate test failure
  } finally {
    console.log('\n--- All Tests Attempted ---');
    if (server && server.stdin && !server.stdin.destroyed) {
      server.stdin.end();
    }
    // Wait for server to exit gracefully if needed, or force kill after timeout
    await new Promise((resolve) => setTimeout(resolve, 500));
    if (server && !server.killed) {
      server.kill('SIGTERM');
      console.log('Sent SIGTERM to server.');
    }
  }
}

runAllTests();
