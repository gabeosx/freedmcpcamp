---
description: 
globs: 
alwaysApply: false
---
# Freedcamp MCP Server Codebase Guide

## Main Server Logic
The main entry point for the Freedcamp MCP server is [src/server.ts](mdc:src/server.ts). This file:
- Registers all MCP tools for Freedcamp (add, update, list, and delete tasks).
- Handles incoming tool requests and maps them to Freedcamp API calls.
- Implements authentication for Freedcamp API using HMAC-SHA1.

## Freedcamp API Integration
- All Freedcamp API calls are made using `fetch` with the appropriate HTTP method and authentication.
- The delete task operation is implemented as a POST request to `/api/v1/tasks/{task_id}/delete` with form-data, as per Freedcamp's requirements.
- The server does not use HTTP DELETE for task deletion, as this is not supported by Freedcamp's API.

## Test Harness
- [src/test-harness.ts](mdc:src/test-harness.ts) is a CLI tool that tests all MCP functionality, including task creation, update, and deletion.
- It prints both the requests sent and the responses received, which is useful for debugging and for providing examples to Freedcamp support.

## Environment Variables
- API credentials and project ID are loaded from a `.env` file in the project root.
- These are required for all Freedcamp API operations.

## Authentication Details
- The Freedcamp API requires `api_key`, `timestamp`, and `hash` (HMAC-SHA1 of `api_key + timestamp` using `api_secret`).
- This is handled in [src/freedcamp.ts](mdc:src/freedcamp.ts).

## Usage Notes
- The only supported way to delete a task is via POST to `/api/v1/tasks/{task_id}/delete` with the required form fields.
- Attempts to use HTTP DELETE to `/api/v1/tasks/{task_id}` or `/api/v1/tasks/{task_id}/delete` will result in a 401 Unauthorized error.

Refer to [src/server.ts](mdc:src/server.ts) for the main server logic and [src/test-harness.ts](mdc:src/test-harness.ts) for automated testing and example API interactions.

## Github
- Builds are automated in GitHub using actions
- Because of the automated build process, there are always changes in the remote that are out of sync with local
- Always rebase the local repo before trying to push!