// The event route can fetch many assets. Show its shape immediately while
// data and private preview URLs are prepared on the server.
export default function EventDetailLoading() {
  return (
    <main
      role="status"
      aria-busy="true"
      aria-label="Ereignis wird geladen / Loading event"
      className="space-y-8"
    >
      <section className="rounded-[32px] border border-white/10 bg-white/5 p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-3 w-24 rounded-full bg-white/15" />
          <div className="h-9 max-w-sm rounded-xl bg-white/12" />
          <div className="h-4 max-w-md rounded-full bg-white/10" />
        </div>
      </section>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-[28px] border border-white/10 bg-white/5 p-4">
          <div className="aspect-[4/3] animate-pulse rounded-[22px] bg-white/10" />
          <div className="mt-3 h-4 w-40 animate-pulse rounded-full bg-white/10" />
        </div>
        <div className="space-y-4 rounded-[28px] border border-white/10 bg-white/5 p-5">
          <div className="h-6 w-36 animate-pulse rounded-lg bg-white/12" />
          <div className="h-16 animate-pulse rounded-2xl bg-white/8" />
          <div className="h-16 animate-pulse rounded-2xl bg-white/8" />
          <div className="h-16 animate-pulse rounded-2xl bg-white/8" />
        </div>
      </div>
    </main>
  );
}
