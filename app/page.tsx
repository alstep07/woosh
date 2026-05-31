import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-navy text-text-primary">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-5 max-w-5xl mx-auto">
        <span className="text-xl font-bold tracking-tight">woosh</span>
        <Link
          href="/signup"
          className="text-sm text-text-secondary hover:text-text-primary transition-colors"
        >
          Sign up
        </Link>
      </nav>

      {/* Hero */}
      <section className="flex flex-col items-center text-center px-6 pt-16 pb-24 max-w-2xl mx-auto">
        <h1 className="text-4xl sm:text-5xl font-bold leading-tight mb-4 text-balance">
          Send a link.{" "}
          <span className="text-blue-primary block">Get paid in seconds.</span>
        </h1>
        <p className="text-lg text-text-secondary mb-10 text-balance">
          Share your personal payment link with any client. They pay, you
          receive — no bank account required.
        </p>
        <Link
          href="/signup"
          className="inline-block bg-blue-primary hover:bg-blue-secondary text-white font-semibold px-8 py-4 rounded-input text-base transition-colors shadow-glow min-w-[200px] min-h-[44px] flex items-center justify-center"
        >
          Get your payment link
        </Link>
      </section>

      {/* How it works */}
      <section className="px-6 pb-24 max-w-4xl mx-auto">
        <h2 className="text-2xl font-semibold text-center mb-12">
          How it works
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="bg-card border border-border rounded-card p-6">
            <p className="text-xs font-semibold text-blue-primary uppercase tracking-widest mb-4">
              To receive
            </p>
            <ol className="space-y-4">
              {[
                "Sign up with your email",
                "Get your personal payment link",
                "Share it with your clients",
              ].map((step, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-primary/10 text-blue-primary text-sm font-bold flex items-center justify-center">
                    {i + 1}
                  </span>
                  <span className="text-text-secondary text-sm">{step}</span>
                </li>
              ))}
            </ol>
          </div>

          <div className="bg-card border border-border rounded-card p-6">
            <p className="text-xs font-semibold text-blue-secondary uppercase tracking-widest mb-4">
              To send
            </p>
            <ol className="space-y-4">
              {[
                "Open the payment link",
                "Enter the amount",
                "Pay from your digital wallet",
              ].map((step, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-secondary/10 text-blue-secondary text-sm font-bold flex items-center justify-center">
                    {i + 1}
                  </span>
                  <span className="text-text-secondary text-sm">{step}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border px-6 py-8 text-center text-text-secondary text-sm">
        © {new Date().getFullYear()} Woosh. Payments without borders.
      </footer>
    </main>
  );
}
