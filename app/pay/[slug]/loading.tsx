import BrandHeader from "@/widgets/BrandHeader/ui/BrandHeader";
import Footer from "@/widgets/Footer/ui/Footer";

// Instant skeleton while the server reads the invoice / resolves the slug from chain.
export default function Loading() {
  return (
    <main className="min-h-screen bg-navy flex flex-col">
      <BrandHeader />
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          <div className="flex flex-col items-center gap-2 mb-8">
            <div className="h-4 w-28 bg-border rounded animate-pulse" />
            <div className="h-5 w-40 bg-border rounded animate-pulse" />
          </div>
          <div className="glass-card rounded-card p-6 space-y-5">
            <div className="h-4 w-24 bg-border rounded animate-pulse" />
            <div className="h-12 w-full bg-border rounded-input animate-pulse" />
            <div className="h-11 w-full bg-border rounded-input animate-pulse" />
          </div>
        </div>
      </div>
      <Footer />
    </main>
  );
}
