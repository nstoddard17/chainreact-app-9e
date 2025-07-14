import React from "react";

interface DiscordMessage {
  id: string;
  content: string;
  timestamp: string;
  author: {
    username: string;
    bot?: boolean;
  };
}

interface DiscordMessagesPreviewProps {
  messages: DiscordMessage[];
}

export const DiscordMessagesPreview: React.FC<DiscordMessagesPreviewProps> = ({ messages }) => {
  return (
    <div className="border rounded bg-white p-2 max-h-60 overflow-y-auto font-mono text-sm">
      {messages.length === 0 && <div className="text-muted-foreground">No messages to preview.</div>}
      {messages.map((msg) => (
        <div key={msg.id} className="flex items-start mb-1">
          <span className="text-xs text-muted-foreground w-16 flex-shrink-0">
            {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
          <span className="font-bold mr-2">{msg.author.username}</span>
          <span>{msg.content}</span>
        </div>
      ))}
    </div>
  );
}; 