export function Footer() {
  return (
    <footer className="border-t border-black/[0.06] py-8">
      <div className="mx-auto max-w-6xl px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <div className="size-5 rounded-md border border-black/[0.08] flex items-center justify-center">
            <div className="size-2 rounded-sm bg-[#1a1a1a]" />
          </div>
          <span className="text-sm font-medium text-[#2a2a2a]">Omni Cal</span>
        </div>
        <p className="text-[11px] text-[#9c9e9b]">
          &copy; {new Date().getFullYear()} Omni Cal. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
