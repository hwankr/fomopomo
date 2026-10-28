import RouteEnter from '@/components/layout/RouteEnter';

// 화면(경로 첫 단계)이 바뀔 때마다 Next가 새로 붙이는 틀. 헤더 아래 본문의 등장 애니메이션만 맡는다.
// 레이아웃(ShellProvider·토스트·탭 바)은 이 바깥에 있어 다시 그려지지 않는다.
export default function Template({ children }: { children: React.ReactNode }) {
  return <RouteEnter>{children}</RouteEnter>;
}
