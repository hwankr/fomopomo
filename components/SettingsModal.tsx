'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';
import NotificationManager from './NotificationManager';
import ConfirmModal from './ConfirmModal';

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
  snowEnabled: boolean; // ❄️ 눈 효과
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
  snowEnabled: true, // ❄️ 눈 효과 (기본값: 켜짐)
  tasks: ['국어', '수학', '영어'],
  presets: [
    { id: '1', label: '프리셋1', minutes: 25 },
    { id: '2', label: '프리셋2', minutes: 50 },
    { id: '3', label: '프리셋3', minutes: 90 },
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
  const [snowEnabled, setSnowEnabled] = useState(DEFAULT_SETTINGS.snowEnabled); // ❄️ 눈 효과
  const [tasks, setTasks] = useState<string[]>(DEFAULT_SETTINGS.tasks);
  const [presets, setPresets] = useState<Preset[]>(DEFAULT_SETTINGS.presets);
  const [isResetSettingsConfirmOpen, setIsResetSettingsConfirmOpen] = useState(false);
  const [isResetAccountConfirmOpen, setIsResetAccountConfirmOpen] = useState(false);

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
          const localSaved = localStorage.getItem('fomopomo_settings');
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
          setSnowEnabled(loadedSettings.snowEnabled ?? DEFAULT_SETTINGS.snowEnabled); // ❄️ 로드
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
    localStorage.setItem('fomopomo_settings', JSON.stringify(newSettings));
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
      snowEnabled, // ❄️ 눈 효과
      tasks,
      presets,
    };
    await saveToAll(newSettings);
    // ❄️ SnowEffect 컴포넌트에 알리기
    window.dispatchEvent(new Event('settingsChanged'));
    toast.success('설정이 저장되었습니다!');
    onSave();
    onClose();
  };

  const handleResetSettings = async () => {
    setPomoTime(DEFAULT_SETTINGS.pomoTime);
    setShortBreak(DEFAULT_SETTINGS.shortBreak);
    setLongBreak(DEFAULT_SETTINGS.longBreak);
    setAutoStartBreaks(DEFAULT_SETTINGS.autoStartBreaks);
    setAutoStartPomos(DEFAULT_SETTINGS.autoStartPomos);
    setLongBreakInterval(DEFAULT_SETTINGS.longBreakInterval);
    setVolume(DEFAULT_SETTINGS.volume);
    setIsMuted(DEFAULT_SETTINGS.isMuted);
    setTaskPopupEnabled(DEFAULT_SETTINGS.taskPopupEnabled);
    setSnowEnabled(DEFAULT_SETTINGS.snowEnabled);
    setTasks(DEFAULT_SETTINGS.tasks);
    setPresets(DEFAULT_SETTINGS.presets);

    await saveToAll(DEFAULT_SETTINGS);
    // 설정 변경 이벤트 발생 (눈 효과 등 즉시 반영)
    window.dispatchEvent(new Event('settingsChanged'));
    toast.success('설정이 기본값으로 초기화되었습니다!');
    onSave();
    onClose();
  };

  const clearAccountLocalStorage = () => {
    [
      'fomopomo_settings',
      'fomopomo_pomoTime',
      'fomopomo_initialPomoTime',
      'fomopomo_stopwatchTime',
      'fomopomo_selectedTask',
      'fomopomo_selectedTaskId',
      'fomopomo_full_state',
      'fomopomo_task_state',
      'fomopomo_notification_dismissed',
      'fomopomo_changelog_last_viewed',
    ].forEach((key) => localStorage.removeItem(key));
  };

  const handleResetAccount = async () => {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    const user = session?.user;
    if (sessionError || !user) {
      toast.error('로그인 상태가 아닙니다.');
      return;
    }

    const toastId = toast.loading('계정 초기화 중...');

    try {
      if (!session?.access_token) {
        toast.error('로그인 정보가 유효하지 않습니다.', { id: toastId });
        return;
      }

      const response = await fetch('/api/account-reset', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (response.status === 409 && Array.isArray(payload?.groups)) {
          const groupNames = payload.groups.map((g: { name: string }) => g.name).join(', ');
          toast.error(`그룹장을 이양한 뒤에 초기화할 수 있습니다.\n그룹: ${groupNames}`, {
            id: toastId,
            duration: 5000,
          });
          return;
        }
        toast.error(payload?.error || '초기화 실패', { id: toastId });
        return;
      }

      clearAccountLocalStorage();

      toast.success('계정 초기화 완료', { id: toastId });
      window.location.reload();
    } catch (e) {
      console.error('계정 초기화 오류:', e);
      toast.error('초기화 실패', { id: toastId });
    }
  };

  const handleDeleteAccount = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      toast.error('로그인 상태가 아닙니다.');
      return;
    }

    // 1. 그룹장 여부 확인
    const { data: ownedGroups } = await supabase
      .from('groups')
      .select('id, name')
      .eq('leader_id', user.id);

    if (ownedGroups && ownedGroups.length > 0) {
      const groupNames = ownedGroups.map(g => g.name).join(', ');
      toast.error(`먼저 그룹장을 다른 멤버에게 넘기거나 그룹을 삭제해주세요.\n그룹: ${groupNames}`, {
        duration: 5000,
      });
      return;
    }

    // 2. 탈퇴 확인 대화상자
    const confirmMessage = `⚠️ 계정 탈퇴 경고

다음 데이터가 영구적으로 삭제됩니다:
• 모든 공부 기록
• 친구 목록
• 가입된 그룹
• 피드백/댓글
• 모든 설정

‼️ 이 작업은 복구할 수 없습니다!

정말로 탈퇴하시겠습니까?`;

    if (!confirm(confirmMessage)) return;

    // 3. 최종 확인
    if (!confirm('마지막 확인: 정말로 계정을 삭제하시겠습니까?')) return;

    const toastId = toast.loading('계정 삭제 중...');

    try {
      // 4. 모든 관련 데이터 삭제
      // 순서가 중요: FK 제약 조건 고려

      // 피드백 관련
      await supabase.from('feedback_likes').delete().eq('user_id', user.id);
      await supabase.from('feedback_replies').delete().eq('user_id', user.id);
      await supabase.from('feedbacks').delete().eq('user_id', user.id);

      // 친구 관련 (양방향 삭제)
      await supabase.from('friendships').delete().eq('user_id', user.id);
      await supabase.from('friendships').delete().eq('friend_id', user.id);
      await supabase.from('friend_requests').delete().eq('sender_id', user.id);
      await supabase.from('friend_requests').delete().eq('receiver_id', user.id);

      // 그룹 멤버십 (그룹장은 이미 위에서 확인함)
      await supabase.from('group_members').delete().eq('user_id', user.id);

      // 공부 기록
      await supabase.from('study_sessions').delete().eq('user_id', user.id);
      await supabase.from('monthly_plans').delete().eq('user_id', user.id);

      // 설정 및 상태
      await supabase.from('user_settings').delete().eq('user_id', user.id);
      await supabase.from('timer_states').delete().eq('user_id', user.id);

      // 푸시 알림
      await supabase.from('push_subscriptions').delete().eq('user_id', user.id);

      // 프로필 삭제 (주의: auth.users와 연결되어 있음)
      await supabase.from('profiles').delete().eq('id', user.id);

      // 로컬 스토리지 삭제
      localStorage.removeItem('fomopomo_settings');
      localStorage.removeItem('fomopomo_pomoTime');
      localStorage.removeItem('fomopomo_initialPomoTime');
      localStorage.removeItem('fomopomo_stopwatchTime');
      localStorage.removeItem('fomopomo_selectedTask');
      localStorage.removeItem('fomopomo_selectedTaskId');

      // 5. Auth 계정 삭제 (Edge Function 필요 - 없으면 로그아웃만)
      // Note: auth.admin.deleteUser()는 Edge Function에서만 가능
      // 여기서는 데이터만 삭제하고 로그아웃 처리

      toast.success('계정이 삭제되었습니다. 이용해 주셔서 감사합니다.', { id: toastId, duration: 3000 });

      await supabase.auth.signOut();
      window.location.href = '/';
    } catch (e) {
      console.error('계정 삭제 오류:', e);
      toast.error('계정 삭제에 실패했습니다. 다시 시도해주세요.', { id: toastId });
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
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in"
        onClick={handleSave}
      >
        <div
          className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[85vh]"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex justify-between items-center p-5 border-b border-gray-100">
            <h2 className="text-gray-500 font-bold tracking-widest text-sm flex items-center gap-2">
              ⚙️ 설정
            </h2>
            <button
              onClick={handleSave}
              className="text-gray-400 hover:text-gray-600"
            >
              ✕
            </button>
          </div>

          <div className="p-6 overflow-y-auto space-y-8 scrollbar-hide">
            <section>
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-gray-400 text-xs font-bold flex items-center gap-2">
                  🗂️ 작업 목록
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
                  🔥 뽀모도로 프리셋 설정
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
                  className={`${toggleBase} ${autoStartBreaks ? 'bg-rose-400' : 'bg-gray-300'
                    }`}
                >
                  <span
                    className={`${toggleDot} ${autoStartBreaks ? 'translate-x-5' : 'translate-x-0'
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
                  className={`${toggleBase} ${autoStartPomos ? 'bg-rose-400' : 'bg-gray-300'
                    }`}
                >
                  <span
                    className={`${toggleDot} ${autoStartPomos ? 'translate-x-5' : 'translate-x-0'
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
                  className={`${toggleBase} ${taskPopupEnabled ? 'bg-rose-400' : 'bg-gray-300'
                    }`}
                >
                  <span
                    className={`${toggleDot} ${taskPopupEnabled ? 'translate-x-5' : 'translate-x-0'
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
                    className={`${toggleBase} w-8 h-4 ${isMuted ? 'bg-gray-600' : 'bg-gray-300'
                      }`}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full shadow transform transition-transform duration-200 ${isMuted ? 'translate-x-4' : 'translate-x-0'
                        }`}
                    ></span>
                  </button>
                </div>
              </div>

              {/* 음소거면 슬라이더 비활성화 효과 */}
              <div
                className={`transition-opacity duration-200 ${isMuted ? 'opacity-40 pointer-events-none' : 'opacity-100'
                  }`}
              >
                <div className="flex justify-between mb-1">
                  <span className="text-gray-500 text-xs">볼륨</span>
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
              <h3 className="text-gray-400 text-xs font-bold mb-3 flex items-center gap-2">
                🔔 알림 설정
              </h3>
              <NotificationManager mode="inline" />
            </section>

            {/* ❄️ 겨울 눈 효과 (관리자: 이 섹션 삭제 가능) */}
            <hr className="border-gray-100" />
            <section className="space-y-3">
              {/* 눈 효과 토글 */}
              <div className="flex justify-between items-center">
                <div>
                  <span className="text-gray-600 text-sm font-medium flex items-center gap-2">
                    ❄️ 겨울 효과
                  </span>
                  <p className="text-[11px] text-gray-400 mt-1">
                    화면에 눈이 내려요 ⛄
                  </p>
                </div>
                <button
                  onClick={() => setSnowEnabled(!snowEnabled)}
                  className={`${toggleBase} ${snowEnabled ? 'bg-sky-400' : 'bg-gray-300'
                    }`}
                >
                  <span
                    className={`${toggleDot} ${snowEnabled ? 'translate-x-5' : 'translate-x-0'
                      }`}
                  ></span>
                </button>
              </div>



            </section>

            <hr className="border-gray-100" />
            <section>
              <h3 className="text-red-400 text-xs font-bold mb-3 flex items-center gap-2">
                ⚠️ 계정 설정
              </h3>
              <div className="flex flex-col gap-3">
                <div className="flex gap-3">
                  <button
                    onClick={() => setIsResetSettingsConfirmOpen(true)}
                    className="flex-1 py-3 bg-orange-50 text-orange-600 rounded-lg text-xs font-bold hover:bg-orange-100 transition-colors border border-orange-100 text-center"
                  >
                    ↻ 설정 초기화
                  </button>
                  <button
                    onClick={() => setIsResetAccountConfirmOpen(true)}
                    className="flex-1 py-3 bg-red-50 text-red-600 rounded-lg text-xs font-bold hover:bg-red-100 transition-colors border border-red-100 text-center"
                  >
                    🗑️ 계정 초기화
                  </button>
                </div>
                <button
                  onClick={handleDeleteAccount}
                  className="w-full py-3 bg-red-600 text-white rounded-lg text-xs font-bold hover:bg-red-700 transition-colors text-center"
                >
                  ⚠️ 계정 탈퇴 (복구 불가)
                </button>
              </div>
            </section>

            {/* ✨ 후원 섹션 (새로 추가) */}
            {/* <hr className="border-gray-100" />
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
          </section> */}
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
      <ConfirmModal
        isOpen={isResetSettingsConfirmOpen}
        onClose={() => setIsResetSettingsConfirmOpen(false)}
        onConfirm={handleResetSettings}
        title="설정 초기화"
        message="모든 설정이 기본값으로 돌아갑니다. 계속하시겠습니까?"
        confirmText="초기화"
        cancelText="취소"
        isDangerous={true}
      />
      <ConfirmModal
        isOpen={isResetAccountConfirmOpen}
        onClose={() => setIsResetAccountConfirmOpen(false)}
        onConfirm={handleResetAccount}
        title="계정 초기화"
        message={(
          <div className="space-y-3 text-sm">
            <p>다음 데이터가 모두 초기화됩니다.</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>공부 기록/시간</li>
              <li>친구/친구 요청</li>
              <li>가입된 그룹 (자동 탈퇴, 혼자만 있는 그룹은 삭제)</li>
              <li>할 일/주간·월간 플랜</li>
              <li>피드백/댓글/좋아요</li>
              <li>설정/알림</li>
            </ul>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              다른 멤버가 있는 그룹의 그룹장은 이양 후에 초기화할 수 있으며, 이 작업은 복구할 수 없습니다.
            </p>
          </div>
        )}
        confirmText="초기화"
        cancelText="취소"
        isDangerous={true}
      />
    </>
  );
}
