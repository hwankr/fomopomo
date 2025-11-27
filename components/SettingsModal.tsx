'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
}

type Preset = {
  id: string;
  label: string;
  minutes: number;
};

type Settings = {
  pomoTime: number;
  shortBreak: number;
  longBreak: number;
  autoStartBreaks: boolean;
  autoStartPomos: boolean;
  longBreakInterval: number;
  volume: number;
  isMuted: boolean;
  taskPopupEnabled: boolean;
  tasks: string[];
  presets: Preset[];
};

const DEFAULT_SETTINGS = {
  pomoTime: 25,
  shortBreak: 5,
  longBreak: 15,
  autoStartBreaks: false,
  autoStartPomos: false,
  longBreakInterval: 4,
  volume: 50,
  isMuted: false, // ✨ 기본값 추가
  taskPopupEnabled: true,
  tasks: ['국어', '수학', '영어'],
  presets: [
    { id: '1', label: '작업1', minutes: 25 },
    { id: '2', label: '작업2', minutes: 50 },
    { id: '3', label: '작업3', minutes: 90 },
  ],
};

export default function SettingsModal({
  isOpen,
  onClose,
  onSave,
}: SettingsModalProps) {
  const [pomoTime, setPomoTime] = useState(DEFAULT_SETTINGS.pomoTime);
  const [shortBreak, setShortBreak] = useState(DEFAULT_SETTINGS.shortBreak);
  const [longBreak, setLongBreak] = useState(DEFAULT_SETTINGS.longBreak);
  const [autoStartBreaks, setAutoStartBreaks] = useState(
    DEFAULT_SETTINGS.autoStartBreaks
  );
  const [autoStartPomos, setAutoStartPomos] = useState(
    DEFAULT_SETTINGS.autoStartPomos
  );
  const [longBreakInterval, setLongBreakInterval] = useState(
    DEFAULT_SETTINGS.longBreakInterval
  );
  const [volume, setVolume] = useState(DEFAULT_SETTINGS.volume);
  const [isMuted, setIsMuted] = useState(DEFAULT_SETTINGS.isMuted); // ✨ 상태 추가
  const [taskPopupEnabled, setTaskPopupEnabled] = useState(
    DEFAULT_SETTINGS.taskPopupEnabled
  );
  const [tasks, setTasks] = useState<string[]>(DEFAULT_SETTINGS.tasks);
  const [presets, setPresets] = useState<Preset[]>(DEFAULT_SETTINGS.presets);

  useEffect(() => {
    const loadSettings = async () => {
      if (isOpen) {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        let loadedSettings = null;

        if (user) {
          const { data } = await supabase
            .from('user_settings')
            .select('settings')
            .eq('user_id', user.id)
            .single();
          if (data) loadedSettings = data.settings;
        }

        if (!loadedSettings) {
          const localSaved = localStorage.getItem('pomofomo_settings');
          if (localSaved) loadedSettings = JSON.parse(localSaved);
        }

        if (loadedSettings) {
          setPomoTime(loadedSettings.pomoTime ?? DEFAULT_SETTINGS.pomoTime);
          setShortBreak(
            loadedSettings.shortBreak ?? DEFAULT_SETTINGS.shortBreak
          );
          setLongBreak(loadedSettings.longBreak ?? DEFAULT_SETTINGS.longBreak);
          setAutoStartBreaks(
            loadedSettings.autoStartBreaks ?? DEFAULT_SETTINGS.autoStartBreaks
          );
          setAutoStartPomos(
            loadedSettings.autoStartPomos ?? DEFAULT_SETTINGS.autoStartPomos
          );
          setLongBreakInterval(
            loadedSettings.longBreakInterval ??
              DEFAULT_SETTINGS.longBreakInterval
          );
          setVolume(loadedSettings.volume ?? DEFAULT_SETTINGS.volume);
          setIsMuted(loadedSettings.isMuted ?? DEFAULT_SETTINGS.isMuted); // ✨ 로드
          setTaskPopupEnabled(
            loadedSettings.taskPopupEnabled ?? DEFAULT_SETTINGS.taskPopupEnabled
          );
          if (loadedSettings.tasks && loadedSettings.tasks.length > 0) {
            setTasks(loadedSettings.tasks);
          }
          if (loadedSettings.presets && loadedSettings.presets.length > 0) {
            setPresets(loadedSettings.presets);
          }
        }
      }
    };
    loadSettings();
  }, [isOpen]);

const saveToAll = async (newSettings: Settings) => { 
    localStorage.setItem('pomofomo_settings', JSON.stringify(newSettings));
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      await supabase.from('user_settings').upsert({
        user_id: user.id,
        settings: newSettings,
      });
    }
  };

  const handleSave = async () => {
    const newSettings = {
      pomoTime,
      shortBreak,
      longBreak,
      autoStartBreaks,
      autoStartPomos,
      longBreakInterval,
      volume,
      isMuted,
      taskPopupEnabled,
      tasks,
      presets,
    };
    await saveToAll(newSettings);
    toast.success('설정이 저장되었습니다!');
    onSave();
    onClose();
  };

  const handleCloseClick = () => {
    const shouldSave = confirm('변경사항을 저장하고 닫을까요?');
    if (shouldSave) {
      handleSave();
    } else {
      onClose();
    }
  };

  const handleResetSettings = async () => {
    if (!confirm('설정을 초기화하시겠습니까?')) return;

    setPomoTime(DEFAULT_SETTINGS.pomoTime);
    setShortBreak(DEFAULT_SETTINGS.shortBreak);
    setLongBreak(DEFAULT_SETTINGS.longBreak);
    setAutoStartBreaks(DEFAULT_SETTINGS.autoStartBreaks);
    setAutoStartPomos(DEFAULT_SETTINGS.autoStartPomos);
    setLongBreakInterval(DEFAULT_SETTINGS.longBreakInterval);
    setVolume(DEFAULT_SETTINGS.volume);
    setIsMuted(DEFAULT_SETTINGS.isMuted);
    setTaskPopupEnabled(DEFAULT_SETTINGS.taskPopupEnabled);
    setTasks(DEFAULT_SETTINGS.tasks);
    setPresets(DEFAULT_SETTINGS.presets);

    await saveToAll(DEFAULT_SETTINGS);
    toast.success('설정 초기화 완료');
    onSave();
  };

  const handleResetAccount = async () => {
    if (!confirm('⚠️ 모든 데이터가 삭제됩니다. 계속하시겠습니까?')) return;

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      toast.error('로그인 상태가 아닙니다.');
      return;
    }

    const toastId = toast.loading('삭제 중...');

    try {
      await supabase.from('study_sessions').delete().eq('user_id', user.id);
      await supabase.from('user_settings').delete().eq('user_id', user.id);
      await supabase.from('timer_states').delete().eq('user_id', user.id);

      localStorage.removeItem('pomofomo_settings');
      localStorage.removeItem('pomofomo_pomoTime');
      localStorage.removeItem('pomofomo_initialPomoTime');
      localStorage.removeItem('pomofomo_stopwatchTime');

      toast.success('계정 초기화 완료', { id: toastId });
      await supabase.auth.signOut();
      window.location.reload();
    } catch (e) {
      console.error(e);
      toast.error('초기화 실패', { id: toastId });
    }
  };

  const addPreset = () => {
    if (presets.length >= 3) {
      toast.error('최대 3개까지만 가능합니다.');
      return;
    }
    setPresets([
      ...presets,
      { id: Date.now().toString(), label: '새 작업', minutes: 25 },
    ]);
  };

  const removePreset = (id: string) => {
    setPresets(presets.filter((p) => p.id !== id));
  };

  const addTask = () => {
    if (tasks.length >= 10) {
      toast.error('작업은 최대 10개까지만 저장할 수 있어요.');
      return;
    }
    setTasks([...tasks, '새 작업']);
  };

  const updateTask = (index: number, value: string) => {
    setTasks(tasks.map((task, i) => (i === index ? value : task)));
  };

  const removeTask = (index: number) => {
    setTasks(tasks.filter((_, i) => i !== index));
  };

  const updatePreset = (
    id: string,
    field: 'label' | 'minutes',
    value: string | number
  ) => {
    setPresets(
      presets.map((p) => (p.id === id ? { ...p, [field]: value } : p))
    );
  };

  if (!isOpen) return null;

  const inputStyle =
    'w-full bg-gray-100 text-gray-700 p-2 rounded-lg font-medium focus:outline-none focus:ring-2 focus:ring-rose-200 transition-all text-sm';
  const toggleBase =
    'w-10 h-5 rounded-full relative transition-colors duration-200 ease-in-out cursor-pointer';
  const toggleDot =
    'absolute top-1 left-1 w-3 h-3 bg-white rounded-full shadow transform transition-transform duration-200 ease-in-out';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[85vh]">
        <div className="flex justify-between items-center p-5 border-b border-gray-100">
          <h2 className="text-gray-500 font-bold tracking-widest text-sm flex items-center gap-2">
            ⚙️ SETTINGS
          </h2>
          <button
            onClick={handleCloseClick}
            className="text-gray-400 hover:text-gray-600"
          >
            ✕
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-8 scrollbar-hide">
          <section>
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-gray-400 text-xs font-bold flex items-center gap-2">
                🗂️ 작업 목록 (Report 집계용)
              </h3>
              <button
                onClick={addTask}
                className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded hover:bg-gray-200 transition-colors font-bold"
              >
                + 추가
              </button>
            </div>
            <p className="text-[11px] text-gray-500 mb-2">
              여기서 정한 이름만 선택해서 저장되므로, Report에서 국어·수학처럼 일관된 항목으로 모아볼 수 있어요.
            </p>
            <div className="space-y-2">
              {tasks.map((task, index) => (
                <div key={index} className="flex gap-2 items-center">
                  <input
                    type="text"
                    value={task}
                    onChange={(e) => updateTask(index, e.target.value)}
                    className={`${inputStyle} flex-grow`}
                    placeholder="예: 국어"
                  />
                  <button
                    onClick={() => removeTask(index)}
                    className="text-gray-400 hover:text-red-500 p-2"
                  >
                    🗑️
                  </button>
                </div>
              ))}
              {tasks.length === 0 && (
                <div className="text-[11px] text-gray-400">작업을 추가해주세요.</div>
              )}
            </div>
          </section>
          <hr className="border-gray-100" />
          <section>
            <div className="flex justify-between items-end mb-3">
              <h3 className="text-gray-400 text-xs font-bold flex items-center gap-2">
                🔥 바로가기 버튼 설정 (최대 3개)
              </h3>
              {presets.length < 3 && (
                <button
                  onClick={addPreset}
                  className="text-xs bg-rose-100 text-rose-500 px-2 py-1 rounded hover:bg-rose-200 transition-colors font-bold"
                >
                  + 추가
                </button>
              )}
            </div>
            <div className="space-y-2">
              {presets.map((preset) => (
                <div key={preset.id} className="flex gap-2 items-center">
                  <input
                    type="text"
                    value={preset.label}
                    onChange={(e) =>
                      updatePreset(preset.id, 'label', e.target.value)
                    }
                    className={`${inputStyle} flex-grow`}
                    placeholder="이름"
                  />
                  <input
                    type="number"
                    value={preset.minutes}
                    onChange={(e) =>
                      updatePreset(preset.id, 'minutes', Number(e.target.value))
                    }
                    className={`${inputStyle} w-20 text-center`}
                    placeholder="분"
                  />
                  <button
                    onClick={() => removePreset(preset.id)}
                    className="text-gray-400 hover:text-red-500 p-2"
                  >
                    🗑️
                  </button>
                </div>
              ))}
            </div>
          </section>
          <hr className="border-gray-100" />
          <section>
            <h3 className="text-gray-400 text-xs font-bold mb-3">
              🕒 기본 시간 설정 (분)
            </h3>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <span className="text-[10px] text-gray-400 mb-1 block">
                  집중
                </span>
                <input
                  type="number"
                  value={pomoTime}
                  onChange={(e) => setPomoTime(Number(e.target.value))}
                  className={inputStyle}
                />
              </div>
              <div>
                <span className="text-[10px] text-gray-400 mb-1 block">
                  짧은 휴식
                </span>
                <input
                  type="number"
                  value={shortBreak}
                  onChange={(e) => setShortBreak(Number(e.target.value))}
                  className={inputStyle}
                />
              </div>
              <div>
                <span className="text-[10px] text-gray-400 mb-1 block">
                  긴 휴식
                </span>
                <input
                  type="number"
                  value={longBreak}
                  onChange={(e) => setLongBreak(Number(e.target.value))}
                  className={inputStyle}
                />
              </div>
            </div>
          </section>
          <section className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-gray-600 text-sm font-medium">
                휴식 자동 시작
              </span>
              <button
                onClick={() => setAutoStartBreaks(!autoStartBreaks)}
                className={`${toggleBase} ${
                  autoStartBreaks ? 'bg-rose-400' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`${toggleDot} ${
                    autoStartBreaks ? 'translate-x-5' : 'translate-x-0'
                  }`}
                ></span>
              </button>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600 text-sm font-medium">
                뽀모도로 자동 시작
              </span>
              <button
                onClick={() => setAutoStartPomos(!autoStartPomos)}
                className={`${toggleBase} ${
                  autoStartPomos ? 'bg-rose-400' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`${toggleDot} ${
                  autoStartPomos ? 'translate-x-5' : 'translate-x-0'
                }`}
              ></span>
              </button>
            </div>
            <div className="flex justify-between items-center">
              <div>
                <span className="text-gray-600 text-sm font-medium">
                  저장 시 작업 메모 팝업
                </span>
                <p className="text-[11px] text-gray-400 mt-1">
                  작업 내용을 기록할지 물어보는 팝업입니다.
                </p>
              </div>
              <button
                onClick={() => setTaskPopupEnabled(!taskPopupEnabled)}
                className={`${toggleBase} ${
                  taskPopupEnabled ? 'bg-rose-400' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`${toggleDot} ${
                    taskPopupEnabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                ></span>
              </button>
            </div>
            <div className="flex justify-between items-center pt-2">
              <span className="text-gray-600 text-sm font-medium">
                긴 휴식 간격 (사이클)
              </span>
              <input
                type="number"
                value={longBreakInterval}
                onChange={(e) => setLongBreakInterval(Number(e.target.value))}
                className="w-16 bg-gray-100 text-gray-700 p-1 rounded text-center font-bold focus:outline-none"
              />
            </div>
          </section>
          <hr className="border-gray-100" />

          {/* ✨ 소리 설정 (음소거 기능 추가) */}
          <section>
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-gray-400 text-xs font-bold">🔊 알림 소리</h3>

              {/* 음소거 토글 */}
              <div className="flex items-center gap-2">
                <span className="text-gray-500 text-xs font-bold">음소거</span>
                <button
                  onClick={() => setIsMuted(!isMuted)}
                  className={`${toggleBase} w-8 h-4 ${
                    isMuted ? 'bg-gray-600' : 'bg-gray-300'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full shadow transform transition-transform duration-200 ${
                      isMuted ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  ></span>
                </button>
              </div>
            </div>

            {/* 음소거면 슬라이더 비활성화 효과 */}
            <div
              className={`transition-opacity duration-200 ${
                isMuted ? 'opacity-40 pointer-events-none' : 'opacity-100'
              }`}
            >
              <div className="flex justify-between mb-1">
                <span className="text-gray-500 text-xs">Volume</span>
                <span className="text-gray-400 text-xs font-mono">
                  {volume}%
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={volume}
                onChange={(e) => setVolume(Number(e.target.value))}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-rose-400"
              />
            </div>
          </section>

          <hr className="border-gray-100" />
          <section>
            <h3 className="text-red-400 text-xs font-bold mb-3 flex items-center gap-2">
              ⚠️ DANGER ZONE
            </h3>
            <div className="flex gap-3">
              <button
                onClick={handleResetSettings}
                className="flex-1 py-3 bg-orange-50 text-orange-600 rounded-lg text-xs font-bold hover:bg-orange-100 transition-colors border border-orange-100 text-center"
              >
                ↻ 설정 초기화
              </button>
              <button
                onClick={handleResetAccount}
                className="flex-1 py-3 bg-red-50 text-red-600 rounded-lg text-xs font-bold hover:bg-red-100 transition-colors border border-red-100 text-center"
              >
                🗑️ 계정 초기화
              </button>
            </div>
          </section>

                    {/* ✨ 후원 섹션 (새로 추가) */}
          <hr className="border-gray-100" />
          <section>
            <h3 className="text-gray-400 text-xs font-bold mb-3 flex items-center gap-2">
               ☕ SUPPORT
            </h3>
            <a 
              href="https://www.buymeacoffee.com/" 
              target="_blank" 
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full py-3 bg-yellow-400 text-yellow-900 rounded-xl font-bold hover:bg-yellow-500 transition-colors shadow-sm"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M5 2a1 1 0 011-1h8a1 1 0 011 1v1h1a2 2 0 012 2v5a2 2 0 01-2 2h-1.441l-1.3 4.034a3 3 0 01-2.86 2.074H7.6a3 3 0 01-2.861-2.074L3.44 10H2a2 2 0 01-2-2V3a2 2 0 012-2h1V2zm1 1v6h8V3H6zm9 2V3h1v2h-1zm-11 0H3V3h1v2zm-.88 8L5.6 16.034a1 1 0 00.954.692h6.892a1 1 0 00.954-.692l1.48-4.634A3.96 3.96 0 0115 11h1V5H4v6h1a3.96 3.96 0 01-.88 2z" clipRule="evenodd" />
              </svg>
              개발자에게 커피 사주기
            </a>
            <p className="text-[10px] text-gray-400 text-center mt-2">
              더 좋은 기능을 만드는 데 큰 힘이 됩니다! 🍅
            </p>
          </section>
        </div>
        <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-end">
          <button
            onClick={handleSave}
            className="px-6 py-3 bg-gray-800 text-white font-bold rounded-xl hover:bg-gray-900 transition-colors shadow-lg text-sm"
          >
            저장하기
          </button>
        </div>
      </div>
    </div>
  );
}
