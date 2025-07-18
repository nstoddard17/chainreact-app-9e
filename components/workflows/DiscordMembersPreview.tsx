import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Loader2, Users, Crown, Bot, Calendar, Hash } from 'lucide-react'
import { cn } from '@/lib/utils'

interface DiscordMembersPreviewProps {
  config: any
  onClose: () => void
}

interface Member {
  user: {
    id: string
    username: string
    discriminator: string
    avatar: string | null
    bot?: boolean
  }
  nick: string | null
  roles: string[]
  joined_at: string
  premium_since?: string
  permissions?: string
}

export function DiscordMembersPreview({ config, onClose }: DiscordMembersPreviewProps) {
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchPreview = async () => {
    setLoading(true)
    setError(null)
    
    try {
      const response = await fetch('/api/discord/fetch-guild-members-preview', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ config }),
      })

      const result = await response.json()
      
      if (!response.ok) {
        throw new Error(result.error || 'Failed to fetch preview')
      }

      setMembers(result.data || [])
    } catch (err: any) {
      setError(err.message || 'Failed to load preview')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (config.guildId) {
      fetchPreview()
    }
  }, [config])

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  const getDisplayName = (member: Member) => {
    return member.nick || member.user.username
  }

  const getAvatarUrl = (member: Member) => {
    if (member.user.avatar) {
      return `https://cdn.discordapp.com/avatars/${member.user.id}/${member.user.avatar}.png`
    }
    return undefined
  }

  const getAvatarFallback = (member: Member) => {
    const name = getDisplayName(member)
    return name.charAt(0).toUpperCase()
  }

  const isOwner = (member: Member) => {
    // Check if user has the highest role (owner)
    return member.permissions === '8' // Discord owner permission
  }

  const isAdmin = (member: Member) => {
    // Check if user has admin permissions
    return member.permissions && parseInt(member.permissions) >= 8
  }

  return (
    <Card className="w-full max-w-4xl">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <div className="flex items-center space-x-2">
          <Users className="h-5 w-5 text-muted-foreground" />
          <CardTitle className="text-lg">Guild Members Preview</CardTitle>
        </div>
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchPreview}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Hash className="h-4 w-4" />
            )}
            Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </CardHeader>
      
      <CardContent>
        {error && (
          <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 rounded-md">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        {loading && !members.length ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin mr-2" />
            <span>Loading members...</span>
          </div>
        ) : members.length > 0 ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>Showing {members.length} members</span>
              <span>Last updated: {new Date().toLocaleTimeString()}</span>
            </div>
            
            <ScrollArea className="h-96">
              <div className="space-y-2">
                {members.map((member) => (
                  <div
                    key={member.user.id}
                    className="flex items-center space-x-3 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                  >
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={getAvatarUrl(member)} alt={getDisplayName(member)} />
                      <AvatarFallback className="text-sm">
                        {getAvatarFallback(member)}
                      </AvatarFallback>
                    </Avatar>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2">
                        <span className="font-medium truncate">
                          {getDisplayName(member)}
                        </span>
                        
                        {member.user.bot && (
                          <Badge variant="secondary" className="text-xs">
                            <Bot className="h-3 w-3 mr-1" />
                            Bot
                          </Badge>
                        )}
                        
                        {isOwner(member) && (
                          <Badge variant="default" className="text-xs">
                            <Crown className="h-3 w-3 mr-1" />
                            Owner
                          </Badge>
                        )}
                        
                        {isAdmin(member) && !isOwner(member) && (
                          <Badge variant="outline" className="text-xs">
                            Admin
                          </Badge>
                        )}
                      </div>
                      
                      <div className="flex items-center space-x-4 text-xs text-muted-foreground mt-1">
                        <span>@{member.user.username}</span>
                        <span>•</span>
                        <span className="flex items-center">
                          <Calendar className="h-3 w-3 mr-1" />
                          Joined {formatDate(member.joined_at)}
                        </span>
                        {member.roles && member.roles.length > 0 && (
                          <>
                            <span>•</span>
                            <span>{member.roles.length} role{member.roles.length !== 1 ? 's' : ''}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No members found</p>
            <p className="text-sm">Try adjusting your filters or check your server permissions</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
} 