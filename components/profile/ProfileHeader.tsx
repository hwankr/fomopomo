// components/profile/ProfileHeader.tsx
import { User } from '@supabase/supabase-js';

interface ProfileHeaderProps {
  user: User | null;
  totalFocusTime: number;
}

export default function ProfileHeader({ user, totalFocusTime }: ProfileHeaderProps) {
  const formatTotalTime = (seconds: number) => {
      const hours = Math.floor(seconds / 3600);
      return `${hours}시간`;
  };

  return (
    <div className="flex flex-col md:flex-row items-center gap-6 p-6 bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700">
      <div className="relative">
          <div className="w-24 h-24 rounded-full bg-gradient-to-br from-rose-400 to-orange-400 flex items-center justify-center text-white text-3xl font-bold shadow-lg">
              {user?.user_metadata?.full_name?.[0] || user?.email?.[0]?.toUpperCase() || 'U'}
          </div>
          <div className="absolute bottom-0 right-0 w-6 h-6 bg-green-400 border-4 border-white dark:border-slate-800 rounded-full"></div>
      </div>
      
      <div className="flex-1 text-center md:text-left">
          <h1 className="text-2xl font-bold text-gray-800 dark:text-white mb-2">
              {user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User'}
          </h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mb-4">
              {user?.email}
          </p>
          
          <div className="flex flex-wrap gap-4 justify-center md:justify-start">
              <div className="bg-gray-50 dark:bg-slate-700/50 px-4 py-2 rounded-xl border border-gray-100 dark:border-slate-600">
                  <span className="text-xs text-gray-400 uppercase font-bold mr-2">등급</span>
                  <span className="text-gray-700 dark:text-gray-200 font-medium">학생</span>
              </div>
              <div className="bg-rose-50 dark:bg-rose-900/20 px-4 py-2 rounded-xl border border-rose-100 dark:border-rose-800/30">
                  <span className="text-xs text-rose-400 uppercase font-bold mr-2">누적</span>
                  <span className="text-rose-600 dark:text-rose-300 font-bold">{formatTotalTime(totalFocusTime)}</span>
              </div>
          </div>
      </div>
    </div>
  );
}
