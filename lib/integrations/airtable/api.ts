export interface AirtableBaseInfo {
  id: string
  name: string
  permissionLevel?: string
}

export async function listAirtableBases(accessToken: string): Promise<AirtableBaseInfo[]> {
  const url = "https://api.airtable.com/v0/meta/bases"
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
  })
  if (!res.ok) {
    try {
      const err = await res.json()
      // eslint-disable-next-line no-console
      console.error("Airtable list bases error:", err)
    } catch {}
    throw new Error(`Failed to list Airtable bases (status ${res.status})`)
  }
  const data = await res.json()
  const bases: AirtableBaseInfo[] = Array.isArray(data?.bases)
    ? data.bases.map((b: any) => ({ id: b.id, name: b.name, permissionLevel: b.permissionLevel }))
    : []
  return bases
}


