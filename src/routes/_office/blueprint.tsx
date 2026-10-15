import { createFileRoute } from "@tanstack/react-router";
import { RoomShell } from "@/components/office/RoomShell";
import { BlueprintRoom } from "@/components/office/BlueprintRoom";

export const Route = createFileRoute("/_office/blueprint")({
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
  component: Blueprint,
});

function Blueprint() {
  return (
    <RoomShell showFiles={false}>
      <BlueprintRoom />
    </RoomShell>
  );
}
