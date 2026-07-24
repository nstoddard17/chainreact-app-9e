/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // typedRoutes regenerates types on build — running typecheck before build sees
  // a stale type for new routes. Re-enable once the route set is stable.
  typedRoutes: false,
  // Document parsing libraries (services/documents/parsing/*) stay external
  // to the server bundle: unpdf lazily imports its ESM PDF.js bundle (a
  // webpack-inlining hazard) and exceljs/mammoth are large CJS trees with
  // dynamic requires. Server-only usage is enforced by
  // tests/structure/documents-parsing-server-only.test.ts.
  serverExternalPackages: ["unpdf", "exceljs", "mammoth", "papaparse"],
};

export default nextConfig;
