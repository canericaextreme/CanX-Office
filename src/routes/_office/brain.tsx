import { BrainHub } from "@/components/office/BrainHub";
import { BrainDocuments } from "@/components/office/BrainDocuments";
import { createFileRoute } from "@tanstack/react-router";
import { RoomShell } from "@/components/office/RoomShell";
import { BrainConnectionsList } from "@/components/office/BrainConnectionsList";
import { BrainLiveView } from "@/components/office/BrainLiveView";
import { BrainSection } from "@/components/office/BrainSection";
import { BrainMemory } from "@/components/office/BrainMemory";

export const Route = createFileRoute("/_office/brain")({
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
  component: Brain,
});

function Brain() {
  return (
    <RoomShell showFiles={false} showSample={false}>
      <div className="space-y-6">
        <BrainHub />
        <BrainLiveView />
        <div className="space-y-3">
          <BrainSection
            id="brain-documents"
            label="Project documents"
            hint="Long documents saved for Elsie and the builders to read in full."
          >
            <BrainDocuments />
          </BrainSection>
          <BrainSection
            id="brain-memory"
            label="Saved conversation memory"
            hint="Summaries of past conversations that Elsie reads when answering."
          >
            <BrainMemory />
          </BrainSection>
          <BrainSection
            id="brain-map"
            label="Connections list"
            hint="How the Office's parts connect, as a plain list. The live Brain view above is the map."
          >
            <BrainConnectionsList />
          </BrainSection>
          <BrainSection
            id="brain-growth"
            label="Growth history"
            hint="Approved skills, new projects, verified sources and finished work, once recorded."
          >
            <p className="px-2 py-1 text-sm text-muted-foreground">
              No recorded changes yet. Growth will appear here after approved skills, added
              projects, verified sources, or completed work items are recorded.
            </p>
          </BrainSection>
        </div>
      </div>
    </RoomShell>
  );
}
