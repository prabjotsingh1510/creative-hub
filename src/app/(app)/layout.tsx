import { AppNav } from "@/components/layout/app-nav";
import { requireProfile } from "@/lib/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile();
  return (
    <div className="min-h-dvh pb-16 md:pb-0">
      <AppNav name={profile.name} role={profile.role} />
      <main className="mx-auto w-full max-w-7xl p-4 md:p-6">{children}</main>
    </div>
  );
}
