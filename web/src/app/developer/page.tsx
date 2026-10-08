import { Suspense } from "react";
import Developer from "@/components/Developer";
export default function Page() {
  return (
    <Suspense>
      <Developer />
    </Suspense>
  );
}
