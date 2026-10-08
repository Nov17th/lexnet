import { Suspense } from "react";
import EntryDetails from "@/components/EntryDetails";
export default function Page() {
  return (
    <Suspense>
      <EntryDetails mode="character" />
    </Suspense>
  );
}
