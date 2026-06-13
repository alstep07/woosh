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
}

export function PayPage({ slug, address, initialAmount, requestId, memo, alreadyPaid }: Props) {
  if (!address) {
    return (
      <main className="min-h-screen bg-navy flex flex-col">
        <BrandHeader />
        <div className="flex-1 flex items-center justify-center px-6">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-text-primary mb-2">
              Invalid payment link
            </h1>
            <p className="text-text-secondary text-sm">
              Check the link and try again.
            </p>
          </div>
        </div>
        <Footer />
      </main>
    );
  }

  // Use slug as label if it's not a raw address, otherwise truncate the address
  const isRawAddress = /^0x[0-9a-fA-F]{40}$/.test(slug);
  const recipientLabel = isRawAddress
    ? `${address.slice(0, 6)}…${address.slice(-4)}`
    : slug;

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
              This request{memo ? ` (${memo})` : ""} has already been settled.
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
