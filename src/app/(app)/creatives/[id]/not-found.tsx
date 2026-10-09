import Link from "next/link";

export default function NotFound() {
  return (
    <div className="py-20 text-center">
      <h1 className="text-lg font-semibold">Creative not found</h1>
      <p className="mt-1 text-sm text-muted-foreground">It may have been deleted, or you may not have access.</p>
      <Link href="/creatives" className="mt-4 inline-block text-sm underline">Back to creatives</Link>
    </div>
  );
}
