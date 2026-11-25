import { authLinkType, isWebUrl } from "./urls.js";

const maxHops = 5;
const mobileUserAgent = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const redirects = new Set([301, 302, 303, 307, 308]);

export async function expandShortLink(url: URL): Promise<URL | undefined> {
  const signal = AbortSignal.timeout(3_000);
  let current = url;

  for (let hops = 0; hops <= maxHops; hops++) {
    if (!isWebUrl(current)) return undefined;
    if (authLinkType(current) === "agent-login") return current;

    const response = await fetch(current, {
      redirect: "manual",
      headers: { "user-agent": mobileUserAgent },
      signal,
    });
    await response.body?.cancel();

    if (!redirects.has(response.status)) return hops > 0 && response.ok ? current : undefined;
    const location = response.headers.get("location");
    if (hops === maxHops || !location || !URL.canParse(location, current.href)) return undefined;
    current = new URL(location, current);
  }
}
