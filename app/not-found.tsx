import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-[calc(100dvh-4rem)] flex-col items-center justify-center gap-6 px-4 py-16 text-center">
      <div className="flex flex-col gap-2">
        <h2 className="ui-h1">
          페이지를 찾을 수 없습니다
        </h2>
        <p className="text-ink-muted">
          요청하신 페이지가 존재하지 않거나, 주소가 변경되었을 수 있습니다.
        </p>
      </div>
      <Link
        href="/"
        className="ui-button-primary min-h-12 rounded-tile px-6"
      >
        홈으로 돌아가기
      </Link>
    </div>
  );
}
