/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Не бандлить нативные пакеты Neon-адаптера — требуются как есть в рантайме (иначе ломается ws).
  // Next 15: ключ переехал из experimental на верхний уровень (serverComponentsExternalPackages → serverExternalPackages).
  serverExternalPackages: ["@prisma/adapter-neon", "@neondatabase/serverless", "ws"],
  images: {
    // NFT/gift media are served from various TON/Telegram CDNs; allow remote images.
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
};

export default nextConfig;
