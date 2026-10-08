import { Suspense } from "react";
import Dictionary from "@/components/Dictionary";
export default function Page() {
  return (
    <Suspense>
      <Dictionary />
    </Suspense>
  );
}
