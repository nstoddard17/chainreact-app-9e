import { Client, GuildMember, Invite, Collection } from "discord.js"
import { createSupabaseServerClient } from "@/utils/supabase/server"

interface InviteData {
  code: string
  uses: number
  inviterId?: string
  maxUses?: number
  maxAge?: number
}

class DiscordInviteTracker {
  private client: Client
  private inviteCache: Map<string, Map<string, InviteData>> = new Map()
  private isInitialized: boolean = false
  private static instance: DiscordInviteTracker | null = null

  private constructor() {
    this.client = new Client({
      intents: [
        "Guilds",
        "GuildMembers",
        "GuildInvites",
        "GuildMessages",
        "MessageContent"
      ]
    })

    this.setupEventListeners()
  }

  static getInstance(): DiscordInviteTracker {
    if (!DiscordInviteTracker.instance) {
      DiscordInviteTracker.instance = new DiscordInviteTracker()
    }
    return DiscordInviteTracker.instance
  }

  private setupEventListeners() {
    // Bot is ready
    this.client.once("ready", async () => {
      console.log(`Discord Invite Tracker Bot logged in as ${this.client.user?.tag}`)
      await this.cacheAllInvites()
      this.isInitialized = true
    })

    // Cache invites when bot joins a new guild
    this.client.on("guildCreate", async (guild) => {
      await this.cacheGuildInvites(guild.id)
    })

    // Update cache when new invite is created
    this.client.on("inviteCreate", async (invite) => {
      if (!invite.guild) return

      const guildInvites = this.inviteCache.get(invite.guild.id) || new Map()
      guildInvites.set(invite.code, {
        code: invite.code,
        uses: invite.uses || 0,
        inviterId: invite.inviter?.id,
        maxUses: invite.maxUses || undefined,
        maxAge: invite.maxAge || undefined
      })
      this.inviteCache.set(invite.guild.id, guildInvites)
    })

    // Remove from cache when invite is deleted
    this.client.on("inviteDelete", (invite) => {
      if (!invite.guild) return

      const guildInvites = this.inviteCache.get(invite.guild.id)
      if (guildInvites) {
        guildInvites.delete(invite.code)
      }
    })

    // Track when a member joins
    this.client.on("guildMemberAdd", async (member: GuildMember) => {
      await this.handleMemberJoin(member)
    })
  }

  private async cacheAllInvites() {
    const guilds = this.client.guilds.cache
    for (const [guildId] of guilds) {
      await this.cacheGuildInvites(guildId)
    }
  }

  private async cacheGuildInvites(guildId: string) {
    try {
      const guild = await this.client.guilds.fetch(guildId)
      const invites = await guild.invites.fetch()

      const inviteMap = new Map<string, InviteData>()
      invites.forEach((invite) => {
        inviteMap.set(invite.code, {
          code: invite.code,
          uses: invite.uses || 0,
          inviterId: invite.inviter?.id,
          maxUses: invite.maxUses || undefined,
          maxAge: invite.maxAge || undefined
        })
      })

      this.inviteCache.set(guildId, inviteMap)
    } catch (error) {
      console.error(`Failed to cache invites for guild ${guildId}:`, error)
    }
  }

  private async handleMemberJoin(member: GuildMember) {
    try {
      const guildId = member.guild.id
      const oldInvites = this.inviteCache.get(guildId)
      if (!oldInvites) return

      // Fetch current invites
      const currentInvites = await member.guild.invites.fetch()

      // Find which invite was used by comparing uses
      let usedInvite: Invite | undefined

      currentInvites.forEach((invite) => {
        const oldInvite = oldInvites.get(invite.code)
        if (oldInvite && invite.uses && invite.uses > oldInvite.uses) {
          usedInvite = invite
        }
      })

      // Update cache with new invite data
      const newInviteMap = new Map<string, InviteData>()
      currentInvites.forEach((invite) => {
        newInviteMap.set(invite.code, {
          code: invite.code,
          uses: invite.uses || 0,
          inviterId: invite.inviter?.id,
          maxUses: invite.maxUses || undefined,
          maxAge: invite.maxAge || undefined
        })
      })
      this.inviteCache.set(guildId, newInviteMap)

      if (usedInvite) {
        console.log(`Member ${member.user.tag} joined using invite ${usedInvite.code}`)

        // Check for role assignment based on invite
        await this.assignRoleBasedOnInvite(member, usedInvite.code)

        // Trigger workflows for member join with invite data
        await this.triggerMemberJoinWorkflow(member, usedInvite)
      } else {
        // Check if it's a vanity URL or direct invite
        console.log(`Member ${member.user.tag} joined but couldn't determine invite used`)

        // Still trigger workflow but without invite data
        await this.triggerMemberJoinWorkflow(member, null)
      }
    } catch (error) {
      console.error("Error handling member join:", error)
    }
  }

