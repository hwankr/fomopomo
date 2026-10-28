import type { Metadata } from 'next';
import SettingsScreen from '@/components/settings/SettingsScreen';

// 개인 화면이라 루트 레이아웃의 noindex를 그대로 따르고 sitemap에도 넣지 않는다.
export const metadata: Metadata = {
  title: '설정',
};

export default function SettingsPage() {
  return <SettingsScreen />;
}
