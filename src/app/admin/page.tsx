import { PeoplePageClient } from "@/components/admin/people-page-client";

export const metadata = {
  title: "People",
  robots: { index: false, follow: false },
};

export default function AdminPeoplePage() {
  return <PeoplePageClient />;
}
