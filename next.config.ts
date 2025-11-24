import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'www.svgrepo.com', // 아이콘 사이트 허용
      },
      {
        protocol: 'https',
        hostname: '*.googleusercontent.com', // 구글 프로필 이미지 허용
      },
    ],
  },
};

export default nextConfig;