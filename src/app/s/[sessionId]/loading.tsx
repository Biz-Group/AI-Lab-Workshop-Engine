export default function SessionLoading() {
  return (
    <div className="min-h-screen flex">
      {/* Sidebar skeleton */}
      <aside className="hidden lg:flex w-80 glass-strong border-r border-white/20 p-5 flex-col">
        <div className="space-y-4">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-8 h-8 bg-white/40 rounded animate-pulse" />
            <div className="h-4 w-36 bg-white/30 rounded animate-pulse" />
          </div>
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="w-6 h-6 bg-white/30 rounded-full animate-pulse" />
              <div className="h-3 flex-1 bg-white/20 rounded animate-pulse" />
            </div>
          ))}
        </div>
      </aside>

      {/* Main content skeleton */}
      <main className="flex-1 flex flex-col">
        <header className="glass-strong border-b border-white/20 px-6 py-4">
          <div className="h-7 w-64 bg-white/30 rounded animate-pulse" />
          <div className="h-4 w-40 bg-white/20 rounded animate-pulse mt-2" />
        </header>
        <div className="flex-1 p-6">
          <div className="max-w-3xl mx-auto space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="glass rounded-xl border border-white/20 p-6 space-y-3">
                <div className="h-4 w-48 bg-white/30 rounded animate-pulse" />
                <div className="h-3 w-full bg-white/20 rounded animate-pulse" />
                <div className="h-3 w-5/6 bg-white/20 rounded animate-pulse" />
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
