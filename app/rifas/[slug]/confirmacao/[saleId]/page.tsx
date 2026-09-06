import { Suspense } from "react";
import { ConfirmationClient } from "./confirmation-client";

export default function ConfirmationPage({
  params,
}: {
  params: Promise<{ slug: string; saleId: string }>;
}) {
  return (
    <Suspense fallback={null}>
      <ConfirmationClient params={params} />
    </Suspense>
  );
}
