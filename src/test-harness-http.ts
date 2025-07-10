import fetch from 'node-fetch';
import { randomUUID } from 'node:crypto';
import dotenv from 'dotenv';

dotenv.config();

// Parse response from Streamable HTTP transport (returns plain JSON)
async function parseJsonResponse(response: any): Promise<any> {
  // Get response text first to avoid consuming body twice
  const responseText = await response.text();
  
  // Check for HTTP errors
  if (!response.ok) {
    console.error(`HTTP Error: ${response.status} ${response.statusText}`);
    console.error('Error response:', responseText);
    return { error: { code: response.status, message: response.statusText, details: responseText } };
  }
  
  // Streamable HTTP returns plain JSON (not SSE format)
  try {
    return JSON.parse(responseText);
  } catch (e) {
    console.error('Failed to parse response as JSON:', responseText, e);
    return { error: { code: -32700, message: 'Parse error', details: responseText } };
  }
}

async function runHttpTests() {
  const baseURL = process.env.PORT ? `http://localhost:${process.env.PORT}/mcp` : 'http://localhost:3001/mcp';
  let createdTaskId: string | null = null;
  let createdBulkTaskIds: string[] = [];

  const tests = [
    {
      name: 'initialize',
      method: 'initialize',
      params: {
        protocolVersion: '2025-03-26',
        serverName: 'test-client',
        serverVersion: '1.0.0',
        clientInfo: { name: 'test-harness-http', version: '1.0.0' },
        capabilities: { tools: {} },
      },
    },
    {
      name: 'list_tools',
      method: 'tools/list',
      params: {},
    },
    {
      name: 'add_task',
      method: 'tools/call',
      params: {
        name: 'freedcamp_add_task',
        arguments: {
          tasks: [
            {
              title: 'Test task from MCP (http)',
              description: 'This is a test task created via HTTP',
              priority: 1,
            },
          ],
        },
      },
    },
    {
      name: 'list_tasks_after_single_add',
      method: 'tools/call',
      params: {
        name: 'freedcamp_list_tasks',
        arguments: {},
      },
    },
  ];

  for (const test of tests) {
    const response = await fetch(baseURL, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream'  // MCP SDK requires both even for Streamable HTTP
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: randomUUID(), method: test.method, params: test.params }),
    });

    const result = await parseJsonResponse(response);
    console.log(`${test.name} response:`, JSON.stringify(result, null, 2));

    if (result && typeof result === 'object' && 'error' in result) {
      console.error(`Error in ${test.name}:`, result.error);
    }

    if (test.name === 'add_task' && result?.result?.content) {
      // Extract task_id from nested JSON in text field
      const textContent = result.result.content[0]?.text;
      if (textContent) {
        try {
          const parsed = JSON.parse(textContent);
          createdTaskId = parsed.task_id;
        } catch (e) {
          console.error('Failed to parse task creation response:', textContent);
        }
      }
      console.log(`Created Task ID: ${createdTaskId}`);
    }
  }

  if (createdTaskId) {
    await runTaskTests(baseURL, createdTaskId);
  }

  await bulkOperationTests(baseURL);
}

async function runTaskTests(baseURL: string, taskId: string) {
  const updateTest = {
    name: 'update_single_task',
    method: 'tools/call',
    params: {
      name: 'freedcamp_update_task',
      arguments: {
        tasks: [
          {
            task_id: taskId,
            title: 'Updated test task from MCP (http)',
            description: 'Updated via HTTP',
            priority: 2,
            status: 1,
          },
        ],
      },
    },
  };

  const deleteTest = {
    name: 'delete_single_task',
    method: 'tools/call',
    params: {
      name: 'freedcamp_delete_task',
      arguments: { tasks: [{ task_id: taskId }] },
    },
  };

  await runTest(baseURL, updateTest);
  await runTest(baseURL, deleteTest);
}

async function bulkOperationTests(baseURL: string) {
  const bulkAddTest = {
    name: 'bulk_add_tasks',
    method: 'tools/call',
    params: {
      name: 'freedcamp_add_task',
      arguments: {
        tasks: [
          {
            title: 'Bulk Task 1 (MCP http)',
            description: 'First bulk task',
            priority: 0,
          },
          {
            title: 'Bulk Task 2 (MCP http)',
            description: 'Second bulk task',
            priority: 1,
          },
        ],
      },
    },
  };

  const response = await fetch(baseURL, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream'  // MCP SDK requires both even for Streamable HTTP
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: randomUUID(), method: bulkAddTest.method, params: bulkAddTest.params }),
  });

  const result = await parseJsonResponse(response);
  console.log(`bulk_add_tasks response:`, JSON.stringify(result, null, 2));

  if (result && typeof result === 'object' && 'error' in result) {
    console.error(`Error in bulk_add_tasks:`, result.error);
  }

  if (result?.result?.content) {
    const localBulkTaskIds = result.result.content.map((item: any) => {
      try {
        const parsed = JSON.parse(item.text);
        return parsed.task_id;
      } catch (e) {
        console.error('Failed to parse bulk task creation response:', item.text);
        return null;
      }
    }).filter((id: string) => id !== null);
    console.log(`Created Bulk Task IDs: ${localBulkTaskIds}`);
    await runBulkTests(baseURL, localBulkTaskIds);
  }
}

async function runBulkTests(baseURL: string, bulkTaskIds: string[]) {
  const bulkUpdateTest = {
    name: 'bulk_update_tasks',
    method: 'tools/call',
    params: {
      name: 'freedcamp_update_task',
      arguments: {
        tasks: bulkTaskIds.map((id: string, index: number) => ({
          task_id: id,
          title: `Updated Bulk Task ${index + 1} (MCP http)`,
          status: 1,
        })),
      },
    },
  };

  const bulkDeleteTest = {
    name: 'bulk_delete_tasks',
    method: 'tools/call',
    params: {
      name: 'freedcamp_delete_task',
      arguments: {
        tasks: bulkTaskIds.map((id: string) => ({ task_id: id })),
      },
    },
  };

  await runTest(baseURL, bulkUpdateTest);
  await runTest(baseURL, bulkDeleteTest);
}

async function runTest(baseURL: string, test: any) {
  const response = await fetch(baseURL, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream'  // MCP SDK requires both even for Streamable HTTP
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: randomUUID(), method: test.method, params: test.params }),
  });

  const result = await parseJsonResponse(response);
  console.log(`${test.name} response:`, JSON.stringify(result, null, 2));

  if (result && typeof result === 'object' && 'error' in result) {
    console.error(`Error in ${test.name}:`, result.error);
  }
}

runHttpTests().catch(console.error);

