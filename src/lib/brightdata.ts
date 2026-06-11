/**
 * Bright Data LinkedIn people dataset (gd_l1viktl72bvl7bjuj0).
 *
 * Supplementary only (validated Phase 0): good for about/certifications/honors/
 * languages/company info; its `experience` field is never a populated array, so
 * Apify's harvest profile remains the backbone. Trigger → poll → download.
 */

const DATASET_ID = "gd_l1viktl72bvl7bjuj0";

function getKey(): string {
  const key = process.env.BRIGHTDATA_API_KEY;
  if (!key) throw new Error("BRIGHTDATA_API_KEY is not set");
  return key;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Best-effort profile scrape. Returns null on failure (caller degrades gracefully). */
export async function scrapeBrightDataProfile(url: string): Promise<Record<string, any> | null> {
  const key = getKey();

  const trig = await fetch(
    `https://api.brightdata.com/datasets/v3/trigger?dataset_id=${DATASET_ID}&include_errors=true`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify([{ url }]),
      signal: AbortSignal.timeout(20_000),
    },
  );
  if (!trig.ok) {
    throw new Error(`BrightData trigger ${trig.status}: ${(await trig.text()).slice(0, 200)}`);
  }
  const { snapshot_id } = (await trig.json()) as { snapshot_id?: string };
  if (!snapshot_id) return null;

  // Poll for readiness (up to ~3.5 min).
  for (let i = 0; i < 40; i++) {
    await sleep(5000);
    const p = await fetch(`https://api.brightdata.com/datasets/v3/progress/${snapshot_id}`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(20_000),
    });
    const { status } = (await p.json()) as { status?: string };
    if (status === "ready") break;
    if (status === "failed") throw new Error("BrightData snapshot failed");
  }

  const dl = await fetch(`https://api.brightdata.com/datasets/v3/snapshot/${snapshot_id}?format=json`, {
    headers: { Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(30_000),
  });
  const data = await dl.json();
  const row = Array.isArray(data) ? data[0] : data;
  // Bright Data returns {warning}/{error} rows when it can't fetch — treat as miss.
  if (!row || row.error || row.warning) return null;
  return row;
}
