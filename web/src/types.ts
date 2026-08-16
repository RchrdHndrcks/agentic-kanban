export type Priority = 'low' | 'medium' | 'high' | 'urgent';

export type SortKey = 'manual' | 'priority' | 'newest' | 'oldest' | 'title';

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

export type BoardRole = 'owner' | 'member';

export interface BoardMember {
  user_id: string;
  email: string;
  role: BoardRole;
  created_at: string;
}

export interface Board {
  id: string;
  key: string;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
  task_count?: number;
  member_count?: number;
  role?: BoardRole;
}

export interface BoardFull extends Board {
  columns: ColumnWithTasks[];
  members?: BoardMember[];
}

export interface Comment {
  id: string;
  task_id: string;
  body: string;
  author: string;
  created_at: string;
}
