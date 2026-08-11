export type Priority = 'low' | 'medium' | 'high' | 'urgent';

export interface Task {
  id: string;
  board_id: string;
  column_id: string;
  number: number;
  key: string;
  title: string;
  description: string;
  priority: Priority;
  assignee: string;
  labels: string[];
  position: number;
  comment_count?: number;
  created_at: string;
  updated_at: string;
}

export interface Column {
  id: string;
  board_id: string;
  name: string;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface ColumnWithTasks extends Column {
  tasks: Task[];
}

export interface Board {
  id: string;
  key: string;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
  task_count?: number;
}

export interface BoardFull extends Board {
  columns: ColumnWithTasks[];
}

export interface Comment {
  id: string;
  task_id: string;
  body: string;
  author: string;
  created_at: string;
}
