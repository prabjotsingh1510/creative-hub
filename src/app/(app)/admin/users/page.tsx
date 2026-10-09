import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/session";
import { canManageUsers } from "@/lib/permissions";
import { UserAdmin } from "@/components/admin/user-admin";
import type { Profile } from "@/lib/types";

export const metadata = { title: "Users" };

export default async function UsersPage() {
  const me = await requireProfile();
  if (!canManageUsers(me.role)) redirect("/creatives");
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("*").order("created_at");
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-xl font-semibold">Users</h1>
      <UserAdmin users={(data ?? []) as Profile[]} meId={me.id} />
    </div>
  );
}
