import React, { useState, useEffect, useRef } from 'react'
import { Search, User, Circle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { useIntegrationStore } from '@/stores/integrationStore'

import { logger } from '@/lib/utils/logger'

interface DiscordUser {
  id: string
  name: string
  value: string
  username: string
  discriminator: string
  avatarUrl?: string
  status?: string
  statusColor?: string
  source?: string
  section?: string
  disabled?: boolean
}

interface DiscordUserSelectorProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
}

export function DiscordUserSelector({ 
  value, 
  onChange, 
  placeholder = "Select a user to message",
  disabled = false 
}: DiscordUserSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [users, setUsers] = useState<DiscordUser[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedUser, setSelectedUser] = useState<DiscordUser | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  
  const { loadIntegrationData } = useIntegrationStore()

  // Load users when component mounts or search query changes
  useEffect(() => {
    const loadUsers = async () => {
      if (disabled) return
      
      setLoading(true)
      try {
        logger.debug('DiscordUserSelector loading users with:', { searchQuery })
        
        // Add timeout to prevent hanging
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Request timeout')), 15000) // 15 second timeout
        })
        
        const dataPromise = loadIntegrationData('discord_users', 'discord', {
          searchQuery: searchQuery.length >= 3 ? searchQuery : undefined
        })
        
        const data = await Promise.race([dataPromise, timeoutPromise])
        
        logger.debug('DiscordUserSelector received data:', data)
        
        if (data && Array.isArray(data)) {
          setUsers(data)
        }
      } catch (error) {
        logger.error('Failed to load Discord users:', error)
        setUsers([])
      } finally {
        setLoading(false)
      }
    }

    loadUsers()
  }, [searchQuery, loadIntegrationData, disabled])

  // Set selected user when value changes
  useEffect(() => {
    if (value && users.length > 0) {
      const user = users.find(u => u.id === value || u.value === value)
      setSelectedUser(user || null)
    } else {
      setSelectedUser(null)
    }
  }, [value, users])

  // Handle click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Handle search input changes with debouncing
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      // Search query is handled in the loadUsers effect
    }, 500) // Increased debounce time to 500ms

    return () => clearTimeout(timeoutId)
  }, [searchQuery])

  const handleUserSelect = (user: DiscordUser) => {
    if (user.disabled) return
    
    setSelectedUser(user)
    onChange(user.value)
    setIsOpen(false)
    setSearchQuery('')
  }

  const getStatusIcon = (status?: string) => {
    switch (status) {
      case 'online':
        return <Circle className="w-3 h-3 text-green-500 fill-current" />
      case 'idle':
        return <Circle className="w-3 h-3 text-yellow-500 fill-current" />
      case 'dnd':
        return <Circle className="w-3 h-3 text-red-500 fill-current" />
      case 'offline':
      default:
        return <Circle className="w-3 h-3 text-gray-400 fill-current" />
    }
  }

  const filteredUsers = users.filter(user => 
    !user.disabled && 
    (user.section === 'Recent' || user.source === 'search' || user.source === 'guild')
  )

  const recentUsers = filteredUsers.filter(user => user.section === 'Recent')
  const otherUsers = filteredUsers.filter(user => user.section !== 'Recent')

  return (
    <div className="relative" ref={dropdownRef}>
      <div className="space-y-2">
        <Label>User</Label>
        <Button
          type="button"
          variant="outline"
          className={cn(
            "w-full justify-between",
            !selectedUser && "text-muted-foreground"
          )}
          onClick={() => setIsOpen(!isOpen)}
          disabled={disabled}
        >
          <div className="flex items-center gap-2">
            {selectedUser?.avatarUrl ? (
              <img 
                src={selectedUser.avatarUrl} 
                alt={selectedUser.username}
                className="w-5 h-5 rounded-full"
              />
            ) : (
              <User className="w-4 h-4" />
            )}
            <span className="truncate">
              {selectedUser ? selectedUser.name : placeholder}
            </span>
          </div>
          {selectedUser?.status && (
            <div className="flex items-center gap-1">
              {getStatusIcon(selectedUser.status)}
            </div>
          )}
        </Button>
      </div>

      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-background border rounded-md shadow-lg">
          <div className="p-2 border-b">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                ref={inputRef}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search users..."
                className="pl-8"
                autoFocus
              />
            </div>
          </div>

          <ScrollArea className="max-h-60">
            {loading ? (
              <div className="p-4 text-center text-muted-foreground">
                Loading users...
              </div>
                          ) : filteredUsers.length === 0 ? (
              <div className="p-4 text-center text-muted-foreground">
                {searchQuery.length >= 3 ? 'No users found' : 'No users available'}
              </div>
            ) : (
              <div className="p-1">
                {/* Recent Users Section */}
                {recentUsers.length > 0 && (
                  <>
                    <div className="px-2 py-1 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Recent Contacts
                    </div>
                    {recentUsers.map((user) => (
                      <button
                        key={user.id}
                        type="button"
                        className={cn(
                          "w-full flex items-center gap-3 px-2 py-2 text-left rounded-sm hover:bg-accent hover:text-accent-foreground transition-colors",
                          (selectedUser?.id === user.id) && "bg-accent text-accent-foreground"
                        )}
                        onClick={() => handleUserSelect(user)}
                      >
                        <div className="relative">
                          <img 
                            src={user.avatarUrl || `https://cdn.discordapp.com/embed/avatars/${parseInt(user.discriminator) % 5}.png`}
                            alt={user.username}
                            className="w-8 h-8 rounded-full"
                          />
                          {user.status && (
                            <div className="absolute -bottom-1 -right-1">
                              {getStatusIcon(user.status)}
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{user.name}</div>
                          <div className="text-xs text-muted-foreground truncate">
                            {user.username}#{user.discriminator}
                          </div>
                        </div>
                      </button>
                    ))}
                  </>
                )}

                {/* Other Users Section */}
                {otherUsers.length > 0 && (
                  <>
                    {recentUsers.length > 0 && (
                      <div className="px-2 py-1 text-xs font-medium text-muted-foreground uppercase tracking-wide mt-2">
                        All Server Members
                      </div>
                    )}
                    {otherUsers.map((user) => (
                      <button
                        key={user.id}
                        type="button"
                        className={cn(
                          "w-full flex items-center gap-3 px-2 py-2 text-left rounded-sm hover:bg-accent hover:text-accent-foreground transition-colors",
                          (selectedUser?.id === user.id) && "bg-accent text-accent-foreground"
                        )}
                        onClick={() => handleUserSelect(user)}
                      >
                        <div className="relative">
                          <img 
                            src={user.avatarUrl || `https://cdn.discordapp.com/embed/avatars/${parseInt(user.discriminator) % 5}.png`}
                            alt={user.username}
                            className="w-8 h-8 rounded-full"
                          />
                          {user.status && (
                            <div className="absolute -bottom-1 -right-1">
                              {getStatusIcon(user.status)}
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{user.name}</div>
                          <div className="text-xs text-muted-foreground truncate">
                            {user.username}#{user.discriminator}
                          </div>
                        </div>
                      </button>
                    ))}
                  </>
                )}
              </div>
            )}
          </ScrollArea>
        </div>
      )}
    </div>
  )
} 