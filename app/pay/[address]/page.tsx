import BrandHeader from "@/components/BrandHeader";
import PaymentForm from "./PaymentForm";

interface Props {
  params: { address: string };
}

export default function PayPage({ params }: Props) {
  const address = params.address as `0x${string}`;

  if (!address.startsWith("0x") || address.length !== 42) {
    return (
      <main className="min-h-screen bg-navy flex items-center justify-center px-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-text-primary mb-2">
            Invalid payment link
          </h1>
          <p className="text-text-secondary text-sm">
            Check the link and try again.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-navy flex flex-col">
      <BrandHeader />
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <PaymentForm
          recipientAddress={address}
          recipientLabel={`${address.slice(0, 6)}…${address.slice(-4)}`}
        />
      </div>
    </main>
  );
}
