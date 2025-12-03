export interface Profile {
  id: string;
  email: string;
  nickname?: string;
  status?: 'online' | 'offline' | 'studying' | 'paused' | null;
  current_task?: string | null;
  last_active_at?: string | null;
  role?: 'user' | 'admin';
  created_at?: string;
}

export interface StudySession {
  id: string;
  user_id: string;
  mode: string;
  duration: number;
  task?: string;
  created_at: string;
  group_id?: string;
}
