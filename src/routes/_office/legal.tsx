import { createFileRoute } from "@tanstack/react-router";
import { RoomShell } from "@/components/office/RoomShell";
import { LegalRoom } from "@/components/office/LegalRoom";

export const Route = createFileRoute("/_office/legal")({
  head: () => ({
    meta: [
      { title: "CanX Office" },
      { name: "description", content: "Owner-only CanX operations workspace." },
      { property: "og:title", content: "CanX Office" },
      { property: "og:description", content: "Owner-only CanX operations workspace." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Legal,
});

function Legal() {
  return (
    <RoomShell
      title="Legal & Compliance"
      purpose="Agreements, policies, ownership and deadlines in one place."
      showSample={false}
      showFiles={false}
    >
      <LegalRoom />
    </RoomShell>
  );
}
