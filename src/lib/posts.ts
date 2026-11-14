export const MAX_POST_LENGTH = 280;

export type Post = {
  id: string;
  user_id: string | null;
  body: string;
  created_at: string;
  author?: string;
  avatar?: string;
  likes?: number;
};

export function characterCount(value: string) {
  return Array.from(value).length;
}

export function validatePost(body: string): string | null {
  if (!body.trim()) return "Write a little something before sharing.";
  if (characterCount(body) > MAX_POST_LENGTH) {
    return `Keep your message to ${MAX_POST_LENGTH} characters or fewer.`;
  }
  return null;
}

export function isPost(value: unknown): value is Post {
  if (!value || typeof value !== "object") return false;
  const post = value as Partial<Post>;
  return (
    typeof post.id === "string" &&
    (post.user_id === null || typeof post.user_id === "string") &&
    typeof post.body === "string" &&
    typeof post.created_at === "string" &&
    Number.isFinite(Date.parse(post.created_at))
  );
}

/** Merge snapshots and streamed rows without losing an insert received mid-fetch. */
export function mergePosts(...groups: Post[][]): Post[] {
  const byId = new Map<string, Post>();
  for (const posts of groups) {
    for (const post of posts) byId.set(post.id, post);
  }
  return [...byId.values()].sort(
    (a, b) =>
      Date.parse(b.created_at) - Date.parse(a.created_at) ||
      b.id.localeCompare(a.id),
  );
}

export function createDemoPosts(now = Date.now()): Post[] {
  const messages = [
    { author: "Maya Chen", body: "Remember when writing on someone's wall was the whole point? Let's bring a little of that back. 👋", likes: 12 },
    { author: "Alex Morgan", body: "Currently: making a playlist, ignoring my to-do list, and feeling very 2008. Anyone have a song recommendation? 🎧", likes: 8 },
    { author: "Jordan Lee", body: "A tiny corner of the internet with no algorithms. Just us, and whatever's on our minds. I like it here.", likes: 24 },
    { author: "Sam Rivera", body: "You have been poked. 👉 Consider this your official invitation to say hello on the wall.", likes: 6 },
    { author: "Taylor Kim", body: "First wall post! Here's to old friends, new connections, and the good old days of the internet. ✨", likes: 18 },
  ];
  return messages.map((message, index) => ({
    id: `seed-${index + 1}`,
    user_id: null,
    created_at: new Date(now - (index * 19 + 4) * 60_000).toISOString(),
    ...message,
  }));
}
