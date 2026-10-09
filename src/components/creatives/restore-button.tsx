"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Undo2 } from "lucide-react";
import { setDeleted } from "@/actions/creatives";
import { Button } from "@/components/ui/button";

export function RestoreButton({ id, title }: { id: string; title: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      variant="outline"
      className="w-full"
      disabled={pending}
      aria-label={`Restore ${title}`}
      onClick={() =>
        start(async () => {
          const res = await setDeleted(id, false);
          if (!res.ok) {
            toast.error(res.error);
            return;
          }
          toast.success("Restored");
          router.refresh();
        })
      }
    >
      <Undo2 /> {pending ? "Restoring…" : "Restore"}
    </Button>
  );
}
