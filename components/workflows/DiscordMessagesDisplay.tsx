import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { ScrollArea } from '@/components/ui/scroll-area'
import { MessageSquare, User, Bot, Clock, Hash } from 'lucide-react'

interface DiscordMessage {
  id: string
  content: string
  timestamp: string
  edited_timestamp?: string
  author: {
    id: string
    username: string
    discriminator?: string
    avatar?: string
    bot?: boolean
    display_name?: string
  }
  channel_id: string
  guild_id?: string
  mentions: any[]
  mention_roles: any[]
  mention_everyone: boolean
  attachments: any[]
  embeds: any[]
  reactions: any[]
  pinned: boolean
  type: number
  flags: number
  webhook_id?: string
  tts: boolean
  nonce?: string
  referenced_message?: any
}

interface DiscordMessagesDisplayProps {
  messages: DiscordMessage[]
  channelId?: string
  limit?: number
  className?: string
}

export function DiscordMessagesDisplay({ 
  messages, 
  channelId, 
  limit, 
  className = "" 
}: DiscordMessagesDisplayProps) {
  if (!messages || messages.length === 0) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Discord Messages
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">No messages found</p>
        </CardContent>
      </Card>
    )
  }

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp)
    return date.toLocaleString()
  }

  const getAuthorDisplayName = (author: DiscordMessage['author']) => {
    if (author.display_name) return author.display_name
    if (author.discriminator && author.discriminator !== '0') {
      return `${author.username}#${author.discriminator}`
    }
    return author.username
  }

  const getAuthorInitials = (author: DiscordMessage['author']) => {
    const displayName = getAuthorDisplayName(author)
    return displayName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5" />
          Discord Messages
          {channelId && (
            <Badge variant="secondary" className="ml-2">
              <Hash className="h-3 w-3 mr-1" />
              {channelId}
            </Badge>
          )}
          {limit && (
            <Badge variant="outline" className="ml-2">
              Limit: {limit}
            </Badge>
          )}
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Showing {messages.length} message{messages.length !== 1 ? 's' : ''}
        </p>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[400px] w-full">
          <div className="space-y-4">
            {messages.map((message) => (
              <div key={message.id} className="border rounded-lg p-4 hover:bg-muted/50 transition-colors">
                <div className="flex items-start gap-3">
                  <Avatar className="h-8 w-8">
                    <AvatarImage 
                      src={message.author.avatar 
                        ? `https://cdn.discordapp.com/avatars/${message.author.id}/${message.author.avatar}.png`
                        : undefined
                      } 
                    />
                    <AvatarFallback className="text-xs">
                      {getAuthorInitials(message.author)}
                    </AvatarFallback>
                  </Avatar>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-sm">
                        {getAuthorDisplayName(message.author)}
                      </span>
                      {message.author.bot && (
                        <Badge variant="secondary" className="text-xs">
                          <Bot className="h-3 w-3 mr-1" />
                          Bot
                        </Badge>
                      )}
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatTimestamp(message.timestamp)}
                      </span>
                      {message.edited_timestamp && (
                        <span className="text-xs text-muted-foreground">
                          (edited)
                        </span>
                      )}
                      {message.pinned && (
                        <Badge variant="outline" className="text-xs">
                          Pinned
                        </Badge>
                      )}
                    </div>
                    
                    <div className="text-sm">
                      {message.content ? (
                        <p className="whitespace-pre-wrap break-words">{message.content}</p>
                      ) : (
                        <p className="text-muted-foreground italic">No content</p>
                      )}
                    </div>

                    {/* Show attachments */}
                    {message.attachments && message.attachments.length > 0 && (
                      <div className="mt-2">
                        <p className="text-xs text-muted-foreground mb-1">
                          Attachments ({message.attachments.length}):
                        </p>
                        <div className="space-y-1">
                          {message.attachments.map((attachment, index) => (
                            <div key={index} className="text-xs text-blue-600 hover:underline cursor-pointer">
                              📎 {attachment.filename} ({(attachment.size / 1024).toFixed(1)} KB)
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Show embeds */}
                    {message.embeds && message.embeds.length > 0 && (
                      <div className="mt-2">
                        <p className="text-xs text-muted-foreground mb-1">
                          Embeds ({message.embeds.length}):
                        </p>
                        <div className="space-y-1">
                          {message.embeds.map((embed, index) => (
                            <div key={index} className="text-xs text-green-600">
                              📋 {embed.title || 'Untitled embed'}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Show reactions */}
                    {message.reactions && message.reactions.length > 0 && (
                      <div className="mt-2">
                        <p className="text-xs text-muted-foreground mb-1">
                          Reactions:
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {message.reactions.map((reaction, index) => (
                            <Badge key={index} variant="outline" className="text-xs">
                              {reaction.emoji.name} {reaction.count}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Show mentions */}
                    {message.mentions && message.mentions.length > 0 && (
                      <div className="mt-2">
                        <p className="text-xs text-muted-foreground mb-1">
                          Mentions ({message.mentions.length}):
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {message.mentions.map((mention, index) => (
                            <Badge key={index} variant="secondary" className="text-xs">
                              <User className="h-3 w-3 mr-1" />
                              {mention.username}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  )
} 