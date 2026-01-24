export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          username: string | null
          invite_code: string | null
          status: string | null
          current_task: string | null
          last_active_at: string | null
          is_task_public: boolean | null
          email: string | null
          role: string | null
          created_at: string | null
          nickname: string | null
          study_start_time: string | null
          total_stopwatch_time: number | null
          timer_type: string | null
          timer_mode: string | null
          timer_duration: number | null
        }
        Insert: {
          id: string
          username?: string | null
          invite_code?: string | null
          status?: string | null
          current_task?: string | null
          last_active_at?: string | null
          is_task_public?: boolean | null
          email?: string | null
          role?: string | null
          created_at?: string | null
          nickname?: string | null
          study_start_time?: string | null
          total_stopwatch_time?: number | null
          timer_type?: string | null
          timer_mode?: string | null
          timer_duration?: number | null
        }
        Update: {
          id?: string
          username?: string | null
          invite_code?: string | null
          status?: string | null
          current_task?: string | null
          last_active_at?: string | null
          is_task_public?: boolean | null
          email?: string | null
          role?: string | null
          created_at?: string | null
          nickname?: string | null
          study_start_time?: string | null
          total_stopwatch_time?: number | null
          timer_type?: string | null
          timer_mode?: string | null
          timer_duration?: number | null
        }
        // ... relationships ...
      }
      // ... truncated ...
    }

    Functions: {}
  }
}
