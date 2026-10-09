import { Suspense } from "react";
import Topics from "@/components/Topics";
export default function Page() {
  return (
    <Suspense>
      <Topics />
    </Suspense>
  );
}
