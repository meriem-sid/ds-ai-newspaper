import PageHeader from "@/components/PageHeader";
import SavedList from "@/components/SavedList";

export const metadata = { title: "Saved · The Data Science & AI Newspaper" };

export default function SavedPage() {
  return (
    <>
      <PageHeader title="Saved" subtitle="Stories you bookmarked, newest edition first. Saved in this browser only — nothing is shared or synced." />
      <SavedList />
    </>
  );
}