  private async assignRoleBasedOnInvite(member: GuildMember, inviteCode: string) {
    try {
      const supabase = await createSupabaseServerClient()

      // Check for hardcoded config first (for internal use)
      if (
        process.env.DISCORD_AUTO_ROLE_INVITE &&
        process.env.DISCORD_AUTO_ROLE_ID &&
        process.env.DISCORD_GUILD_ID &&
        inviteCode === process.env.DISCORD_AUTO_ROLE_INVITE &&
        member.guild.id === process.env.DISCORD_GUILD_ID
      ) {
        const roleId = process.env.DISCORD_AUTO_ROLE_ID

        try {
          await member.roles.add(roleId)
          console.log(`Assigned role ${roleId} to ${member.user.tag} via hardcoded config`)
        } catch (error) {
          console.error(`Failed to assign role ${roleId}:`, error)
        }
        return
      }

      // Check database for invite-role mapping
      const { data: mapping } = await supabase
        .from("discord_invite_roles")
        .select("role_id")
        .eq("server_id", member.guild.id)
        .eq("invite_code", inviteCode)
        .single()

      if (mapping) {
        try {
          await member.roles.add(mapping.role_id)
          console.log(`Assigned role ${mapping.role_id} to ${member.user.tag} based on invite ${inviteCode}`)
        } catch (error) {
          console.error(`Failed to assign role ${mapping.role_id}:`, error)
        }
      }
    } catch (error) {
      console.error("Error assigning role based on invite:", error)
    }
  }

  private async triggerMemberJoinWorkflow(member: GuildMember, invite: Invite | null) {
    try {
      const supabase = await createSupabaseServerClient()

      // Find workflows with Discord member join trigger
      const { data: workflows } = await supabase
        .from("workflows")
        .select("*")
        .eq("status", "active")
        .contains("nodes", [{ type: "discord_trigger_member_join" }])

      if (!workflows || workflows.length === 0) return

      // Prepare trigger data
      const triggerData = {
        memberId: member.id,
        memberTag: member.user.tag,
        memberUsername: member.user.username,
        memberDiscriminator: member.user.discriminator,
        memberAvatar: member.user.avatar,
        guildId: member.guild.id,
        guildName: member.guild.name,
        joinedAt: member.joinedAt?.toISOString(),
        inviteCode: invite?.code || null,
        inviteUrl: invite?.code ? `https://discord.gg/${invite.code}` : null,
        inviterTag: invite?.inviter?.tag || null,
        inviterId: invite?.inviter?.id || null,
        inviteUses: invite?.uses || null,
        inviteMaxUses: invite?.maxUses || null,
        timestamp: new Date().toISOString()
      }

      // Execute workflows
      for (const workflow of workflows) {
        // Check if workflow trigger matches the guild
        const triggerNode = workflow.nodes.find((n: any) => n.type === "discord_trigger_member_join")
        if (!triggerNode) continue

        // Check if guild matches (if specified in trigger config)
        if (triggerNode.data?.guildId && triggerNode.data.guildId !== member.guild.id) {
          continue
        }

        // Check invite filter if specified
        if (triggerNode.data?.inviteFilter && triggerNode.data.inviteFilter !== invite?.code) {
          continue
        }

        // Execute workflow
        const executionResponse = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/workflow/execute`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${process.env.WORKFLOW_EXECUTION_SECRET}`
          },
          body: JSON.stringify({
            workflowId: workflow.id,
            triggerData,
            triggeredBy: "discord_member_join"
          })
        })

        if (!executionResponse.ok) {
          console.error(`Failed to trigger workflow ${workflow.id} for member join`)
        }
      }
    } catch (error) {
      console.error("Error triggering member join workflow:", error)
    }
  }

  async initialize() {
    if (this.isInitialized) {
      console.log("Discord Invite Tracker already initialized")
      return
    }

    const token = process.env.DISCORD_BOT_TOKEN
    if (!token) {
      console.error("Discord bot token not found in environment variables")
      return
    }

    try {
      await this.client.login(token)
    } catch (error) {
      console.error("Failed to initialize Discord Invite Tracker:", error)
    }
  }

  async shutdown() {
    if (this.client) {
      await this.client.destroy()
      this.isInitialized = false
    }
  }

  // Public method to get current invite data for a guild
  async getGuildInvites(guildId: string): Promise<InviteData[]> {
    const invites = this.inviteCache.get(guildId)
    return invites ? Array.from(invites.values()) : []
  }

  // Public method to manually refresh invite cache for a guild
  async refreshGuildInvites(guildId: string) {
    await this.cacheGuildInvites(guildId)
  }
}

export const discordInviteTracker = DiscordInviteTracker.getInstance()