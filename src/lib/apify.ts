/**
 * Apify client for LinkedIn scraping (Deep Stakeholder Analysis).
 *
 * Validated in Phase 0 (see memory: stakeholder-scraping-method):
 *  - Profile body  → harvestapi/linkedin-profile-scraper  (LpVuK3Zozwuipa5bp)
 *  - Posts         → apimaestro/linkedin-profile-posts     (LQQIXN9Othf8f7R5n)
 *  - URL search    → harvestapi/linkedin-profile-search-by-name (CP1SVZfEwWflrmWCX)
 *
 * The profile actor returns {error} under concurrent load, so runApifyActor
 * retries with backoff. Posts are capped to keep cost + synthesis noise down.
 */

export const APIFY_ACTORS = {
  search: "CP1SVZfEwWflrmWCX",
  profile: "LpVuK3Zozwuipa5bp",
  posts: "LQQIXN9Othf8f7R5n",
} as const;

// Cap posts — the posts actor bills $5/1k results ($0.005/post) and dominates
// cost. The cap MUST be passed to the actor (total_posts) so we're billed for
// only these, not the actor's default 100/page that we'd otherwise slice away.
const MAX_POSTS = 20;

function getToken(): string {
  const token = process.env.APIFY_API_TOKEN;
  if (!token) throw new Error("APIFY_API_TOKEN is not set");
  return token;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Run an Apify actor synchronously and return its dataset items.
 * Retries on transient failures and on the actor's {error} sentinel
 * (the harvest profile actor returns this under concurrent load).
 */
export async function runApifyActor<T = Record<string, unknown>>(
  actorId: string,
  input: Record<string, unknown>,
  maxRetries = 3,
): Promise<T[]> {
  const url = `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${getToken()}`;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
        signal: AbortSignal.timeout(240_000),
      });

      if (!res.ok) {
        const body = (await res.text()).slice(0, 300);
        const retryable = res.status === 429 || res.status >= 500;
        if (retryable && attempt < maxRetries - 1) {
          await sleep((attempt + 1) * 8000);
          continue;
        }
        throw new Error(`Apify ${actorId} ${res.status}: ${body}`);
      }

      const items = (await res.json()) as T[];

      // The harvest actor sometimes returns a single {error} item under load.
      const first = items?.[0] as { error?: unknown } | undefined;
      if (items?.length === 1 && first?.error && attempt < maxRetries - 1) {
        await sleep((attempt + 1) * 8000);
        continue;
      }

      return items || [];
    } catch (err) {
      if (attempt < maxRetries - 1) {
        await sleep((attempt + 1) * 8000);
        continue;
      }
      throw err;
    }
  }
  return [];
}

const urlOf = (it: Record<string, any>): string | null =>
  it?.linkedinUrl ||
  it?.url ||
  it?.profileUrl ||
  (it?.publicIdentifier ? `https://www.linkedin.com/in/${it.publicIdentifier}` : null);

/**
 * Resolve a name (+ company) to a LinkedIn /in/ URL via the search actor.
 * The company-name filter returns ONLY people currently at that company,
 * collapsing same-name crowds to the right person:
 *   exactly 1 hit  → high confidence
 *   0 or >1 hits   → low confidence (caller should request confirmation)
 */
export async function searchLinkedInUrl(
  firstName: string,
  lastName: string,
  company?: string,
): Promise<{ url: string | null; confidence: "high" | "low"; candidates: number }> {
  if (company) {
    const filtered = await runApifyActor<Record<string, any>>(APIFY_ACTORS.search, {
      profileScraperMode: "Short",
      firstName,
      lastName,
      currentCompanies: [company],
      maxPages: 1,
    });
    if (filtered.length === 1) {
      return { url: urlOf(filtered[0]), confidence: "high", candidates: 1 };
    }
    if (filtered.length > 1) {
      return { url: urlOf(filtered[0]), confidence: "low", candidates: filtered.length };
    }
    // 0 hits — LinkedIn employer text may differ; fall through to unfiltered.
  }

  const items = await runApifyActor<Record<string, any>>(APIFY_ACTORS.search, {
    profileScraperMode: "Short",
    firstName,
    lastName,
    maxPages: 1,
  });
  return { url: items[0] ? urlOf(items[0]) : null, confidence: "low", candidates: items.length };
}

