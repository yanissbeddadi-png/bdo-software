"use client";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div role="alert" className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
      <h1 className="text-xl font-semibold">Une erreur est survenue</h1>
      <p className="max-w-md text-sm text-muted">L&apos;affichage de cette page a échoué. Vos données n&apos;ont pas été modifiées.</p>
      <p className="max-w-md text-xs text-subtle">{error.message}</p>
      <button type="button" onClick={reset} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-bg">
        Réessayer
      </button>
    </div>
  );
}
