export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <p className="text-lg font-semibold tracking-tight">HR Platform</p>
          <p className="mt-1 text-sm text-[--color-muted]">Core HR and employee directory</p>
        </div>
        {children}
      </div>
    </main>
  );
}
