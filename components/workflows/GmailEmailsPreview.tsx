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
    <div className="w-full p-2 font-mono text-sm">
      {emails.length === 0 && <div className="text-muted-foreground">No emails to preview.</div>}
      {emails.map((email) => (
        <div key={email.id} className="mb-2 p-2 border-b border-gray-100 last:border-b-0">
          <div className="flex items-start justify-between gap-2">
            <span className="font-bold text-sm flex-1 min-w-0 break-words">
              {email.subject || <span className="text-muted-foreground">(No Subject)</span>}
            </span>
            <span className="text-xs text-muted-foreground flex-shrink-0">
              {email.date ? new Date(email.date).toLocaleString() : ""}
            </span>
          </div>
          <div className="text-xs text-muted-foreground mt-1">From: {email.from}</div>
          <div className="text-sm mt-1 break-words">{email.snippet}</div>
          {email.labelIds && email.labelIds.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
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