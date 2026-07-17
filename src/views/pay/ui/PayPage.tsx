import BrandHeader from "@/widgets/BrandHeader/ui/BrandHeader";
import PaymentForm from "@/widgets/PaymentForm/ui/PaymentForm";
import Footer from "@/widgets/Footer/ui/Footer";

interface Props {
  slug: string;
  address: `0x${string}` | null;
  initialAmount?: string;
  requestId?: `0x${string}`;
  memo?: string;
  alreadyPaid?: boolean;
  recipientSlug?: string;
  /** resolveSlug's RPC read itself failed (not "this slug isn't registered"). */
  resolveError?: boolean;
}

export function PayPage({ slug, address, initialAmount, requestId, memo, alreadyPaid, recipientSlug, resolveError }: Props) {
  if (!address) {
    return (
      <main className="min-h-screen bg-navy flex flex-col">
        <BrandHeader />
        <div className="flex-1 flex items-center justify-center px-6">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-text-primary mb-2">
              {resolveError ? "Couldn't load this link" : "Invalid payment link"}
            </h1>
            <p className="text-text-secondary text-sm">
              {resolveError
                ? "There was a network problem checking this link. Try again in a moment."
                : "Check the link and try again."}
            </p>
          </div>
        </div>
        <Footer />
      </main>
    );
  }

  // For an invoice, the label is derived from the contract payee (recipientSlug),
  // NEVER from the URL slug — so a tampered link can't misrepresent the recipient.
  const shortAddr = `${address.slice(0, 6)}…${address.slice(-4)}`;
  const recipientLabel = requestId
    ? (recipientSlug ?? shortAddr)
    : (/^0x[0-9a-fA-F]{40}$/.test(slug) ? shortAddr : slug);

  if (alreadyPaid) {
    return (
      <main className="min-h-screen bg-navy flex flex-col">
        <BrandHeader />
        <div className="flex-1 flex items-center justify-center px-6">
          <div className="w-full max-w-md glass-card rounded-card p-8 text-center">
            <div className="w-12 h-12 rounded-full bg-green-400/10 flex items-center justify-center mx-auto mb-4 text-2xl">
              ✓
            </div>
            <h1 className="text-xl font-bold text-text-primary mb-2">Already paid</h1>
            <p className="text-text-secondary text-sm">
              This invoice{memo ? ` (${memo})` : ""} has already been settled.
            </p>
          </div>
        </div>
        <Footer />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-navy flex flex-col">
      <BrandHeader />
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <PaymentForm
          recipientAddress={address}
          recipientLabel={recipientLabel}
          initialAmount={initialAmount}
          requestId={requestId}
          memo={memo}
        />
      </div>
      <Footer />
    </main>
  );
}
