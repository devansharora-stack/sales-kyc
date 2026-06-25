import { Inngest } from "inngest";

// Force production (cloud) mode in prod even if the deploy pipeline leaves a
// leftover INNGEST_DEV=1 on the service. Without this the SDK would target a
// local dev server, so events never reach Inngest Cloud and jobs hang at 0%.
const isProd = process.env.NODE_ENV === "production";

export const inngest = new Inngest({
  id: "sales-kyc",
  ...(isProd ? { isDev: false } : {}),
});
