import React from "react";
import { Hash, Volume2, Megaphone, Users, MessageSquare, FolderOpen } from "lucide-react";

interface DiscordChannel {
  id: string;
  name: string;
  type: number;
  position: number;
  parent_id?: string;
  topic?: string;
  nsfw?: boolean;
  bitrate?: number;
  user_limit?: number;
  rate_limit_per_user?: number;
  default_auto_archive_duration?: number;
}

interface DiscordChannelsPreviewProps {
  channels: DiscordChannel[];
}

const getChannelIcon = (type: number) => {
  switch (type) {
    case 0: // Text Channel
      return <Hash className="w-4 h-4" />;
    case 2: // Voice Channel
      return <Volume2 className="w-4 h-4" />;
    case 4: // Category
      return <FolderOpen className="w-4 h-4" />;
    case 5: // Announcement Channel
      return <Megaphone className="w-4 h-4" />;
    case 13: // Stage Channel
      return <Users className="w-4 h-4" />;
    case 15: // Forum Channel
      return <MessageSquare className="w-4 h-4" />;
    case 16: // Media Channel
      return <MessageSquare className="w-4 h-4" />;
    default:
      return <Hash className="w-4 h-4" />;
  }
};

const getChannelTypeName = (type: number) => {
  switch (type) {
    case 0: return "Text Channel";
    case 2: return "Voice Channel";
    case 4: return "Category";
    case 5: return "Announcement Channel";
    case 13: return "Stage Channel";
    case 15: return "Forum Channel";
    case 16: return "Media Channel";
    default: return "Unknown";
  }
};

export const DiscordChannelsPreview: React.FC<DiscordChannelsPreviewProps> = ({ channels }) => {
  // Sort channels by position and group by category
  const sortedChannels = [...channels].sort((a, b) => a.position - b.position);
  
  // Separate categories and channels
  const categories = sortedChannels.filter(channel => channel.type === 4);
  const nonCategoryChannels = sortedChannels.filter(channel => channel.type !== 4);

  // Group channels by their parent category
  const channelsByCategory = nonCategoryChannels.reduce((acc, channel) => {
    const parentId = channel.parent_id || 'uncategorized';
    if (!acc[parentId]) {
      acc[parentId] = [];
    }
    acc[parentId].push(channel);
    return acc;
  }, {} as Record<string, DiscordChannel[]>);

  return (
    <div className="border rounded bg-white p-4 max-h-96 overflow-y-auto font-mono text-sm">
      {channels.length === 0 && (
        <div className="text-muted-foreground text-center py-4">
          No channels found in this server.
        </div>
      )}
      
      {channels.length > 0 && (
        <div className="space-y-3">
          {/* Show uncategorized channels first */}
          {channelsByCategory['uncategorized'] && channelsByCategory['uncategorized'].length > 0 && (
            <div className="space-y-1">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                General Channels
              </div>
              {channelsByCategory['uncategorized'].map((channel) => (
                <div key={channel.id} className="flex items-center gap-2 py-1 px-2 rounded hover:bg-gray-50">
                  <div className="text-gray-500">
                    {getChannelIcon(channel.type)}
                  </div>
                  <span className="font-medium">{channel.name}</span>
                  <span className="text-xs text-gray-400">
                    ({getChannelTypeName(channel.type)})
                  </span>
                  {channel.nsfw && (
                    <span className="text-xs bg-red-100 text-red-700 px-1 rounded">NSFW</span>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Show categorized channels */}
          {categories.map((category) => {
            const categoryChannels = channelsByCategory[category.id] || [];
            if (categoryChannels.length === 0) return null;

            return (
              <div key={category.id} className="space-y-1">
                <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  <FolderOpen className="w-3 h-3" />
                  {category.name}
                </div>
                <div className="ml-4 space-y-1">
                  {categoryChannels.map((channel) => (
                    <div key={channel.id} className="flex items-center gap-2 py-1 px-2 rounded hover:bg-gray-50">
                      <div className="text-gray-500">
                        {getChannelIcon(channel.type)}
                      </div>
                      <span className="font-medium">{channel.name}</span>
                      <span className="text-xs text-gray-400">
                        ({getChannelTypeName(channel.type)})
                      </span>
                      {channel.nsfw && (
                        <span className="text-xs bg-red-100 text-red-700 px-1 rounded">NSFW</span>
                      )}
                      {channel.topic && (
                        <span className="text-xs text-gray-500 truncate max-w-32" title={channel.topic}>
                          - {channel.topic}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}; 