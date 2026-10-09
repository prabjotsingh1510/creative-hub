"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { inviteUser, updateUser } from "@/actions/users";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ROLE_LABEL, type Profile, type Role } from "@/lib/types";

const selectCls = "h-9 rounded-lg border border-input bg-background px-2 text-sm";

export function UserAdmin({ users, meId }: { users: Profile[]; meId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [role, setRole] = useState<Role>("creative");

  function invite(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    start(async () => {
      const res = await inviteUser({
        email: String(f.get("email")),
        name: String(f.get("name")),
        team: String(f.get("team") ?? ""),
        role,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Invite sent");
      form.reset();
      router.refresh();
    });
  }

  function patch(id: string, p: Parameters<typeof updateUser>[1]) {
    start(async () => {
      const res = await updateUser(id, p);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Updated");
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <form onSubmit={invite} className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2">
        <h2 className="text-sm font-semibold sm:col-span-2">Invite a user</h2>
        <div className="space-y-1.5"><Label htmlFor="i-name">Name</Label><Input id="i-name" name="name" required /></div>
        <div className="space-y-1.5"><Label htmlFor="i-email">Email</Label><Input id="i-email" name="email" type="email" required /></div>
        <div className="space-y-1.5"><Label htmlFor="i-team">Team (optional)</Label><Input id="i-team" name="team" placeholder="OutOfCtrl, Decision Pinnacle…" /></div>
        <div className="space-y-1.5">
          <Label htmlFor="i-role">Role</Label>
          <select id="i-role" className={`${selectCls} w-full`} value={role} onChange={(e) => setRole(e.target.value as Role)}>
            {(Object.keys(ROLE_LABEL) as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
          </select>
        </div>
        <Button type="submit" size="lg" className="sm:col-span-2" disabled={pending}>Send invite</Button>
      </form>

      <ul className="divide-y rounded-xl border bg-card">
        {users.map((u) => (
          <li key={u.id} className="flex flex-wrap items-center gap-3 p-3">
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{u.name}{!u.active && <span className="ml-2 text-xs text-destructive">deactivated</span>}</div>
              <div className="truncate text-xs text-muted-foreground">{u.email}{u.team ? ` · ${u.team}` : ""}</div>
            </div>
            <select
              aria-label={`Role for ${u.name}`}
              className={selectCls}
              value={u.role}
              disabled={u.id === meId || pending}
              onChange={(e) => patch(u.id, { role: e.target.value as Role })}
            >
              {(Object.keys(ROLE_LABEL) as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
            </select>
            <Button variant="outline" disabled={u.id === meId || pending} onClick={() => patch(u.id, { active: !u.active })}>
              {u.active ? "Deactivate" : "Reactivate"}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
