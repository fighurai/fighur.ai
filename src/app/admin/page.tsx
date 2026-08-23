import { notFound, redirect } from "next/navigation";

import { PeoplePageClient } from "@/components/admin/people-page-client";
import { isPlatformAdminEmail } from "@/lib/platform-admin";
import { readVerifiedSessionFromCookies } from "@/lib/platform-admin-server";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "People",
  robots: { index: false, follow: false },
};

export default async function AdminPeoplePage() {
  const session = await readVerifiedSessionFromCookies();
  if (!session) {
    redirect("/sign-in");
  }
  if (!isPlatformAdminEmail(session.email)) {
    notFound();
  }

  return <PeoplePageClient />;
}
