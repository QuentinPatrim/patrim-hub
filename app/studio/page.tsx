"use client";

import { Suspense } from "react";
import { StudioPage } from "@/components/studio/StudioPage";

export default function Page() {
  return (
    <Suspense fallback={<div className="skeleton h-40" />}>
      <StudioPage />
    </Suspense>
  );
}
