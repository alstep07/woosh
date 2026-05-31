import { getUserBySlug } from "@/lib/store";
import PaymentForm from "./PaymentForm";

interface Props {
  params: { slug: string };
}

export default function PayPage({ params }: Props) {
  const user = getUserBySlug(params.slug);

  if (!user) {
    return (
      <main className="min-h-screen bg-navy flex items-center justify-center px-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-text-primary mb-2">
            This payment link doesn&apos;t exist
          </h1>
          <p className="text-text-secondary text-sm">
            Check the link and try again.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-navy flex flex-col items-center justify-center px-6 py-12">
      <PaymentForm
        recipientAddress={user.walletAddress as `0x${string}`}
        recipientLabel={user.slug}
      />
    </main>
  );
}
