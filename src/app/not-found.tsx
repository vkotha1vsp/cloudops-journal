import Link from "next/link";

export default function NotFound() {
  return (
    <div className="grid min-h-[60vh] place-items-center text-center">
      <div>
        <p className="text-5xl font-semibold text-muted-foreground">404</p>
        <p className="mt-2 text-sm text-muted-foreground">That page does not exist or is not yours.</p>
        <Link href="/dashboard" className="mt-4 inline-block text-sm text-primary underline">Back to dashboard</Link>
      </div>
    </div>
  );
}
