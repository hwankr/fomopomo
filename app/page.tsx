export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gray-900 text-white">
      <h1 className="text-4xl font-bold mb-4 text-transparent bg-clip-text bg-gradient-to-r from-red-400 to-orange-400">
        Pomofomo
      </h1>
      <p className="text-gray-400 mb-8">
        뽀모도로를 안 하면 포모가 온다!
      </p>
      
      {/* 여기에 나중에 타이머 블록을 끼워 넣을 겁니다 */}
      <div className="w-full max-w-md p-6 bg-gray-800 rounded-2xl shadow-xl border border-gray-700 text-center">
        <div className="text-2xl text-gray-500">
          타이머가 들어갈 자리
        </div>
      </div>
    </main>
  );
}