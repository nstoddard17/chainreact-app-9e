import React from "react";

interface GmailEmail {
  id: string;
  subject: string;
  from: string;
  snippet: string;
  date: string;
  labelIds?: string[];
}

interface GmailEmailsPreviewProps {
  emails: GmailEmail[];
}

export const GmailEmailsPreview: React.FC<GmailEmailsPreviewProps> = ({ emails }) => {
  return (
    <div className="border rounded bg-white p-2 max-h-60 overflow-y-auto font-mono text-sm">
      {emails.length === 0 && <div className="text-muted-foreground">No emails to preview.</div>}
      {emails.map((email) => (
        <div key={email.id} className="mb-2">
          <div className="flex items-center justify-between">
            <span className="font-bold">{email.subject || <span className="text-muted-foreground">(No Subject)</span>}</span>
            <span className="text-xs text-muted-foreground ml-2">{email.date ? new Date(email.date).toLocaleString() : ""}</span>
          </div>
          <div className="text-xs text-muted-foreground">From: {email.from}</div>
          <div className="truncate">{email.snippet}</div>
          {email.labelIds && email.labelIds.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {email.labelIds.map((label) => (
                <span key={label} className="bg-gray-200 text-xs px-2 py-0.5 rounded-full">{label}</span>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}; 