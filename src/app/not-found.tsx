import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
      <p className="text-sm text-muted">Erreur 404</p>
      <h1 className="text-2xl font-semibold">Page introuvable</h1>
      <p className="max-w-md text-sm text-muted">Cette page n&apos;existe pas ou a été déplacée.</p>
      <Link href="/" className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-on-accent">
        Retour au Command Center
      </Link>
    </div>
  );
}
