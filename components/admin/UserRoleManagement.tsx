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
import { Search, Users, Crown, Loader2, Circle, RefreshCw, Wifi, WifiOff, Plus, Edit, Trash2, UserPlus, Eye, EyeOff, AlertTriangle } from "lucide-react"
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
  const [roleFilter, setRoleFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  
  // New user creation state
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  
  // Form states
  const [newUserForm, setNewUserForm] = useState({
    email: '',
    password: '',
    full_name: '',
    username: '',
    role: 'free' as UserRole,
    send_welcome_email: true
  })
  
  const [editUserForm, setEditUserForm] = useState({
    email: '',
    full_name: '',
    username: '',
    role: 'free' as UserRole,
    password: '',
    email_confirm: true
  })
  
  const [deleteOptions, setDeleteOptions] = useState({
    deleteData: false
  })
  
  const [showPassword, setShowPassword] = useState(false)

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
      
      const response = await fetch('/api/admin/update-user-role', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: selectedUser.id,
          newRole: newRole
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update user role')
      }

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
      // You might want to show a toast notification here
    } finally {
      setUpdating(false)
    }
  }

  const handleCreateUser = async () => {
    try {
      setCreating(true)
      
      const response = await fetch('/api/admin/users/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newUserForm)
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create user')
      }

      // Add new user to local state
      setUsers([...users, data.user])
      
      // Reset form
      setNewUserForm({
        email: '',
        password: '',
        full_name: '',
        username: '',
        role: 'free',
        send_welcome_email: true
      })
      
      setShowCreateDialog(false)
    } catch (error) {
      console.error('Error creating user:', error)
      // You might want to show a toast notification here
    } finally {
      setCreating(false)
    }
  }

  const handleEditUser = async () => {
    if (!selectedUser) return

    try {
      setEditing(true)
      
      const response = await fetch('/api/admin/users/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: selectedUser.id,
          ...editUserForm
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update user')
      }

      // Update local state
      setUsers(users.map(user => 
        user.id === selectedUser.id 
          ? { ...user, ...data.user }
          : user
      ))

      setShowEditDialog(false)
      setSelectedUser(null)
    } catch (error) {
      console.error('Error updating user:', error)
      // You might want to show a toast notification here
    } finally {
      setEditing(false)
    }
  }

  const handleDeleteUser = async () => {
    if (!selectedUser) return

    try {
      setDeleting(true)
      
      const response = await fetch('/api/admin/users/delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: selectedUser.id,
          deleteData: deleteOptions.deleteData
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to delete user')
      }

      // Remove user from local state
      setUsers(users.filter(user => user.id !== selectedUser.id))

      setShowDeleteDialog(false)
      setSelectedUser(null)
      setDeleteOptions({ deleteData: false })
    } catch (error) {
      console.error('Error deleting user:', error)
      // You might want to show a toast notification here
    } finally {
      setDeleting(false)
    }
  }

  const filteredUsers = users.filter(user => {
    // Search term filter
    const matchesSearch = 
      user.displayEmail?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.username?.toLowerCase().includes(searchTerm.toLowerCase())
    
    // Role filter
    const matchesRole = roleFilter === 'all' || user.role === roleFilter
    
    // Status filter
    const matchesStatus = 
      statusFilter === 'all' || 
      (statusFilter === 'online' && user.isOnline) ||
      (statusFilter === 'offline' && !user.isOnline)
    
    return matchesSearch && matchesRole && matchesStatus
  })

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
                  onClick={() => setShowCreateDialog(true)}
                  size="sm"
                  className="flex items-center space-x-2"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>Create User</span>
                </Button>
                
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

            {/* Filter Controls */}
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <Label htmlFor="role-filter" className="text-sm font-medium">
                  Role:
                </Label>
                <Select value={roleFilter} onValueChange={setRoleFilter}>
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Roles</SelectItem>
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

              <div className="flex items-center space-x-2">
                <Label htmlFor="status-filter" className="text-sm font-medium">
                  Status:
                </Label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Users</SelectItem>
                    <SelectItem value="online">
                      <div className="flex items-center space-x-2">
                        <Circle className="w-3 h-3 text-green-500 fill-green-500" />
                        <span>Online</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="offline">
                      <div className="flex items-center space-x-2">
                        <Circle className="w-3 h-3 text-red-500 fill-red-500" />
                        <span>Offline</span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Clear Filters Button */}
              {(roleFilter !== 'all' || statusFilter !== 'all' || searchTerm) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setRoleFilter('all')
                    setStatusFilter('all')
                    setSearchTerm('')
                  }}
                  className="text-muted-foreground hover:text-foreground"
                >
                  Clear Filters
                </Button>
              )}
            </div>

            {/* Filter Summary */}
            {(roleFilter !== 'all' || statusFilter !== 'all' || searchTerm) && (
              <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg border border-border">
                <div className="text-sm text-muted-foreground">
                  Showing {filteredUsers.length} of {totalCount} users
                  {roleFilter !== 'all' && ` • Role: ${getRoleInfo(roleFilter as UserRole)?.description || roleFilter}`}
                  {statusFilter !== 'all' && ` • Status: ${statusFilter}`}
                  {searchTerm && ` • Search: "${searchTerm}"`}
                </div>
                <Badge variant="secondary" className="text-xs">
                  {filteredUsers.length} results
                </Badge>
              </div>
            )}

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
                      <div className="flex space-x-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setSelectedUser(user)
                            setEditUserForm({
                              email: user.email,
                              full_name: user.full_name || '',
                              username: user.username || '',
                              role: (user.role as UserRole) || 'free',
                              password: '',
                              email_confirm: true
                            })
                            setShowEditDialog(true)
                          }}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
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
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          onClick={() => {
                            setSelectedUser(user)
                            setShowDeleteDialog(true)
                          }}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Update Role Dialog */}
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

      {/* Create User Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create New User</DialogTitle>
            <DialogDescription>
              Add a new user to the system
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email *</Label>
              <Input
                id="email"
                type="email"
                value={newUserForm.email}
                onChange={(e) => setNewUserForm({ ...newUserForm, email: e.target.value })}
                placeholder="user@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password *</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={newUserForm.password}
                  onChange={(e) => setNewUserForm({ ...newUserForm, password: e.target.value })}
                  placeholder="Enter password"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="full_name">Full Name</Label>
              <Input
                id="full_name"
                value={newUserForm.full_name}
                onChange={(e) => setNewUserForm({ ...newUserForm, full_name: e.target.value })}
                placeholder="John Doe"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                value={newUserForm.username}
                onChange={(e) => setNewUserForm({ ...newUserForm, username: e.target.value })}
                placeholder="johndoe"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new_role">Role</Label>
              <Select value={newUserForm.role} onValueChange={(value: UserRole) => setNewUserForm({ ...newUserForm, role: value })}>
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
            <div className="flex items-center space-x-2">
              <Switch
                id="send_welcome_email"
                checked={newUserForm.send_welcome_email}
                onCheckedChange={(checked) => setNewUserForm({ ...newUserForm, send_welcome_email: checked })}
              />
              <Label htmlFor="send_welcome_email">Send welcome email</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateUser} disabled={creating || !newUserForm.email || !newUserForm.password}>
              {creating && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Create User
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>
              Update user information for {selectedUser?.full_name || selectedUser?.email}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit_email">Email</Label>
              <Input
                id="edit_email"
                type="email"
                value={editUserForm.email}
                onChange={(e) => setEditUserForm({ ...editUserForm, email: e.target.value })}
                placeholder="user@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit_full_name">Full Name</Label>
              <Input
                id="edit_full_name"
                value={editUserForm.full_name}
                onChange={(e) => setEditUserForm({ ...editUserForm, full_name: e.target.value })}
                placeholder="John Doe"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit_username">Username</Label>
              <Input
                id="edit_username"
                value={editUserForm.username}
                onChange={(e) => setEditUserForm({ ...editUserForm, username: e.target.value })}
                placeholder="johndoe"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit_role">Role</Label>
              <Select value={editUserForm.role} onValueChange={(value: UserRole) => setEditUserForm({ ...editUserForm, role: value })}>
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
            <div className="space-y-2">
              <Label htmlFor="edit_password">New Password (optional)</Label>
              <div className="relative">
                <Input
                  id="edit_password"
                  type={showPassword ? "text" : "password"}
                  value={editUserForm.password}
                  onChange={(e) => setEditUserForm({ ...editUserForm, password: e.target.value })}
                  placeholder="Leave blank to keep current password"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Switch
                id="edit_email_confirm"
                checked={editUserForm.email_confirm}
                onCheckedChange={(checked) => setEditUserForm({ ...editUserForm, email_confirm: checked })}
              />
              <Label htmlFor="edit_email_confirm">Email confirmed</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleEditUser} disabled={editing}>
              {editing && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Update User
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete User Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete User</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete {selectedUser?.full_name || selectedUser?.email}?
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-start space-x-2">
                <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5" />
                <div className="text-sm text-red-800">
                  <p className="font-semibold mb-1">Warning: This action cannot be undone</p>
                  <p>Deleting a user will:</p>
                  <ul className="list-disc list-inside mt-2 space-y-1">
                    <li>Remove the user's account permanently</li>
                    <li>Delete all their workflows and data (if selected)</li>
                    <li>Remove them from all organizations</li>
                  </ul>
                </div>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Switch
                id="delete_data"
                checked={deleteOptions.deleteData}
                onCheckedChange={(checked) => setDeleteOptions({ ...deleteOptions, deleteData: checked })}
              />
              <Label htmlFor="delete_data" className="text-sm">
                Also delete all user data (workflows, integrations, etc.)
              </Label>
            </div>
            <p className="text-sm text-muted-foreground">
              {deleteOptions.deleteData 
                ? "This will permanently delete the user and ALL their data."
                : "This will disable the user account but preserve their data."
              }
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleDeleteUser} 
              disabled={deleting}
            >
              {deleting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {deleteOptions.deleteData ? "Delete User & Data" : "Disable User"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
} 