'use client';

import React from 'react';
import { formatDuration } from '@/lib/utils'; // Assuming this utility exists, otherwise I'll implement a helper.
// Actually I should check if formatDuration exists. I'll implement a local helper if not.

interface LeaderboardItemProps {
  rank: number;
  nickname: string;
  totalDuration: number;
  isCurrentUser?: boolean;
}

export default function LeaderboardItem({ rank, nickname, totalDuration, isCurrentUser }: LeaderboardItemProps) {
  return (
    <div 
      className={`flex items-center justify-between p-4 rounded-lg mb-2 transition-colors ${
        isCurrentUser 
          ? 'bg-primary/10 border border-primary/20' 
          : 'bg-card/50 hover:bg-card/80 border border-border/50'
      }`}
    >
      <div className="flex items-center gap-4">
        <div className={`
          flex items-center justify-center w-8 h-8 rounded-full font-bold text-sm
          ${rank === 1 ? 'bg-yellow-500/20 text-yellow-500' : 
            rank === 2 ? 'bg-gray-400/20 text-gray-400' : 
            rank === 3 ? 'bg-amber-600/20 text-amber-600' : 
            'text-muted-foreground'}
        `}>
          {rank}
        </div>
        
        {/* Profile Image could go here if available */}
        
        <span className={`font-medium ${isCurrentUser ? 'text-primary' : 'text-foreground'}`}>
          {nickname}
        </span>
        
        {isCurrentUser && (
          <span className="text-xs bg-primary/20 text-primary px-2 py-0.5 rounded-full">
            나
          </span>
        )}
      </div>
      
      <span className="font-mono text-sm font-medium text-muted-foreground">
        {formatDuration(totalDuration)}
      </span>
    </div>
  );
}
