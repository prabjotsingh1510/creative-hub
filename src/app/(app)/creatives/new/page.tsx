import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/session";
import { canCreateRequest } from "@/lib/permissions";
import { RequestForm } from "@/components/creatives/request-form";

export const metadata = { title: "New request" };

export default async function NewRequestPage() {
  const profile = await requireProfile();
  if (!canCreateRequest(profile.role)) redirect("/creatives");
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <h1 className="text-xl font-semibold">New creative request</h1>
      <RequestForm />
    </div>
  );
}
