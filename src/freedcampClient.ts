import crypto from 'node:crypto';
import fetch, { FormData, Response } from 'node-fetch';
import { URLSearchParams } from 'url';
import { ApiError } from './errors.js';
import { TaskPriority, TaskStatus } from './types.js';

interface FreedcampClientOptions {
  apiKey: string;
  apiSecret: string;
  projectId: string;
}

// Define interfaces for task data structures based on existing schemas
// Public interface for a Freedcamp Task object
export interface FreedcampTask {
  id: string; // Typically a number string from APIs
  title: string;
  description: string;
  due_date: string | null;
  assigned_to_id: string | null; // User ID
  priority: TaskPriority;
  status: TaskStatus;
  project_id: string; // Or number, needs verification
  // Add other fields as necessary, like created_at, updated_at, etc.
  [key: string]: any; // Allow other properties for now
}

// Internal API response structures (what json.data contains)
interface AddTaskApiResponse {
  tasks: FreedcampTask[];
  // Freedcamp seems to return the created task within a 'tasks' array
}

interface UpdateTaskApiResponse {
  // Assuming the API returns the full updated task object directly within 'data'
  // If it's nested, e.g., { task: FreedcampTask }, this needs adjustment.
  // Based on server.ts, it seemed like json.data was the object.
  // For now, let's assume it's a FreedcampTask or a compatible object.
  [key: string]: any; // Placeholder, ideally should be more specific or FreedcampTask
}

interface ListTasksApiResponse {
  tasks: FreedcampTask[];
}

interface AddTaskData {
  title: string;
  description?: string;
  due_date?: string; // YYYY-MM-DD
  assigned_to_id?: string;
  priority?: TaskPriority;
}

interface UpdateTaskData {
  title?: string;
  description?: string;
  due_date?: string; // YYYY-MM-DD
  assigned_to_id?: string;
  priority?: TaskPriority;
  status?: TaskStatus;
}

export class FreedcampClient {
  private readonly apiKey: string;
  private readonly apiSecret: string;
  private readonly projectId: string;
  private readonly baseUrl = 'https://freedcamp.com/api/v1';

  constructor(options: FreedcampClientOptions) {
    this.apiKey = options.apiKey;
    this.apiSecret = options.apiSecret;
    this.projectId = options.projectId;
  }

  private _generateFreedcampHash(timestamp: number): string {
    const hmac = crypto.createHmac('sha1', this.apiSecret);
    hmac.update(this.apiKey + timestamp);
    return hmac.digest('hex');
  }

  private _buildFreedcampAuthParams(): Record<string, string> {
    const timestamp = Math.floor(Date.now() / 1000);
    const hash = this._generateFreedcampHash(timestamp);
    return {
      api_key: this.apiKey,
      timestamp: String(timestamp),
      hash,
    };
  }

