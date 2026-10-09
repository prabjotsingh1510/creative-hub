"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Paperclip, Pin, PinOff, Send, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { addComment, setPinned } from "@/actions/comments";
import { loadEarlierComments } from "@/actions/pagination";
import type { Cursor } from "@/lib/cursor";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { uploadAttachment } from "@/lib/upload";
import { validateAttachment } from "@/lib/validators";
import { formatIST } from "@/lib/time";
import { ROLE_LABEL, type CommentAttachment, type CommentRow, type Profile } from "@/lib/types";
import { cn } from "@/lib/utils";

type Att = CommentAttachment & { url?: string };
export type ThreadComment = CommentRow & { attachments: Att[] };

export function CommentThread({
  creativeId,
  me,
  people,
  versions,
  initial,
  highlightId,
  hasEarlier = false,
  earlierCursor = null,
}: {
  creativeId: string;
  me: Profile;
  people: Profile[];
  versions: { id: string; version_no: number }[];
  initial: ThreadComment[];
  highlightId?: string;
  hasEarlier?: boolean;
  earlierCursor?: Cursor | null;
}) {
  const [comments, setComments] = useState<ThreadComment[]>(initial);
  const [more, setMore] = useState({ has: hasEarlier, cursor: earlierCursor, loading: false });
  const loadEarlier = async () => {
    if (!more.cursor || more.loading) return;
    setMore((m) => ({ ...m, loading: true }));
    const res = await loadEarlierComments(creativeId, more.cursor);
    if (!res.ok) {
      toast.error(res.error);
      setMore((m) => ({ ...m, loading: false }));
      return;
    }
    setComments((prev) => [...res.rows, ...prev.filter((p) => !res.rows.some((r) => r.id === p.id))]);
    setMore({ has: res.hasMore, cursor: res.next, loading: false });
  };
  const [body, setBody] = useState("");
  const [versionId, setVersionId] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [mentionIds, setMentionIds] = useState<Record<string, string>>({}); // id -> name
  const [query, setQuery] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const byId = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);
  const versionNo = useMemo(() => new Map(versions.map((v) => [v.id, v.version_no])), [versions]);

  // Keep in sync with server-rendered data after router.refresh().
  // After router.refresh() keep any older pages already loaded; replace the newest page.
  useEffect(() => setComments((prev) => [...prev.filter((p) => !initial.some((i) => i.id === p.id) && p.created_at < (initial[0]?.created_at ?? "~")), ...initial]), [initial]);

  // Realtime: new comments / pin changes. Attachments arrive via refetch.
  useEffect(() => {
    const supabase = createClient();
    const refetch = async (id: string) => {
      const { data } = await supabase
        .from("comments")
        .select("*, comment_attachments(*)")
        .eq("id", id)
        .single();
      if (!data) return;
      const { comment_attachments, ...row } = data as CommentRow & { comment_attachments: CommentAttachment[] };
      const paths = comment_attachments.map((a) => a.path);
      const signed = paths.length ? (await supabase.storage.from("creatives").createSignedUrls(paths, 3600)).data : [];
      const attachments = comment_attachments.map((a) => ({ ...a, url: signed?.find((s) => s.path === a.path)?.signedUrl ?? undefined }));
      setComments((prev) => {
        const next = { ...row, attachments };
        const i = prev.findIndex((c) => c.id === row.id);
        return i === -1 ? [...prev, next] : prev.map((c) => (c.id === row.id ? next : c));
      });
    };
    const channel = supabase
      .channel(`comments:${creativeId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "comments", filter: `creative_id=eq.${creativeId}` },
        (payload) => {
          const row = payload.new as CommentRow;
          if (row?.id) setTimeout(() => refetch(row.id), payload.eventType === "INSERT" ? 600 : 0);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [creativeId]);

  // Deep link (?comment=<id>): scroll to and briefly highlight that comment; otherwise follow the newest.
  const [flash, setFlash] = useState<string | null>(highlightId ?? null);
  useEffect(() => {
    if (flash) {
      const el = document.getElementById(`comment-${flash}`);
      if (el) {
        el.scrollIntoView({ block: "center", behavior: "smooth" });
        const t = setTimeout(() => setFlash(null), 3000);
        return () => clearTimeout(t);
      }
    }
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [comments.length, flash]);

  const pinned = comments.filter((c) => c.pinned);
  const suggestions =
    query === null
      ? []
      : people.filter((p) => p.id !== me.id && p.name.toLowerCase().includes(query.toLowerCase())).slice(0, 5);

  function onChange(v: string) {
    setBody(v);
    const m = /(?:^|\s)@([\w ]{0,30})$/.exec(v);
    setQuery(m ? m[1] : null);
  }

  function pickMention(p: Profile) {
    setBody((b) => b.replace(/@([\w ]{0,30})$/, `@${p.name} `));
    setMentionIds((m) => ({ ...m, [p.id]: p.name }));
    setQuery(null);
  }

  function onFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = "";
    for (const f of picked) {
      const bad = validateAttachment(f);
      if (bad) return toast.error(`${f.name}: ${bad}`);
    }
    setFiles((prev) => [...prev, ...picked].slice(0, 5));
  }

  async function send() {
    if (!body.trim() || sending) return;
    setSending(true);
    try {
      const attachments = [];
      for (const f of files) {
        const path = await uploadAttachment(`comments/${creativeId}`, f);
        attachments.push({ path, mime: f.type, size: f.size, name: f.name });
      }
      // Only mentions whose @Name is still in the text
      const ids = Object.entries(mentionIds).filter(([, n]) => body.includes(`@${n}`)).map(([id]) => id);
      const res = await addComment({
        creativeId,
        body: body.trim(),
        versionId: versionId || null,
        mentionIds: ids,
        attachments,
      });
      if (!res.ok) throw new Error(res.error);
      setBody("");
      setFiles([]);
      setMentionIds({});
      setVersionId("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn’t send");
    } finally {
      setSending(false);
    }
  }

  async function togglePin(c: ThreadComment) {
    setComments((prev) => prev.map((x) => (x.id === c.id ? { ...x, pinned: !c.pinned } : x))); // optimistic
    const res = await setPinned(c.id, !c.pinned);
    if (!res.ok) {
      toast.error(res.error);
      setComments((prev) => prev.map((x) => (x.id === c.id ? { ...x, pinned: c.pinned } : x)));
    }
  }

  return (
    <section aria-labelledby="discussion-h" className="flex flex-col rounded-xl border bg-card pb-40 lg:pb-0">
      <h2 id="discussion-h" className="border-b px-4 py-3 text-sm font-semibold">Discussion</h2>

      {pinned.length > 0 && (
        <div className="space-y-1 border-b bg-amber-500/10 px-4 py-2 text-sm">
          {pinned.map((c) => (
            <p key={c.id} className="flex gap-2">
              <Pin className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              <span className="line-clamp-2"><b>{byId.get(c.author_id)?.name}:</b> {c.body}</span>
            </p>
          ))}
        </div>
      )}

      <ol className="max-h-[60vh] space-y-4 overflow-y-auto p-4 lg:max-h-[560px]" aria-live="polite">
        {more.has && (
          <li className="text-center">
            <Button type="button" variant="outline" disabled={more.loading} onClick={() => void loadEarlier()}>
              {more.loading ? "Loading…" : "Load earlier messages"}
            </Button>
          </li>
        )}
        {comments.length === 0 && <li className="text-sm text-muted-foreground">No messages yet. Start the conversation.</li>}
        {comments.map((c) => {
          const author = byId.get(c.author_id);
          const mine = c.author_id === me.id;
          return (
            <li id={`comment-${c.id}`} key={c.id} className={cn("flex scroll-mt-24 flex-col rounded-lg transition-colors", mine && "items-end", flash === c.id && "bg-amber-500/20")}>
              <div className={cn("max-w-[90%] rounded-2xl px-3 py-2 text-sm", mine ? "bg-primary text-primary-foreground" : "bg-muted")}>
                <div className="mb-0.5 flex flex-wrap items-center gap-x-2 text-xs opacity-80">
                  <b>{author?.name ?? "Unknown"}</b>
                  {author && <span>{ROLE_LABEL[author.role]}</span>}
                  {c.version_id && <span className="rounded bg-black/10 px-1 dark:bg-white/20">on v{versionNo.get(c.version_id)}</span>}
                </div>
                <p className="whitespace-pre-wrap break-words">{renderBody(c.body, people)}</p>
                {c.attachments.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {c.attachments.map((a) => (
                      <li key={a.id}>
                        {a.mime.startsWith("image/") && a.url ? (
                          <a href={a.url} target="_blank" rel="noopener noreferrer">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={a.url} alt={a.name} className="max-h-48 rounded-lg" />
                          </a>
                        ) : (
                          <a href={a.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline">
                            <Paperclip className="size-3" aria-hidden /> {a.name}
                          </a>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                {formatIST(c.created_at, "d MMM, h:mm a")}
                <button type="button" onClick={() => togglePin(c)} className="inline-flex items-center gap-0.5 hover:text-foreground" aria-label={c.pinned ? "Unpin message" : "Pin message"}>
                  {c.pinned ? <PinOff className="size-3" /> : <Pin className="size-3" />}
                </button>
              </div>
            </li>
          );
        })}
        <div ref={endRef} />
      </ol>

      <form
        className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-20 space-y-2 border-t bg-background p-3 lg:static lg:bottom-auto lg:z-auto"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        {suggestions.length > 0 && (
          <ul role="listbox" aria-label="Mention someone" className="absolute bottom-full left-3 z-10 mb-1 w-64 overflow-hidden rounded-lg border bg-popover shadow-md">
            {suggestions.map((p) => (
              <li key={p.id} role="option" aria-selected="false">
                <button type="button" onClick={() => pickMention(p)} className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted">
                  {p.name}
                  <span className="text-xs text-muted-foreground">{ROLE_LABEL[p.role]}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {files.length > 0 && (
          <ul className="flex flex-wrap gap-1.5">
            {files.map((f, i) => (
              <li key={i} className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs">
                {f.name}
                <button type="button" aria-label={`Remove ${f.name}`} onClick={() => setFiles((p) => p.filter((_, j) => j !== i))}><X className="size-3" /></button>
              </li>
            ))}
          </ul>
        )}
        <Textarea
          id="comment-composer"
          aria-label="Write a message"
          placeholder="Write a message… use @ to mention"
          rows={2}
          value={body}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              send();
            }
          }}
        />
        <div className="flex items-center gap-2">
          <input ref={fileInput} type="file" hidden multiple accept="image/*,application/pdf" onChange={onFiles} />
          <Button type="button" variant="ghost" size="icon" aria-label="Attach file" onClick={() => fileInput.current?.click()}>
            <Paperclip className="size-4" />
          </Button>
          {versions.length > 0 && (
            <select
              aria-label="Reference a version"
              value={versionId}
              onChange={(e) => setVersionId(e.target.value)}
              className="h-8 rounded-lg border border-input bg-background px-2 text-xs"
            >
              <option value="">No version</option>
              {versions.map((v) => (
                <option key={v.id} value={v.id}>Feedback on v{v.version_no}</option>
              ))}
            </select>
          )}
          <Button type="submit" className="ml-auto" size="lg" disabled={sending || !body.trim()}>
            <Send /> {sending ? "Sending…" : "Send"}
          </Button>
        </div>
      </form>
    </section>
  );
}

/** Bold @Name tokens that match known people. */
function renderBody(text: string, people: Profile[]) {
  const names = people.map((p) => p.name).filter(Boolean).sort((a, b) => b.length - a.length);
  if (!names.length) return text;
  const re = new RegExp(`(@(?:${names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")}))`, "g");
  return text.split(re).map((part, i) =>
    i % 2 === 1 ? <b key={i} className="underline decoration-dotted">{part}</b> : part,
  );
}
