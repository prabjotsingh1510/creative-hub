"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { inviteSchema } from "@/lib/validators";
import type { Result } from "./creatives";

async function assertAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("profiles").select("role, active").eq("id", user.id).single();
  return data?.role === "admin" && data.active ? { supabase, userId: user.id } : null;
}

export async function inviteUser(input: z.input<typeof inviteSchema>): Promise<Result> {
  const parsed = inviteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  if (!(await assertAdmin())) return { ok: false, error: "Admins only" };
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const { email, name, role, team } = parsed.data;
  const { error } = await createAdminClient().auth.admin.inviteUserByEmail(email, {
    data: { name, role, team },
    redirectTo: `${site}/set-password`,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/users");
  return { ok: true };
}

export async function updateUser(
  id: string,
  patch: { role?: "admin" | "creative" | "ads"; active?: boolean; name?: string; team?: string | null },
): Promise<Result> {
  const admin = await assertAdmin();
  if (!admin) return { ok: false, error: "Admins only" };
  if (id === admin.userId && (patch.role !== undefined || patch.active === false)) {
    return { ok: false, error: "You can't change your own role or deactivate yourself." };
  }
  const { error } = await admin.supabase.from("profiles").update(patch).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/users");
  return { ok: true };
}
