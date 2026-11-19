// A buyer can ask from X: "@holler ask @leo a 20 second birthday shoutout…"
// The webhook and the optional mention poll both land here.

export function parseAskMention(text, botHandle = process.env.X_BOT_HANDLE || "holler") {
  const raw = String(text || "").replace(/\s+/g, " ").trim();
  if (!raw) return null;
  const bot = String(botHandle || "holler").replace(/^@/, "").toLowerCase();
  const handles = [...raw.matchAll(/@([A-Za-z0-9_]{2,30})/g)].map((match) => match[1]);
  const creatorHandle = handles.map((handle) => handle.toLowerCase()).find((handle) => handle !== bot);
  if (!creatorHandle) return null;
  const brief = raw
    .replace(/@[A-Za-z0-9_]{2,30}/g, " ")
    .replace(/\b(ask|holler|please|hey|hi)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (brief.length < 12) return null;
  return { creatorHandle, brief };
}

export function startMentionPoll(onMention) {
  if (!process.env.X_BEARER_TOKEN || process.env.HOLLER_SKIP_X === "1") return () => {};
  const handle = String(process.env.X_BOT_HANDLE || "holler").replace(/^@/, "");
  const seen = new Set();
  let stopped = false;
  const tick = async () => {
    if (stopped) return;
    try {
      const query = new URL("https://api.x.com/2/tweets/search/recent");
      query.searchParams.set("query", `@${handle} -is:retweet`);
      query.searchParams.set("max_results", "10");
      query.searchParams.set("expansions", "author_id");
      query.searchParams.set("user.fields", "username");
      const response = await fetch(query, {
        headers: { authorization: `Bearer ${process.env.X_BEARER_TOKEN}` },
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) {
        console.warn(`[holler] x poll ${response.status}`);
        return;
      }
      const payload = await response.json();
      const names = new Map((payload.includes?.users || []).map((user) => [user.id, user.username]));
      for (const tweet of payload.data || []) {
        if (seen.has(tweet.id)) continue;
        seen.add(tweet.id);
        await onMention({
          text: tweet.text,
          tweetId: tweet.id,
          authorHandle: names.get(tweet.author_id) || "",
        });
      }
    } catch (error) {
      console.warn(`[holler] x poll (${error.message})`);
    }
  };
  const timer = setInterval(tick, Number(process.env.X_POLL_MS || 45000));
  timer.unref?.();
  tick();
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}
