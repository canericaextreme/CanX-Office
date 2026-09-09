import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import type { KnowledgeRecord } from "@/lib/office-knowledge";

interface Props {
  record: KnowledgeRecord;
  /** Show only these section ids (in the record's own order). */
  onlySections?: string[];
  title?: string;
  defaultOpen?: boolean;
}

export function KnowledgeRecordPanel({ record, onlySections, title, defaultOpen = false }: Props) {
  const sections = onlySections
    ? record.sections.filter((s) => onlySections.includes(s.id))
    : record.sections;

  return (
    <Card className="border-border bg-card">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">{title ?? record.title}</CardTitle>
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary" className="text-[11px]">Recorded by John</Badge>
            <Badge variant="outline" className="text-[11px]">
              {record.recordedOn} · v{record.version}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground">{record.standing}</p>
        <Accordion
          type="multiple"
          className="mt-2"
          {...(defaultOpen ? { defaultValue: sections.map((s) => s.id) } : {})}
        >
          {sections.map((section) => (
            <AccordionItem key={section.id} value={section.id}>
              <AccordionTrigger className="text-left text-sm">{section.heading}</AccordionTrigger>
              <AccordionContent>
                <ul className="list-outside list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                  {section.points.map((point, i) => (
                    <li key={i}>{point}</li>
                  ))}
                </ul>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
        <p className="mt-2 text-[11px] text-muted-foreground">Source: {record.source}</p>
      </CardContent>
    </Card>
  );
}
