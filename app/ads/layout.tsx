import type { ReactNode } from "react";

import AdsAuthGate from "./AdsAuthGate";

export default function AdsLayout({ children }: { children: ReactNode }) {
  return <AdsAuthGate>{children}</AdsAuthGate>;
}
