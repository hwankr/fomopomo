import { supabase } from '@/lib/supabase';
import type { User } from '@supabase/supabase-js';

type AdminStatus = {
  user: User | null;
  isAdmin: boolean;
};

export async function getAdminStatus(): Promise<AdminStatus> {
  try {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return { user: null, isAdmin: false };
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profileError) {
      return { user, isAdmin: false };
    }

    return { user, isAdmin: profile?.role === 'admin' };
  } catch {
    return { user: null, isAdmin: false };
  }
}
