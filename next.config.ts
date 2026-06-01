import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    unoptimized: true,
  },
  serverExternalPackages: [
    // libredwg-web ships a 4MB WASM blob next to its JS glue code.
    // Marking it external keeps Next.js from bundling the JS, so the
    // WASM loader can resolve the .wasm file at runtime via its
    // node_modules path.
    '@mlightcad/libredwg-web',
  ],
};

export default nextConfig;
