import React, { useState } from "react";
import { Mail, Star, StarOff, Paperclip, Reply, Forward, Archive, Trash2, MoreVertical, ChevronDown, ChevronRight } from "lucide-react";

interface GmailEmail {
  id: string;
  subject?: string;
  from?: string;
  to?: string;
  snippet?: string;
  date?: string;
  body?: string;
  attachments?: Array<{
    filename: string;
    mimeType: string;
    size: number;
    attachmentId: string;
  }>;
  labelIds?: string[];
  isRead?: boolean;
  hasAttachments?: boolean;
  isStarred?: boolean;
}

interface GmailEmailsPreviewProps {
  emails: GmailEmail[];
  fieldsMask?: string; // To know what data was requested
}

export const GmailEmailsPreview: React.FC<GmailEmailsPreviewProps> = ({ emails, fieldsMask }) => {
  const [expandedEmails, setExpandedEmails] = useState<Set<string>>(new Set());

  const toggleEmail = (emailId: string) => {
    const newExpanded = new Set(expandedEmails);
    if (newExpanded.has(emailId)) {
      newExpanded.delete(emailId);
    } else {
      newExpanded.add(emailId);
    }
    setExpandedEmails(newExpanded);
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return "";
    const date = new Date(dateString);
    const now = new Date();
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);
    
    if (diffInHours < 24) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (diffInHours < 168) { // 7 days
      return date.toLocaleDateString([], { weekday: 'short' });
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
  };

  const getSenderDisplay = (email: GmailEmail) => {
    if (email.from) {
      return email.from.split('@')[0];
    }
    if (email.to) {
      return email.to.split('@')[0];
    }
    return "Unknown";
  };

  const getSubjectDisplay = (email: GmailEmail) => {
    if (email.subject) {
      return email.subject;
    }
    if (email.body) {
      // Extract first line from body as subject
      const firstLine = email.body.split('\n')[0].trim();
      return firstLine.length > 50 ? firstLine.substring(0, 50) + '...' : firstLine;
    }
    return "(No Subject)";
  };

  const decodeHtmlEntities = (text: string) => {
    const textarea = document.createElement('textarea');
    textarea.innerHTML = text;
    return textarea.value;
  };

  const getSnippetDisplay = (email: GmailEmail) => {
    if (email.snippet) {
      return decodeHtmlEntities(email.snippet);
    }
    if (email.body) {
      // Use body content as snippet, but skip the first line if it's already used as subject
      const lines = email.body.split('\n').map(line => line.trim()).filter(line => line.length > 0);
      if (lines.length > 1) {
        // Use second line onwards as snippet
        const remainingContent = lines.slice(1).join(' ');
        const cleanContent = remainingContent.replace(/\s+/g, ' ').trim();
        return cleanContent.length > 100 ? cleanContent.substring(0, 100) + '...' : cleanContent;
      }
      return "";
    }
    return "";
  };

  // Format body text to be more readable
  const formatBodyText = (text: string) => {
    if (!text) return "";
    
    // Split by lines
    let lines = text.split('\n');
    
    // Process each line
    lines = lines.map(line => {
      // Format long URLs to make them more readable
      if (line.includes('http')) {
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        return line.replace(urlRegex, url => {
          // If URL is longer than 50 chars, truncate it
          if (url.length > 50) {
            return url.substring(0, 47) + '...';
          }
          return url;
        });
      }
      
      // Break very long lines
      if (line.length > 80 && !line.includes(' ')) {
        let result = '';
        for (let i = 0; i < line.length; i += 80) {
          result += line.substring(i, Math.min(i + 80, line.length));
          if (i + 80 < line.length) {
            result += '\n';
          }
        }
        return result;
      }
      
      return line;
    });
    
    return lines.join('\n');
  };

  const renderExpandedContent = (email: GmailEmail) => {
    const isExpanded = expandedEmails.has(email.id);
    
    if (!isExpanded) return null;

    // Determine what content to show based on fields mask
    if (fieldsMask?.includes('payload(body)') && !fieldsMask?.includes('payload(parts)')) {
      // Body only
      return (
        <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 w-full overflow-hidden">
          <div className="text-sm text-gray-600 mb-2">Body Content:</div>
          <div className="text-sm text-gray-900 whitespace-pre-wrap max-h-64 overflow-y-auto break-words overflow-x-hidden w-full">
            {formatBodyText(email.body || "No body content available")}
          </div>
        </div>
      );
    } else if (fieldsMask?.includes('payload(parts)') && !fieldsMask?.includes('payload(body)')) {
      // Attachments only
      return (
        <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 w-full overflow-hidden">
          <div className="text-sm text-gray-600 mb-2">Attachments:</div>
          {email.attachments && email.attachments.length > 0 ? (
            <div className="space-y-2 w-full">
              {email.attachments.map((attachment, index) => (
                <div key={index} className="flex items-center gap-2 text-sm w-full min-w-0">
                  <Paperclip className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  <span className="text-gray-900 truncate min-w-0 flex-1">{attachment.filename}</span>
                  <span className="text-gray-500 text-xs flex-shrink-0">({attachment.mimeType}, {attachment.size} bytes)</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-gray-500">No attachments found</div>
          )}
        </div>
      );
    } else if (fieldsMask?.includes('payload(body)') && fieldsMask?.includes('payload(parts)')) {
      // Body + Attachments
      return (
        <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 w-full overflow-hidden">
          {email.body && (
            <div className="mb-4 w-full">
              <div className="text-sm text-gray-600 mb-2">Body Content:</div>
              <div className="text-sm text-gray-900 whitespace-pre-wrap max-h-48 overflow-y-auto break-words overflow-x-hidden w-full">
                {formatBodyText(email.body)}
              </div>
            </div>
          )}
          {email.attachments && email.attachments.length > 0 && (
            <div className="w-full">
              <div className="text-sm text-gray-600 mb-2">Attachments:</div>
              <div className="space-y-2 w-full">
                {email.attachments.map((attachment, index) => (
                  <div key={index} className="flex items-center gap-2 text-sm w-full min-w-0">
                    <Paperclip className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    <span className="text-gray-900 truncate min-w-0 flex-1">{attachment.filename}</span>
                    <span className="text-gray-500 text-xs flex-shrink-0">({attachment.mimeType}, {attachment.size} bytes)</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      );
    } else if (fieldsMask?.includes('payload(headers)')) {
      // Metadata only
      return (
        <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 w-full overflow-hidden">
          <div className="text-sm text-gray-600 mb-2">Email Metadata:</div>
          <div className="space-y-1 text-sm w-full">
            {email.from && <div className="break-words overflow-x-hidden w-full"><span className="text-gray-500">From:</span> <span className="text-gray-900">{email.from}</span></div>}
            {email.to && <div className="break-words overflow-x-hidden w-full"><span className="text-gray-500">To:</span> <span className="text-gray-900">{email.to}</span></div>}
            {email.subject && <div className="break-words overflow-x-hidden w-full"><span className="text-gray-500">Subject:</span> <span className="text-gray-900">{email.subject}</span></div>}
            {email.date && <div className="break-words overflow-x-hidden w-full"><span className="text-gray-500">Date:</span> <span className="text-gray-900">{email.date}</span></div>}
          </div>
        </div>
      );
    } else {
      // Full message or default
      return (
        <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 w-full overflow-hidden">
          <div className="text-sm text-gray-600 mb-2">Full Email Content:</div>
          {email.body && (
            <div className="mb-4 w-full">
              <div className="text-sm text-gray-600 mb-2">Body:</div>
              <div className="text-sm text-gray-900 whitespace-pre-wrap max-h-48 overflow-y-auto break-words overflow-x-hidden w-full">
                {formatBodyText(email.body)}
              </div>
            </div>
          )}
          {email.attachments && email.attachments.length > 0 && (
            <div className="w-full">
              <div className="text-sm text-gray-600 mb-2">Attachments:</div>
              <div className="space-y-2 w-full">
                {email.attachments.map((attachment, index) => (
                  <div key={index} className="flex items-center gap-2 text-sm w-full min-w-0">
                    <Paperclip className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    <span className="text-gray-900 truncate min-w-0 flex-1">{attachment.filename}</span>
                    <span className="text-gray-500 text-xs flex-shrink-0">({attachment.mimeType}, {attachment.size} bytes)</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      );
    }
  };

  return (
    <div className="w-full bg-white border border-gray-200 rounded-lg overflow-hidden">
      {emails.length === 0 && (
        <div className="p-8 text-center text-gray-500">
          <Mail className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p>No emails to preview.</p>
        </div>
      )}

      {emails.map((email, index) => (
        <div key={email.id} className="w-full min-w-0">
          <div 
            className={`
              flex items-start gap-3 px-4 py-3 border-b border-gray-100 last:border-b-0
              hover:bg-gray-50 transition-colors cursor-pointer w-full min-w-0
              ${!email.isRead ? 'bg-blue-50' : ''}
            `}
            onClick={() => toggleEmail(email.id)}
          >
            {/* Checkbox */}
            <div className="w-4 h-4 border border-gray-300 rounded flex-shrink-0"></div>
            
            {/* Star */}
            <div className="w-4 h-4 flex-shrink-0">
              {email.isStarred ? (
                <Star className="w-4 h-4 text-yellow-400 fill-current" />
              ) : (
                <StarOff className="w-4 h-4 text-gray-300" />
              )}
            </div>

            {/* Email Content - Single Line Layout */}
            <div className="flex-1 min-w-0 flex items-start gap-3">
              <span className={`text-sm ${!email.isRead ? 'font-semibold' : 'font-medium'} text-gray-900 flex-shrink-0 max-w-[100px] truncate`}>
                {getSenderDisplay(email)}
              </span>
              
              <div className="flex-1 min-w-0 flex flex-col gap-1">
                <span className={`text-sm ${!email.isRead ? 'font-semibold' : ''} text-gray-900 break-words`}>
                  {getSubjectDisplay(email)}
                </span>
                {getSnippetDisplay(email) && (
                  <span className="text-sm text-gray-500 break-words">
                    {getSnippetDisplay(email)}
                  </span>
                )}
              </div>
            </div>

            {/* Attachments indicator */}
            {email.attachments && email.attachments.length > 0 && (
              <div className="flex-shrink-0 mt-1">
                <Paperclip className="w-4 h-4 text-gray-400" />
              </div>
            )}

            {/* Expand/Collapse indicator */}
            <div className="flex-shrink-0 mt-1">
              {expandedEmails.has(email.id) ? (
                <ChevronDown className="w-4 h-4 text-gray-400" />
              ) : (
                <ChevronRight className="w-4 h-4 text-gray-400" />
              )}
            </div>

            {/* Date */}
            <div className="flex-shrink-0 mt-1">
              <span className="text-xs text-gray-500 whitespace-nowrap">
                {formatDate(email.date || "")}
              </span>
            </div>
          </div>

          {/* Expanded content */}
          {renderExpandedContent(email)}
        </div>
      ))}
    </div>
  );
}; 