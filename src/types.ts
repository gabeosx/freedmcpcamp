export enum TaskPriority {
  NORMAL = 0,
  LOW = 1,
  HIGH = 2,
  URGENT = 3,
}

export enum TaskStatus {
  OPEN = 0,
  COMPLETED = 1,
  CLOSED = 2,
}

// It might be useful to also export these as const objects for iteration or getting string values,
// but enums are fine for direct use and Zod validation.
// For example:
/*
export const TaskPriorityMap = {
  0: "Normal",
  1: "Low",
  2: "High",
  3: "Urgent",
} as const;

export const TaskStatusMap = {
  0: "Open",
  1: "Completed",
  2: "Closed",
} as const;
*/
