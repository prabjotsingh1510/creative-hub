"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { MessageSquareReply, Paperclip, Pin, PinOff, Send, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { markChannelRead, postMessage, setMessagePinned } from "@/actions/channels";
import { loadEarlierMessages } from "@/actions/pagination";
import type { Cursor } from "@/lib/cursor";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { uploadAttachment } from "@/lib/upload";
import { validateAttachment } from "@/lib/validators";
import { formatIST } from "@/lib/time";
import { ROLE_LABEL, type Profile } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Att {
  id: string;
  path: string;
  mime: string;
  name: string;
  url?: string;
}
export interface ChatMessage {
  id: string;
  channel_id: string;
  author_id: string;
  body: string;
  pinned: boolean;
  parent_id: string | null;
  created_at: string;
  attachments: Att[];
}

export function ChannelChat({
  channelId,
  me,
  people,
  initial,
  highlightId,
  hasEarlier = false,
  earlierCursor = null,
}: {
  channelId: string;
  me: Profile;
  people: Profile[];
  initial: ChatMessage[];
  highlightId?: string;
  hasEarlier?: boolean;
  earlierCursor?: Cursor | null;
}) {
  const [messages, setMessages] = useState(initial);
  const [more, setMore] = useState({ has: hasEarlier, cursor: earlierCursor, loading: false });
  async function loadEarlier() {
    if (!more.cursor || more.loading) return;
    setMore((m) => ({ ...m, loading: true }));
    const res = await loadEarlierMessages(channelId, more.cursor);
    if (!res.ok) {
      toast.error(res.error);
      setMore((m) => ({ ...m, loading: false }));
      return;
    }
    setMessages((prev) => [...res.rows.filter((r) => !prev.some((p) => p.id === r.id)), ...prev]);
    setMore({ has: res.hasMore, cursor: res.next, loading: false });
  }
  const byId = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);
  const target = highlightId ? initial.find((m) => m.id === highlightId) : undefined;
  const [open, setOpen] = useState<Set<string>>(new Set(target?.parent_id ? [target.parent_id] : []));
  const [flash, setFlash] = useState<string | null>(highlightId ?? null);
  const endRef = useRef<HTMLDivElement>(null);
  const readTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => setMessages((prev) => [...prev.filter((p) => !initial.some((i) => i.id === p.id) && p.created_at < (initial[0]?.created_at ?? "~")), ...initial]), [initial]);

  const markRead = useCallback(() => {
    if (readTimer.current) clearTimeout(readTimer.current);
    readTimer.current = setTimeout(() => void markChannelRead(channelId), 500);
  }, [channelId]);
  useEffect(() => {
    markRead();
    return () => {
      if (readTimer.current) clearTimeout(readTimer.current);
    };
  }, [markRead]);

  // Realtime: new messages and pin changes; attachments arrive just after, so refetch the row.
  useEffect(() => {
    const supabase = createClient();
    const refetch = async (id: string) => {
      const { data } = await supabase.from("messages").select("*, message_attachments(*)").eq("id", id).single();
      if (!data) return;
      const { message_attachments, ...row } = data;
      const atts = (message_attachments ?? []) as Att[];
      const signed = atts.length ? (await supabase.storage.from("creatives").createSignedUrls(atts.map((a) => a.path), 3600)).data : [];
      const attachments = atts.map((a) => ({ ...a, url: signed?.find((s) => s.path === a.path)?.signedUrl ?? undefined }));
      setMessages((prev) => {
        const next = { ...row, attachments } as ChatMessage;
        return prev.some((m) => m.id === id) ? prev.map((m) => (m.id === id ? next : m)) : [...prev, next];
      });
      if (row.author_id !== me.id) markRead();
    };
    const ch = supabase
      .channel(`channel:${channelId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages", filter: `channel_id=eq.${channelId}` }, (p) => {
        const row = p.new as { id?: string };
        if (row?.id) setTimeout(() => void refetch(row.id!), p.eventType === "INSERT" ? 700 : 0);
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [channelId, me.id, markRead]);

  const top = messages.filter((m) => !m.parent_id);
  const replies = useMemo(() => {
    const map = new Map<string, ChatMessage[]>();
    messages.filter((m) => m.parent_id).forEach((m) => map.set(m.parent_id!, [...(map.get(m.parent_id!) ?? []), m]));
    return map;
  }, [messages]);
  const pinned = top.filter((m) => m.pinned);

  useEffect(() => {
    if (flash) {
      const el = document.getElementById(`message-${flash}`);
      if (el) {
        el.scrollIntoView({ block: "center", behavior: "smooth" });
        const t = setTimeout(() => setFlash(null), 3000);
        return () => clearTimeout(t);
      }
    }
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages.length, flash]);

  async function togglePin(m: ChatMessage) {
    setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, pinned: !m.pinned } : x)));
    const res = await setMessagePinned(m.id, !m.pinned);
    if (!res.ok) {
      toast.error(res.error);
      setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, pinned: m.pinned } : x)));
    }
  }

  const renderMessage = (m: ChatMessage, isReply = false) => {
    const author = byId.get(m.author_id);
    const mine = m.author_id === me.id;
    return (
      <div id={`message-${m.id}`} className={cn("scroll-mt-24 rounded-lg px-1 py-1 transition-colors", flash === m.id && "bg-amber-500/20")}>
        <div className="flex flex-wrap items-baseline gap-x-2 text-xs text-muted-foreground">
          <b className="text-sm text-foreground">{author?.name ?? "Unknown"}</b>
          {author && <span>{ROLE_LABEL[author.role]}</span>}
          <span>{formatIST(m.created_at, "d MMM, h:mm a")}</span>
          {m.pinned && <span className="inline-flex items-center gap-0.5"><Pin className="size-3" aria-hidden /> Pinned</span>}
        </div>
        <p className={cn("whitespace-pre-wrap break-words text-sm", mine && "font-medium")}>{renderBody(m.body, people)}</p>
        {m.attachments.length > 0 && (
          <ul className="mt-1 space-y-1">
            {m.attachments.map((a) => (
              <li key={a.id}>
                {a.mime.startsWith("image/") && a.url ? (
                  <a href={a.url} target="_blank" rel="noopener noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={a.url} alt={a.name} className="max-h-48 rounded-lg" />
                  </a>
                ) : (
                  <a href={a.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm underline">
                    <Paperclip className="size-3" aria-hidden /> {a.name}
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
        {!isReply && (
          <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
            <button
              type="button"
              className="inline-flex items-center gap-1 hover:text-foreground"
              aria-expanded={open.has(m.id)}
              onClick={() => setOpen((s) => { const n = new Set(s); if (n.has(m.id)) n.delete(m.id); else n.add(m.id); return n; })}
            >
              <MessageSquareReply className="size-3" aria-hidden />
              {replies.get(m.id)?.length ? `${replies.get(m.id)!.length} repl${replies.get(m.id)!.length === 1 ? "y" : "ies"}` : "Reply"}
            </button>
            {me.role === "admin" && (
              <button type="button" onClick={() => togglePin(m)} className="inline-flex items-center gap-1 hover:text-foreground" aria-label={m.pinned ? "Unpin message" : "Pin message"}>
                {m.pinned ? <PinOff className="size-3" /> : <Pin className="size-3" />} {m.pinned ? "Unpin" : "Pin"}
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <section aria-label="Messages" className="flex flex-col rounded-xl border bg-card">
      {pinned.length > 0 && (
        <div className="space-y-1 border-b bg-amber-500/10 px-4 py-2 text-sm">
          {pinned.map((m) => (
            <p key={m.id} className="flex gap-2">
              <Pin className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              <span className="line-clamp-2"><b>{byId.get(m.author_id)?.name}:</b> {m.body}</span>
            </p>
          ))}
        </div>
      )}
      <ol className="max-h-[60vh] space-y-4 overflow-y-auto p-4" aria-live="polite">
        {more.has && (
          <li className="text-center">
            <Button type="button" variant="outline" disabled={more.loading} onClick={() => void loadEarlier()}>
              {more.loading ? "Loading…" : "Load earlier messages"}
            </Button>
          </li>
        )}
        {top.length === 0 && <li className="py-8 text-center text-sm text-muted-foreground">No messages yet. Say hello 👋</li>}
        {top.map((m) => (
          <li key={m.id}>
            {renderMessage(m)}
            {open.has(m.id) && (
              <div className="ml-4 mt-2 space-y-3 border-l pl-4">
                {(replies.get(m.id) ?? []).map((r) => (
                  <div key={r.id}>{renderMessage(r, true)}</div>
                ))}
                <Composer channelId={channelId} parentId={m.id} me={me} people={people} compact />
              </div>
            )}
          </li>
        ))}
        <div ref={endRef} />
      </ol>
      <div className="border-t p-3">
        <Composer channelId={channelId} parentId={null} me={me} people={people} />
      </div>
    </section>
  );
}

function Composer({
  channelId,
  parentId,
  me,
  people,
  compact,
}: {
  channelId: string;
  parentId: string | null;
  me: Profile;
  people: Profile[];
  compact?: boolean;
}) {
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [mentions, setMentions] = useState<Record<string, string>>({});
  const [query, setQuery] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const suggestions =
    query === null ? [] : people.filter((p) => p.id !== me.id && p.name.toLowerCase().includes(query.toLowerCase())).slice(0, 5);

  function onChange(v: string) {
    setBody(v);
    const m = /(?:^|\s)@([\w ]{0,30})$/.exec(v);
    setQuery(m ? m[1] : null);
  }

  async function send() {
    if (!body.trim() || sending) return;
    setSending(true);
    try {
      const attachments = [];
      for (const f of files) {
        const path = await uploadAttachment(`channels/${channelId}`, f);
        attachments.push({ path, mime: f.type, size: f.size, name: f.name });
      }
      const ids = Object.entries(mentions).filter(([, n]) => body.includes(`@${n}`)).map(([id]) => id);
      const res = await postMessage({ channelId, body: body.trim(), parentId, mentionIds: ids, attachments });
      if (!res.ok) throw new Error(res.error);
      setBody("");
      setFiles([]);
      setMentions({});
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn’t send");
    } finally {
      setSending(false);
    }
  }

  return (
    <form
      className="relative space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        void send();
      }}
    >
      {suggestions.length > 0 && (
        <ul role="listbox" aria-label="Mention someone" className="absolute bottom-full left-0 z-10 mb-1 w-64 overflow-hidden rounded-lg border bg-popover shadow-md">
          {suggestions.map((p) => (
            <li key={p.id} role="option" aria-selected="false">
              <button
                type="button"
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted"
                onClick={() => {
                  setBody((b) => b.replace(/@([\w ]{0,30})$/, `@${p.name} `));
                  setMentions((m) => ({ ...m, [p.id]: p.name }));
                  setQuery(null);
                }}
              >
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
        aria-label={parentId ? "Write a reply" : "Write a message"}
        placeholder={parentId ? "Reply…" : "Message the team… use @ to mention"}
        rows={compact ? 1 : 2}
        value={body}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            void send();
          }
        }}
      />
      <div className="flex items-center gap-2">
        <input
          ref={fileInput}
          type="file"
          hidden
          multiple
          accept="image/*,application/pdf"
          onChange={(e) => {
            const picked = Array.from(e.target.files ?? []);
            e.target.value = "";
            for (const f of picked) {
              const bad = validateAttachment(f);
              if (bad) return toast.error(`${f.name}: ${bad}`);
            }
            setFiles((p) => [...p, ...picked].slice(0, 5));
          }}
        />
        <Button type="button" variant="ghost" size="icon" aria-label="Attach file" onClick={() => fileInput.current?.click()}>
          <Paperclip className="size-4" />
        </Button>
        <Button type="submit" className="ml-auto" size={compact ? "default" : "lg"} disabled={sending || !body.trim()}>
          <Send /> {sending ? "Sending…" : parentId ? "Reply" : "Send"}
        </Button>
      </div>
    </form>
  );
}

function renderBody(text: string, people: Profile[]) {
  const names = people.map((p) => p.name).filter(Boolean).sort((a, b) => b.length - a.length);
  if (!names.length) return text;
  const re = new RegExp(`(@(?:${names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")}))`, "g");
  return text.split(re).map((part, i) => (i % 2 === 1 ? <b key={i} className="underline decoration-dotted">{part}</b> : part));
}
