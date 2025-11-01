"use client"

import { useState, useEffect } from 'react'
import { logger } from '@/lib/utils/logger'

export interface WorkspaceOption {
  type: 'personal' | 'team' | 'organization'
  id: string | null // null for personal workspace
  name: string
  description?: string
}

/**
 * Hook to fetch available workspaces for the current user
 * Returns personal workspace + teams + organizations
 */
export function useWorkspaces() {
  const [workspaces, setWorkspaces] = useState<WorkspaceOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchWorkspaces()
  }, [])

  const fetchWorkspaces = async () => {
    setLoading(true)
    setError(null)

    try {
      // Fetch teams and organizations in parallel
      const [teamsResponse, orgsResponse] = await Promise.all([
        fetch('/api/teams/my-teams'),
        fetch('/api/organizations')
      ])

      if (!teamsResponse.ok) {
        throw new Error('Failed to fetch teams')
      }

      if (!orgsResponse.ok) {
        throw new Error('Failed to fetch organizations')
      }

      const teamsData = await teamsResponse.json()
      const orgsData = await orgsResponse.json()

      const teams = teamsData.teams || []
      const organizations = orgsData.data?.organizations || []

      // Build workspace options
      const options: WorkspaceOption[] = [
        // Personal workspace (always first)
        {
          type: 'personal',
          id: null,
          name: 'Personal Workspace',
          description: 'Your private workspace'
        }
      ]

      // Add teams
      teams.forEach((team: any) => {
        options.push({
          type: 'team',
          id: team.id,
          name: team.name,
          description: team.description || `Team workspace`
        })
      })

      // Add organizations
      organizations.forEach((org: any) => {
        options.push({
          type: 'organization',
          id: org.id,
          name: org.name,
          description: org.description || 'Organization workspace'
        })
      })

      setWorkspaces(options)
      logger.debug('[useWorkspaces] Fetched workspaces:', {
        total: options.length,
        teams: teams.length,
        orgs: organizations.length
      })

    } catch (err: any) {
      logger.error('[useWorkspaces] Error fetching workspaces:', err)
      setError(err.message || 'Failed to fetch workspaces')
      // On error, at least show personal workspace
      setWorkspaces([
        {
          type: 'personal',
          id: null,
          name: 'Personal Workspace',
          description: 'Your private workspace'
        }
      ])
    } finally {
      setLoading(false)
    }
  }

  return {
    workspaces,
    loading,
    error,
    refetch: fetchWorkspaces
  }
}
