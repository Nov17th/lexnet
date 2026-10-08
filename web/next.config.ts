import type { NextConfig } from "next";
const config: NextConfig = {
  poweredByHeader: false,
  agentRules: false,
  turbopack: { root: import.meta.dirname },
};
export default config;
