import { AppSidebar } from "@/components/app/sidebar";

export const metadata = {
  title: "Omni Cal — App",
};

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-bg min-h-screen text-app-primary">
      <AppSidebar />
      <main className="ml-[240px] min-h-screen app-scrollbar overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
