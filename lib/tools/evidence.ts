import sources from "@/data/prefectures_sources.json";

export type EvidenceEntry = {
  id: string;
  topic: string;
  source_title: string;
  source_url: string;
  evidence_text: string;
  grade_note: string;
  last_checked_at: string;
};

export function searchEvidence(query: string): EvidenceEntry[] {
  const q = query.toLowerCase();
  return (sources as EvidenceEntry[]).filter(
    (e) =>
      e.topic.toLowerCase().includes(q) ||
      e.evidence_text.toLowerCase().includes(q) ||
      e.grade_note.toLowerCase().includes(q)
  );
}

export function getAllEvidence(): EvidenceEntry[] {
  return sources as EvidenceEntry[];
}
