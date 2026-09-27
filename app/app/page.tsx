import { Home, homeMetadata } from "./home";

export const dynamic = "force-dynamic";
export const metadata = homeMetadata("en");

export default function Page() {
  return <Home lang="en" />;
}