  private async _request(
    endpoint: string,
    method: 'GET' | 'POST',
    data?: Record<string, any> // Request body data
  ): Promise<any> {
    // Return type will be typed by calling methods for now
    const url = `${this.baseUrl}/${endpoint}`;
    const authParams = this._buildFreedcampAuthParams();
    let response: Response;

    // console.log(`FreedcampClient: Making ${method} request to ${url}`); // Removed

    if (method === 'POST') {
      const form = new FormData();
      if (data) {
        // Freedcamp expects 'data' field as JSON for many POST requests
        form.append('data', JSON.stringify(data));
      }
      for (const [k, v] of Object.entries(authParams)) {
        form.append(k, v);
      }
      // console.log(`FreedcampClient: POST body (form-data): data=${JSON.stringify(data)}, authParams=${JSON.stringify(authParams)}`); // Removed
      response = await fetch(url, {
        method: 'POST',
        body: form as any, // node-fetch v3 FormData compatibility
      });
    } else {
      // GET
      const params = new URLSearchParams(authParams);
      if (data) {
        for (const [key, value] of Object.entries(data)) {
          if (value !== undefined) {
            params.append(key, String(value));
          }
        }
      }
      // console.log(`FreedcampClient: GET params: ${params.toString()}`); // Removed
      response = await fetch(`${url}?${params.toString()}`, { method: 'GET' });
    }

    const responseBody = await response.text();
    let jsonResponse: Record<string, any>; // General object type for parsed JSON
    try {
      jsonResponse = JSON.parse(responseBody);
      // console.log("FreedcampClient: API Response (parsed JSON):", jsonResponse); // Removed
    } catch (e) {
      // console.error("FreedcampClient: API Response (not JSON):", responseBody); // Removed
      if (!response.ok) {
        throw new ApiError(
          `Freedcamp API Error: ${response.statusText} (Status: ${response.status}) - Non-JSON response`,
          response.status,
          { responseBody }
        );
      }
      throw new ApiError(
        `Freedcamp API Error: Unexpected non-JSON response. Body: ${responseBody}`,
        response.status,
        { responseBody }
      );
    }

    // Check for API level errors indicated in the JSON body
    if (
      jsonResponse.error ||
      (jsonResponse.http_code && jsonResponse.http_code >= 400)
    ) {
      const message =
        jsonResponse.msg ||
        jsonResponse.error_description ||
        jsonResponse.error ||
        'Unknown Freedcamp API Error';
      const statusCode = jsonResponse.http_code || response.status; // Prefer API's status code
      // console.error(`FreedcampClient: API Error in JSON: ${message}, Status: ${statusCode}, Details:`, jsonResponse); // Removed
      throw new ApiError(message, statusCode, jsonResponse);
    }

    // Check for HTTP errors not caught by API level error structure
    if (!response.ok) {
      // console.error(`FreedcampClient: HTTP Error: ${response.statusText}, Status: ${response.status}, Details:`, jsonResponse); // Removed
      throw new ApiError(response.statusText, response.status, jsonResponse);
    }

    // Freedcamp typically wraps the main content in a 'data' field.
    // If 'data' is not present, but response is OK and no API error, return the whole JSON.
    // This might need adjustment based on specific endpoint behaviors.
    return jsonResponse.data !== undefined ? jsonResponse.data : jsonResponse;
  }

  async addTask(taskData: AddTaskData): Promise<FreedcampTask> {
    const apiTaskData = {
      project_id: this.projectId,
      ...taskData,
    };
    // Assuming the actual task object is nested in response.data.tasks[0]
    const response = (await this._request(
      'tasks',
      'POST',
      apiTaskData
    )) as AddTaskApiResponse;
    if (!response || !response.tasks || response.tasks.length === 0) {
      // console.error("FreedcampClient: addTask - Invalid response structure, expected task:", response); // Removed
      throw new ApiError(
        'Invalid response structure from Freedcamp after adding task',
        500,
        response
      );
    }
    return response.tasks[0];
  }

  async updateTask(
    taskId: string,
    taskData: UpdateTaskData
  ): Promise<FreedcampTask> {
    // Assuming the API returns the full updated task object directly within 'data'
    // This might need to be cast to UpdateTaskApiResponse if it has a specific structure
    const response = await this._request(
      `tasks/${taskId}/edit`,
      'POST',
      taskData
    );
    // If the response *is* the task, we can cast. If it's wrapped, e.g. { task: ...}, adjust.
    // For now, assume 'response' is the task object or compatible.
    // This needs verification against actual Freedcamp API response for updates.
    // If the response is just a status, this return type and handling will need to change.
    // Let's assume it returns the task for now, similar to how add might.
    // If response.data from _request is an object like { id: ..., title: ... }, it's a FreedcampTask.
    // If it's { some_wrapper: { id: ..., title: ...}}, then this cast is wrong.
    // The previous server.ts code stringified `json?.data`, suggesting `data` was the object.
    if (!response || typeof response.id === 'undefined') {
      // Basic check
      // console.error("FreedcampClient: updateTask - Invalid response structure, expected task attributes:", response); // Removed
      throw new ApiError(
        'Invalid response structure from Freedcamp after updating task',
        500,
        response
      );
    }
    return response as FreedcampTask; // This is an optimistic cast.
  }

  async listTasks(): Promise<FreedcampTask[]> {
    const response = (await this._request('tasks', 'GET', {
      project_id: this.projectId,
    })) as ListTasksApiResponse;
    if (!response || !response.tasks) {
      // console.error("FreedcampClient: listTasks - Invalid response structure, expected tasks array:", response); // Removed
      throw new ApiError(
        'Invalid response structure from Freedcamp for listing tasks',
        500,
        response
      );
    }
    return response.tasks;
  }
}
