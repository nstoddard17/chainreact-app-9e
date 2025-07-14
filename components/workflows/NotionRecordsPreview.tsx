import React from "react";

interface NotionRecordsPreviewProps {
  records: Record<string, any>[];
  columns: string[];
}

export const NotionRecordsPreview: React.FC<NotionRecordsPreviewProps> = ({ records, columns }) => {
  return (
    <div className="border rounded bg-white p-2 max-h-60 overflow-x-auto overflow-y-auto font-mono text-sm">
      {records.length === 0 && <div className="text-muted-foreground">No records to preview.</div>}
      {records.length > 0 && (
        <table className="min-w-full border-collapse">
          <thead>
            <tr>
              {columns.map((col) => (
                <th key={col} className="px-2 py-1 border-b font-bold text-left bg-gray-50">{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {records.map((rec, i) => (
              <tr key={i}>
                {columns.map((col) => (
                  <td key={col} className="px-2 py-1 border-b truncate max-w-xs">{String(rec[col] ?? "")}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}; 