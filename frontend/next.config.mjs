// API_URL = full URL of the backend. On Render, API_HOSTPORT (private network "host:port") is used instead.
const API = process.env.API_URL || (process.env.API_HOSTPORT ? `http://${process.env.API_HOSTPORT}` : "http://localhost:8110");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API}/api/:path*` }];
  },
};
export default nextConfig;
