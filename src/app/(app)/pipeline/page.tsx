import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pipeline",
};

export default function PipelinePage() {
  const stages = [
    "new",
    "contacted",
    "replied",
    "qualified",
    "booked call",
    "showed up",
    "offer",
    "closed",
  ];

  return (
    <>
      <h1 className="text-2xl font-semibold mb-4">Pipeline</h1>
      <div className="grid grid-cols-4 gap-4">
        {stages.map((stage) => (
          <div key={stage} className="bg-white rounded-lg border p-3">
            <h2 className="font-semibold text-sm mb-2 capitalize">{stage}</h2>
            <p className="text-xs text-slate-500">No leads yet.</p>
          </div>
        ))}
      </div>
    </>
  );
}