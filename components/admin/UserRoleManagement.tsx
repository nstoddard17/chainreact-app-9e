"use client"

import { useState, useEffect } from "react"
import { useAuthStore } from "@/stores/authStore"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { RoleBadge } from "@/components/ui/role-badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Search, Users, Crown, Loader2, Circle, RefreshCw, Wifi, WifiOff } from "lucide-react"
import { supabase } from "@/utils/supabaseClient"
import { type UserRole, getRoleInfo, ROLES } from "@/lib/utils/roles"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Switch } from "@/components/ui/switch"

interface User {
  id: string
  email: string
  full_name?: string
  username?: string
  role?: string
  created_at: string
  avatar_url?: string
  displayEmail?: string
  isOnline?: boolean
}

export default function UserRoleManagement() {
  const { profile } = useAuthStore()
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [newRole, setNewRole] = useState<UserRole>('free')
  const [updating, setUpdating] = useState(false)
  const [showUpdateDialog, setShowUpdateDialog] = useState(false)
  const [isLiveMode, setIsLiveMode] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  // Check if current user is admin
  const isAdmin = profile?.role === 'admin'

  useEffect(() => {
    if (isAdmin) {
      fetchUsers()
    }
  }, [isAdmin])

  // Live mode effect
  useEffect(() => {
    if (!isAdmin || !isLiveMode) return

    // Initial fetch
    fetchUsers()
    
    // Set up interval for live updates (every 2 minutes)
    const interval = setInterval(fetchUsers, 120000) // 2 minutes
    
    return () => clearInterval(interval)
  }, [isAdmin, isLiveMode])

  const fetchUsers = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/admin/users-list')
      const data = await response.json()

      if (data.success) {
        setUsers(data.users || [])
        setLastUpdated(new Date())
      } else {
        console.error('Failed to fetch users:', data.error)
      }
    } catch (error) {
      console.error('Error fetching users:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleRefresh = () => {
    fetchUsers()
  }

  const handleLiveModeToggle = (enabled: boolean) => {
    setIsLiveMode(enabled)
  }

  const handleUpdateRole = async () => {
    if (!selectedUser) return

    try {
      setUpdating(true)
      
      const { error } = await supabase
        .from('user_profiles')
        .update({ role: newRole })
        .eq('id', selectedUser.id)

      if (error) throw error

      // Update local state
      setUsers(users.map(user => 
        user.id === selectedUser.id 
          ? { ...user, role: newRole }
          : user
      ))

      setShowUpdateDialog(false)
      setSelectedUser(null)
    } catch (error) {
      console.error('Error updating user role:', error)
    } finally {
      setUpdating(false)
    }
  }

  const filteredUsers = users.filter(user =>
    user.displayEmail?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.username?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const onlineCount = users.filter(user => user.isOnline).length
  const totalCount = users.length

  if (!isAdmin) {
    return (
      <Card className="bg-card rounded-2xl shadow-lg border border-border">
        <CardContent className="p-8 text-center">
          <Crown className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
          <h3 className="text-lg font-semibold mb-2">Admin Access Required</h3>
          <p className="text-muted-foreground">
            You need admin privileges to access user role management.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <Card className="bg-card rounded-2xl shadow-lg border border-border">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Users className="w-5 h-5" />
              <span>User Management</span>
              {isLiveMode && (
                <div className="flex items-center space-x-1">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                  <span className="text-xs text-green-600 font-medium">LIVE</span>
                </div>
              )}
            </div>
            <div className="text-sm text-muted-foreground">
              {onlineCount}/{totalCount} online
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Controls Row */}
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <Button
                  onClick={handleRefresh}
                  disabled={loading}
                  variant="outline"
                  size="sm"
                  className="flex items-center space-x-2"
                >
                  <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                  <span>Refresh</span>
                </Button>
                
                <div className="flex items-center space-x-2">
                  <Switch
                    checked={isLiveMode}
                    onCheckedChange={handleLiveModeToggle}
                    id="live-mode"
                  />
                  <Label htmlFor="live-mode" className="text-sm">
                    <div className="flex items-center space-x-1">
                      {isLiveMode ? (
                        <Wifi className="w-4 h-4 text-green-500" />
                      ) : (
                        <WifiOff className="w-4 h-4 text-muted-foreground" />
                      )}
                      <span>Live Updates</span>
                    </div>
                  </Label>
                </div>
              </div>
              
              {lastUpdated && (
                <div className="text-xs text-muted-foreground">
                  Last updated: {lastUpdated.toLocaleTimeString()}
                </div>
              )}
            </div>

            <div className="flex items-center space-x-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search users by name or username..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin" />
              </div>
            ) : (
              <div className="space-y-2">
                {filteredUsers.map((user) => (
                  <div
                    key={user.id}
                    className="flex items-center justify-between p-4 bg-muted/50 rounded-lg border border-border"
                  >
                    <div className="flex items-center space-x-3">
                      {/* Online/Offline Status Indicator */}
                      <div className="relative">
                        <Circle 
                          className={`h-3 w-3 ${
                            user.isOnline 
                              ? 'text-green-500 fill-green-500' 
                              : 'text-red-500 fill-red-500'
                          }`}
                        />
                        {/* Glow effect for online users */}
                        {user.isOnline && (
                          <div className="absolute inset-0 h-3 w-3 bg-green-500 rounded-full animate-pulse opacity-30"></div>
                        )}
                      </div>
                      
                      <Avatar>
                        <AvatarFallback className="bg-gradient-to-r from-blue-500 to-purple-600 text-white">
                          {user.full_name?.charAt(0) || user.email?.charAt(0) || "U"}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="font-medium">
                          {user.full_name || user.username || "Unknown User"}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {user.displayEmail || user.email}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Joined {new Date(user.created_at).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-3">
                      <RoleBadge role={(user.role as UserRole) || 'free'} />
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setSelectedUser(user)
                          setNewRole((user.role as UserRole) || 'free')
                          setShowUpdateDialog(true)
                        }}
                      >
                        Update Role
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog open={showUpdateDialog} onOpenChange={setShowUpdateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update User Role</DialogTitle>
            <DialogDescription>
              Change the role for {selectedUser?.full_name || selectedUser?.email}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="role">New Role</Label>
              <Select value={newRole} onValueChange={(value: UserRole) => setNewRole(value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(ROLES).map(([role, info]) => (
                    <SelectItem key={role} value={role}>
                      <div className="flex items-center space-x-2">
                        <RoleBadge role={role as UserRole} size="sm" />
                        <span>{info.description}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowUpdateDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdateRole} disabled={updating}>
              {updating && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Update Role
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
} 