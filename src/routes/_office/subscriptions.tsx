"use client";

import { createFileRoute } from "@tanstack/react-router";
import { RoomShell } from "@/components/office/RoomShell";
import { SubscriptionManager } from "@/components/office/SubscriptionManager";
import { RoomBox } from "@/components/office/RoomLayout";

export const Route = createFileRoute("/_office/subscriptions")({
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
  component: Subscriptions,
});

export function Subscriptions() {
  return (
    <RoomShell>
      <RoomBox id="subscriptions.manager" name="Subscriptions"><SubscriptionManager /></RoomBox>
    </RoomShell>
  );
}
