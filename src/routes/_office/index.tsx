import { createFileRoute } from "@tanstack/react-router";
import { Office3D } from "@/components/office/Office3D";

export const Route = createFileRoute("/_office/")({
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
  component: Reception,
});

function Reception() {
  return <Office3D />;
}
