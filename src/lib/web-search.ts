/**
 * Web utilities — page fetching for verification.
 *
 * Research agents use Claude's built-in server-side web_search tool
 * (no external API needed). This file provides page fetching for
 * the verification agent to confirm source content.
 */

export async function fetchPageContent(
  url: string,
  maxChars = 30000
): Promise<{ ok: boolean; content: string; statusCode: number }> {
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(12000),
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; KYCGenie/1.0; +https://techolution.com)",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });

    if (!res.ok) {
      return { ok: false, content: "", statusCode: res.status };
    }

    const html = await res.text();

    // Strip script/style tags first, then all HTML tags
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<nav[\s\S]*?<\/nav>/gi, "")
      .replace(/<footer[\s\S]*?<\/footer>/gi, "")
      .replace(/<header[\s\S]*?<\/header>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, maxChars);

    return { ok: true, content: text, statusCode: res.status };
  } catch {
    return { ok: false, content: "", statusCode: 0 };
  }
}
