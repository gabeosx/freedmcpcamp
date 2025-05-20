export class ApiError extends Error {
  constructor(
    message: string,
    public httpStatusCode?: number,
    public details?: any
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export class ValidationError extends Error {
  constructor(
    message: string,
    public issues?: any[]
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class ToolExecutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ToolExecutionError';
  }
}
