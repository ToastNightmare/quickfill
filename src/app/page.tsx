import type { Metadata } from "next";
import Home from "./home-client";

// Homepage-specific canonical. Declared here (not in the root layout) so
// other routes never inherit a canonical pointing at the homepage.
export const metadata: Metadata = {
  alternates: {
    canonical: "https://getquickfill.com",
  },
};

export default function HomePage() {
  return <Home />;
}
