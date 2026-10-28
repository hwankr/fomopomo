// 그룹 목록·상세를 불러오는 동안 보이는 작은 회전 표시.
export default function GroupLoading() {
    return (
        <div role="status" className="flex justify-center py-12">
            <span
                aria-hidden="true"
                className="size-8 animate-spin rounded-full border-2 border-bead border-t-pomo motion-reduce:animate-none"
            />
            <span className="sr-only">불러오는 중이에요</span>
        </div>
    );
}
