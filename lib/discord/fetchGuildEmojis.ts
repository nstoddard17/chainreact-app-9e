export async function fetchGuildEmojis(guildId: string) {
  const res = await fetch(`/api/discord/guilds/${guildId}/emojis`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.map((e: any) => ({
    ...e,
    custom: true,
    url: `https://cdn.discordapp.com/emojis/${e.id}${e.animated ? ".gif" : ".png"}`,
  }));
} 