/** Scrape the full profile body (experience/skills/about/education/certs). */
export async function scrapeHarvestProfile(url: string): Promise<Record<string, any> | null> {
  const items = await runApifyActor<Record<string, any>>(APIFY_ACTORS.profile, {
    queries: [url],
    profileScraperMode: "Profile details no email ($4 per 1k)",
  });
  const first = items[0];
  if (!first || first.error) return null;
  return first;
}

/** Extract the LinkedIn handle (the /in/<handle> slug) from a profile URL. */
export function linkedinHandle(url: string): string | null {
  const m = String(url || "").match(/\/in\/([^/?#]+)/i);
  return m ? decodeURIComponent(m[1]).toLowerCase() : null;
}

/**
 * True when a post clearly belongs to someone OTHER than `wantHandle`.
 * apimaestro echoes the post author (author.username / public_identifier /
 * profile_url, or a top-level profileUrl). If we can read an author handle and
 * it doesn't match, the actor returned the wrong person's activity — drop it.
 * If no author handle is present we can't tell, so we keep the post.
 */
function postAuthorMismatch(p: any, wantHandle: string | null): boolean {
  if (!wantHandle) return false;
  const a = p.author || p.actor || {};
  const candidate =
    a.username ||
    a.public_identifier ||
    a.publicIdentifier ||
    linkedinHandle(a.profile_url || a.profileUrl || a.url || "") ||
    linkedinHandle(p.profileUrl || p.profile_url || p.authorProfileUrl || "");
  if (!candidate) return false;
  return String(candidate).toLowerCase() !== wantHandle;
}

/** Scrape recent posts (full text/dates/engagement), capped to MAX_POSTS. */
export async function scrapeApifyPosts(url: string): Promise<Record<string, any>[]> {
  // Pass the HANDLE (not the full URL) as `username` — the validated input.
  // Passing a full URL here let the actor fuzzy-fall-back to a DIFFERENT
  // profile's posts, which were then attached to people who have no posts.
  const handle = linkedinHandle(url);
  const want = handle; // author-match target
  // The actor accepts a few input shapes; try handle first, then URL fallbacks.
  // COST GUARD: this actor bills $0.005 per post it RETURNS (not per post we
  // keep). total_posts caps what it scrapes/bills; limit bounds the page;
  // page_number:1 forbids pagination. Never loop pages here — that multiplies
  // the bill. Without these the actor defaults to 100/page = ~$0.50/profile.
  const cap = { total_posts: MAX_POSTS, limit: MAX_POSTS, page_number: 1 };
  const shapes: Record<string, unknown>[] = [];
  if (handle) shapes.push({ username: handle, ...cap });
  shapes.push({ username: url, ...cap }, { profileUrl: url, ...cap }, { profileUrls: [url], ...cap }, { urls: [url], ...cap });
  for (const input of shapes) {
    try {
      const items = await runApifyActor<Record<string, any>>(APIFY_ACTORS.posts, input);
      // Tripwire: if the actor ignored the cap we were billed for the overage.
      // Surface it loudly so a runaway is caught on the first real run, not in
      // a surprise invoice. (We still slice for synthesis below.)
      if ((items?.length ?? 0) > MAX_POSTS) {
        console.warn(
          `[apify-cost] posts actor returned ${items.length} for ${url} but cap is ${MAX_POSTS} — cap param likely ignored; we were billed for the overage. Verify the actor's input schema.`,
        );
      }
      // Drop the "no activity" sentinel ({profile_input, message}, no .text).
      const real = (items || []).filter((p) => p && p.text && !p.message && !p.profile_input);
      // IDENTITY GUARD: drop posts whose author handle doesn't match the person
      // we asked for. Protects against the actor returning a different profile.
      const mine = real.filter((p) => !postAuthorMismatch(p, want));
      if (real.length && !mine.length) {
        console.warn(
          `[apify] posts actor returned ${real.length} posts for ${url} but NONE matched handle "${want}" — wrong profile, discarding.`,
        );
      }
      if (mine.length) return mine.slice(0, MAX_POSTS);
      // Actor found the right person with genuinely no posts → stop, return [].
      if (items && items.length && !real.length) return [];
    } catch {
      /* try next shape */
    }
  }
  return [];
}
