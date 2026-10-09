import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireProfile, signPaths } from "@/lib/session";
import { PAGE, cursorOf, takePage } from "@/lib/cursor";
import { ChannelChat, type ChatMessage } from "@/components/channels/channel-chat";
import { cn } from "@/lib/utils";
import type { Profile } from "@/lib/types";

export const metadata = { title: "General" };

export default async function ChannelPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ message?: string }>;
}) {
  const { slug } = await params;
  const { message: highlightId } = await searchParams;
  const me = await requireProfile();
  const supabase = await createClient();

  // RLS only returns channels this role may access.
  const { data: channels } = await supabase.from("channels").select("id, name, slug, description").order("created_at");
  const channel = channels?.find((c) => c.slug === slug);
  if (!channel) notFound();

  // Newest 30 top-level messages (cursor-paginated) plus all replies to them.
  const [{ data: tops, error }, { data: people }] = await Promise.all([
    supabase
      .from("messages")
      .select("*, message_attachments(*)")
      .eq("channel_id", channel.id)
      .is("parent_id", null)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(PAGE + 1),
    supabase.from("profiles").select("id, name, role, team, avatar_url, email, active").eq("active", true),
  ]);
  const { page: topPage, hasMore } = takePage(tops ?? []);
  const { data: replies } = topPage.length
    ? await supabase.from("messages").select("*, message_attachments(*)").in("parent_id", topPage.map((m) => m.id)).order("created_at")
    : { data: [] };

  const rows = [...topPage, ...(replies ?? [])].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  const urls = await signPaths(rows.flatMap((m) => (m.message_attachments ?? []).map((a: { path: string }) => a.path)));
  const messages: ChatMessage[] = rows.map((m) => {
    const { message_attachments, ...rest } = m;
    return { ...rest, attachments: (message_attachments ?? []).map((a: { path: string }) => ({ ...a, url: urls[a.path] })) };
  });
  const oldestTop = topPage[topPage.length - 1];

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-semibold"># {channel.name}</h1>
        {channels && channels.length > 1 && (
          <nav aria-label="Channels" className="ml-auto flex gap-1.5">
            {channels.map((c) => (
              <Link key={c.id} href={`/channels/${c.slug}`} className={cn("rounded-full border px-3 py-1 text-xs", c.slug === slug ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted")}>
                {c.name}
              </Link>
            ))}
          </nav>
        )}
      </div>
      {channel.description && <p className="-mt-2 text-sm text-muted-foreground">{channel.description}</p>}
      {error ? (
        <p role="alert" className="text-sm text-destructive">Couldn’t load messages: {error.message}</p>
      ) : (
        <ChannelChat channelId={channel.id} me={me} people={(people ?? []) as Profile[]} initial={messages} highlightId={highlightId} hasEarlier={hasMore} earlierCursor={oldestTop ? cursorOf(oldestTop) : null} />
      )}
    </div>
  );
}
