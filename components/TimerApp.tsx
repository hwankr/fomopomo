"use client";

import { useState, useRef, useEffect } from "react";

const formatTime = (seconds: number) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  // 시(Hour)가 0이면 분:초만 보여주고, 있으면 시:분:초 보여주기
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
};

export default function TimerApp() {
  const [mode, setMode] = useState<"pomo" | "stopwatch">("pomo");

  // --- 🍅 뽀모도로 관련 변수들 ---
  const [pomoTime, setPomoTime] = useState(25 * 60); // 기본 25분 (초 단위)
  const [isPomoRunning, setIsPomoRunning] = useState(false);
  const pomoRef = useRef<NodeJS.Timeout | null>(null);

  // 뽀모도로 시작/일시정지
  const togglePomo = () => {
    if (isPomoRunning) {
      // 멈춤
      if (pomoRef.current) clearInterval(pomoRef.current);
      setIsPomoRunning(false);
    } else {
      // 시작 (1초씩 감소)
      setIsPomoRunning(true);
      pomoRef.current = setInterval(() => {
        setPomoTime((prev) => {
          if (prev <= 1) {
            // 시간이 다 되면 멈춤
            if (pomoRef.current) clearInterval(pomoRef.current);
            setIsPomoRunning(false);
            // 여기서 나중에 "삐비빅!" 소리 재생 기능을 넣을 예정
            alert("집중 시간이 끝났습니다! 휴식하세요.");
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
  };

  // 뽀모도로 시간 설정 버튼 (25분 / 5분)
  const setPomoDuration = (minutes: number) => {
    if (pomoRef.current) clearInterval(pomoRef.current);
    setIsPomoRunning(false);
    setPomoTime(minutes * 60);
  };

  // 뽀모도로 리셋
  const resetPomo = () => {
    setPomoDuration(25); // 기본 25분으로 복귀
  };

  // --- ⏱️ 스톱워치 관련 변수들 ---
  const [stopwatchTime, setStopwatchTime] = useState(0);
  const [isStopwatchRunning, setIsStopwatchRunning] = useState(false);
  const stopwatchRef = useRef<NodeJS.Timeout | null>(null);

  const toggleStopwatch = () => {
    if (isStopwatchRunning) {
      if (stopwatchRef.current) clearInterval(stopwatchRef.current);
      setIsStopwatchRunning(false);
    } else {
      setIsStopwatchRunning(true);
      stopwatchRef.current = setInterval(() => {
        setStopwatchTime((prev) => prev + 1);
      }, 1000);
    }
  };

  const resetStopwatch = () => {
    if (stopwatchRef.current) clearInterval(stopwatchRef.current);
    setIsStopwatchRunning(false);
    setStopwatchTime(0);
  };

  // 화면 꺼질 때 타이머들 정리
  useEffect(() => {
    return () => {
      if (pomoRef.current) clearInterval(pomoRef.current);
      if (stopwatchRef.current) clearInterval(stopwatchRef.current);
    };
  }, []);

  return (
    <div className="w-full max-w-md bg-gray-800 rounded-3xl shadow-2xl border border-gray-700 overflow-hidden">
      {/* 상단 탭 */}
      <div className="flex border-b border-gray-700">
        <button
          onClick={() => setMode("pomo")}
          className={`flex-1 py-4 text-lg font-medium transition-colors ${
            mode === "pomo" ? "bg-gray-700 text-red-400" : "bg-gray-800 text-gray-500 hover:bg-gray-750"
          }`}
        >
          뽀모도로
        </button>
        <button
          onClick={() => setMode("stopwatch")}
          className={`flex-1 py-4 text-lg font-medium transition-colors ${
            mode === "stopwatch" ? "bg-gray-700 text-blue-400" : "bg-gray-800 text-gray-500 hover:bg-gray-750"
          }`}
        >
          스톱워치
        </button>
      </div>

      {/* 메인 화면 */}
      <div className="p-8 flex flex-col items-center justify-center min-h-[300px]">
        {mode === "pomo" ? (
          // --- 🍅 뽀모도로 화면 ---
          <div className="text-center animate-fade-in w-full">
            <div className="text-7xl font-bold text-red-400 mb-8 font-mono tabular-nums tracking-tighter">
              {formatTime(pomoTime)}
            </div>
            
            {/* 시간 조절 칩 */}
            <div className="flex gap-2 justify-center mb-8">
              <button 
                onClick={() => setPomoDuration(25)}
                className="px-3 py-1 rounded-full text-sm border border-gray-600 text-gray-400 hover:bg-gray-700 hover:text-white transition-colors"
              >
                🔥 집중 (25분)
              </button>
              <button 
                onClick={() => setPomoDuration(5)}
                className="px-3 py-1 rounded-full text-sm border border-gray-600 text-gray-400 hover:bg-gray-700 hover:text-white transition-colors"
              >
                ☕ 휴식 (5분)
              </button>
            </div>

            <div className="flex gap-4 justify-center">
              <button
                onClick={togglePomo}
                className={`px-8 py-3 rounded-xl font-bold text-lg transition-all ${
                  isPomoRunning
                    ? "bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/50"
                    : "bg-red-500 text-white hover:bg-red-600 shadow-lg shadow-red-500/30"
                }`}
              >
                {isPomoRunning ? "일시정지" : "집중 시작"}
              </button>
              
              {/* 시간이 25분이 아니거나 작동 중이 아닐 때 리셋 표시 */}
              {!isPomoRunning && pomoTime !== 25 * 60 && (
                 <button
                 onClick={resetPomo}
                 className="px-4 py-3 rounded-xl font-medium text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
               >
                 초기화
               </button>
              )}
            </div>
          </div>
        ) : (
          // --- ⏱️ 스톱워치 화면 ---
          <div className="text-center animate-fade-in w-full">
            <div className="text-7xl font-bold text-blue-400 mb-8 font-mono tabular-nums tracking-tighter">
              {formatTime(stopwatchTime)}
            </div>
            
            <div className="flex gap-4 justify-center">
              <button
                onClick={toggleStopwatch}
                className={`px-8 py-3 rounded-xl font-bold text-lg transition-all ${
                  isStopwatchRunning
                    ? "bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 border border-blue-500/50"
                    : "bg-blue-500 text-white hover:bg-blue-600 shadow-lg shadow-blue-500/30"
                }`}
              >
                {isStopwatchRunning ? "일시정지" : "기록 시작"}
              </button>
              
              {stopwatchTime > 0 && (
                <button
                  onClick={resetStopwatch}
                  className="px-4 py-3 rounded-xl font-medium text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
                >
                  초기화
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}