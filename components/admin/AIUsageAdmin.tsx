'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { ProfessionalSearch } from '@/components/ui/professional-search'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Input } from '@/components/ui/input'
import {
  Users,
  TrendingUp,
  DollarSign,
  Activity,
  Search,
  Settings,
  AlertCircle,
  Download,
  RefreshCw,
  MoreHorizontal,
  RotateCcw,
  Edit
} from 'lucide-react'
import AIUsageTest from './AIUsageTest'
import WorkflowCostTest from './WorkflowCostTest'

import { logger } from '@/lib/utils/logger'

interface UserUsage {
  user_id: string
  email: string
  username: string
  today: {
    requests: number
    tokens: number
    cost_usd: number
  }
  current_month: {
    requests: number
    tokens: number
    cost_usd: number
  }
  all_time: {
    requests: number
    tokens: number
    cost_usd: number
  }
  budget: {
    monthly_limit_usd: number
    usage_percent: number
    enforcement_mode: 'soft' | 'hard' | 'none'
  }
}

interface AdminStats {
  total_users: number
  active_users_today: number
  total_cost_today: number
  total_cost_month: number
  users_over_75_percent: number
  users_over_90_percent: number
  users_at_limit: number
}

export default function AIUsageAdmin() {
  const [users, setUsers] = useState<UserUsage[]>([])
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [sortBy, setSortBy] = useState<'cost_month' | 'cost_today' | 'usage_percent'>('cost_month')
  const [selectedUser, setSelectedUser] = useState<UserUsage | null>(null)
  const [budgetDialogOpen, setBudgetDialogOpen] = useState(false)
  const [newBudget, setNewBudget] = useState('')
  const [newEnforcement, setNewEnforcement] = useState<'soft' | 'hard'>('soft')
  const [balanceDialogOpen, setBalanceDialogOpen] = useState(false)
  const [balanceAction, setBalanceAction] = useState<'reset' | 'set'>('set')
  const [newBalance, setNewBalance] = useState('')

  useEffect(() => {
    fetchUsageData()
    // Refresh every minute
    const interval = setInterval(fetchUsageData, 60000)
    return () => clearInterval(interval)
  }, [])

  const fetchUsageData = async () => {
    try {
      const response = await fetch('/api/admin/ai-usage')
      if (!response.ok) throw new Error('Failed to fetch usage data')
      const data = await response.json()
      setUsers(data.users)
      setStats(data.stats)
    } catch (error) {
      logger.error('Error fetching admin usage data:', error)
    } finally {
      setLoading(false)
    }
  }

  const updateUserBudget = async () => {
    if (!selectedUser || !newBudget) return

    try {
      const response = await fetch(`/api/admin/ai-usage/budget`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: selectedUser.user_id,
          monthly_budget_usd: parseFloat(newBudget),
          enforcement_mode: newEnforcement
        })
      })

      if (response.ok) {
        await fetchUsageData()
        setBudgetDialogOpen(false)
        setSelectedUser(null)
        setNewBudget('')
      }
    } catch (error) {
      logger.error('Error updating budget:', error)
    }
  }

  const updateUserBalance = async () => {
    if (!selectedUser) return
    if (balanceAction === 'set' && !newBalance) return

    try {
      const response = await fetch('/api/admin/ai-usage/balance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: selectedUser.user_id,
          action: balanceAction,
          amount: balanceAction === 'set' ? parseFloat(newBalance) : undefined
        })
      })

      if (response.ok) {
        const data = await response.json()
        logger.debug('Balance updated:', data)
        await fetchUsageData()
        setBalanceDialogOpen(false)
        setSelectedUser(null)
        setNewBalance('')
      }
    } catch (error) {
      logger.error('Error updating balance:', error)
    }
  }

  const exportData = () => {
    const csv = [
      ['Email', 'Username', 'Today Requests', 'Today Cost', 'Month Requests', 'Month Cost', 'All Time Cost', 'Usage %', 'Budget', 'Mode'],
      ...users.map(u => [
        u.email,
        u.username,
        u.today.requests,
        u.today.cost_usd.toFixed(4),
        u.current_month.requests,
        u.current_month.cost_usd.toFixed(4),
        u.all_time.cost_usd.toFixed(4),
        u.budget.usage_percent,
        u.budget.monthly_limit_usd,
        u.budget.enforcement_mode
      ])
    ].map(row => row.join(',')).join('\n')

    const blob = new Blob([csv], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ai-usage-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
  }

  // Filter and sort users
  const filteredUsers = users
    .filter(user => 
      user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.username?.toLowerCase().includes(searchTerm.toLowerCase())
    )
    .sort((a, b) => {
      switch (sortBy) {
        case 'cost_today':
          return b.today.cost_usd - a.today.cost_usd
        case 'usage_percent':
          return b.budget.usage_percent - a.budget.usage_percent
        default:
          return b.current_month.cost_usd - a.current_month.cost_usd
      }
    })

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="grid grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-24 bg-gray-200 rounded"></div>
            ))}
          </div>
          <div className="h-96 bg-gray-200 rounded"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Test Components */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <AIUsageTest />
        <WorkflowCostTest />
      </div>

      {/* Statistics Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Users className="h-4 w-4" />
                Active Users
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.active_users_today}</div>
              <p className="text-xs text-muted-foreground">of {stats.total_users} total</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <DollarSign className="h-4 w-4" />
                Today's Cost
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${stats.total_cost_today.toFixed(2)}</div>
              <p className="text-xs text-muted-foreground">across all users</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Month's Cost
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${stats.total_cost_month.toFixed(2)}</div>
              <p className="text-xs text-muted-foreground">current billing period</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Activity className="h-4 w-4" />
                Usage Alerts
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span>Over 75%:</span>
                  <span className="font-medium">{stats.users_over_75_percent}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span>Over 90%:</span>
                  <span className="font-medium text-orange-600">{stats.users_over_90_percent}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span>At limit:</span>
                  <span className="font-medium text-red-600">{stats.users_at_limit}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Alerts for users at/near limits */}
      {stats && stats.users_at_limit > 0 && (
        <Alert className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <strong>{stats.users_at_limit} users</strong> have reached their monthly limit.
            Consider reviewing their budgets or upgrading their plans.
          </AlertDescription>
        </Alert>
      )}

      {/* Controls */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>User Usage Details</CardTitle>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={fetchUsageData}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
              <Button variant="outline" size="sm" onClick={exportData}>
                <Download className="h-4 w-4 mr-2" />
                Export CSV
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Search and Sort */}
          <div className="flex gap-4 mb-4">
            <div className="relative flex-1">
              <ProfessionalSearch
                placeholder="Search by email or username..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onClear={() => setSearchTerm('')}
              />
            </div>
            <Select value={sortBy} onValueChange={(v: any) => setSortBy(v)}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Sort by..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cost_month">Month Cost</SelectItem>
                <SelectItem value="cost_today">Today Cost</SelectItem>
                <SelectItem value="usage_percent">Usage %</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Users Table */}
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Today</TableHead>
                  <TableHead>This Month</TableHead>
                  <TableHead>All Time</TableHead>
                  <TableHead>Usage</TableHead>
                  <TableHead>Budget</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.map((user) => (
                  <TableRow key={user.user_id}>
                    <TableCell>
                      <div>
                        <div className="font-medium">{user.email}</div>
                        {user.username && (
                          <div className="text-xs text-muted-foreground">@{user.username}</div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        <div>{user.today.requests} reqs</div>
                        <div className="text-xs text-muted-foreground">
                          ${user.today.cost_usd.toFixed(4)}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        <div>{user.current_month.requests} reqs</div>
                        <div className="text-xs text-muted-foreground">
                          ${user.current_month.cost_usd.toFixed(4)}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        <div>{(user.all_time.tokens / 1000).toFixed(1)}k tokens</div>
                        <div className="text-xs text-muted-foreground">
                          ${user.all_time.cost_usd.toFixed(2)}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <div className="text-sm font-medium">{user.budget.usage_percent}%</div>
                        {user.budget.usage_percent >= 100 && (
                          <Badge variant="destructive" className="text-xs">Limit</Badge>
                        )}
                        {user.budget.usage_percent >= 90 && user.budget.usage_percent < 100 && (
                          <Badge variant="secondary" className="text-xs bg-orange-100">Alert</Badge>
                        )}
                        {user.budget.usage_percent >= 75 && user.budget.usage_percent < 90 && (
                          <Badge variant="secondary" className="text-xs bg-yellow-100">Warn</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        <div>${user.budget.monthly_limit_usd}/mo</div>
                        <Badge variant="outline" className="text-xs">
                          {user.budget.enforcement_mode}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Actions</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => {
                              setSelectedUser(user)
                              setNewBudget(user.budget.monthly_limit_usd.toString())
                              setNewEnforcement(user.budget.enforcement_mode === 'hard' ? 'hard' : 'soft')
                              setBudgetDialogOpen(true)
                            }}
                          >
                            <Settings className="h-4 w-4 mr-2" />
                            Edit Budget
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => {
                              setSelectedUser(user)
                              setBalanceAction('set')
                              setNewBalance(user.current_month.cost_usd.toString())
                              setBalanceDialogOpen(true)
                            }}
                          >
                            <Edit className="h-4 w-4 mr-2" />
                            Set Balance
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => {
                              setSelectedUser(user)
                              setBalanceAction('reset')
                              setBalanceDialogOpen(true)
                            }}
                            className="text-destructive"
                          >
                            <RotateCcw className="h-4 w-4 mr-2" />
                            Reset Balance
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Budget Edit Dialog */}
      <Dialog open={budgetDialogOpen} onOpenChange={setBudgetDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit User Budget</DialogTitle>
            <DialogDescription>
              Adjust monthly budget and enforcement mode for {selectedUser?.email}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="budget">Monthly Budget (USD)</Label>
              <Input
                id="budget"
                type="number"
                step="0.01"
                value={newBudget}
                onChange={(e) => setNewBudget(e.target.value)}
                placeholder="10.00"
              />
            </div>
            <div>
              <Label htmlFor="enforcement">Enforcement Mode</Label>
              <Select value={newEnforcement} onValueChange={(v: any) => setNewEnforcement(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="soft">Soft (Warning only)</SelectItem>
                  <SelectItem value="hard">Hard (Block at 100%)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBudgetDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={updateUserBudget}>
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Balance Management Dialog */}
      <Dialog open={balanceDialogOpen} onOpenChange={setBalanceDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {balanceAction === 'reset' ? 'Reset User Balance' : 'Set User Balance'}
            </DialogTitle>
            <DialogDescription>
              {balanceAction === 'reset'
                ? `Reset the current month balance to $0.00 for ${selectedUser?.email}`
                : `Set a specific balance amount for ${selectedUser?.email}`
              }
            </DialogDescription>
          </DialogHeader>
          {balanceAction === 'set' && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="balance">New Balance (USD)</Label>
                <Input
                  id="balance"
                  type="number"
                  step="0.01"
                  value={newBalance}
                  onChange={(e) => setNewBalance(e.target.value)}
                  placeholder="0.00"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Current balance: ${selectedUser?.current_month.cost_usd.toFixed(4)}
                </p>
              </div>
            </div>
          )}
          {balanceAction === 'reset' && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                This will delete all AI usage records for this user in the current month.
                This action cannot be undone.
              </AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setBalanceDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={updateUserBalance}
              variant={balanceAction === 'reset' ? 'destructive' : 'default'}
            >
              {balanceAction === 'reset' ? 'Reset Balance' : 'Set Balance'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
