import fetchMock from 'jest-fetch-mock'

jest.mock('@/lib/workflows/actions/core/getDecryptedAccessToken', () => ({
  getDecryptedAccessToken: jest.fn()
}))

import { hubspotGetDeals } from '@/lib/workflows/actions/hubspot/getDeals'
import { getDecryptedAccessToken } from '@/lib/workflows/actions/core/getDecryptedAccessToken'

const mockedGetToken = getDecryptedAccessToken as jest.MockedFunction<typeof getDecryptedAccessToken>

beforeAll(() => {
  fetchMock.enableMocks()
})

afterEach(() => {
  fetchMock.resetMocks()
  jest.clearAllMocks()
})

const baseContext: any = {
  userId: 'user-123',
  dataFlowManager: {
    resolveVariable: (value: any) => value
  }
}

describe('hubspotGetDeals', () => {
  it('builds payload with advanced filters, sort, and cursor', async () => {
    mockedGetToken.mockResolvedValue('token')
    fetchMock.mockResponseOnce(JSON.stringify({ results: [] }))

    await hubspotGetDeals(
      {
        limit: 25,
        after: 'cursor-1',
        sortProperty: 'closedate',
        sortDirection: 'DESCENDING',
        advancedFilters: [
          { id: '1', property: 'amount', operator: 'GT', value: '5000' },
          { id: '2', property: 'closedate', operator: 'BETWEEN', value: '2024-01-01', valueTo: '2024-12-31' },
          { id: '3', property: 'hs_lead_status', operator: 'IN', value: 'qualified,open' }
        ],
        properties: ['dealname']
      },
      baseContext
    )

    const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string)
    expect(body.limit).toBe(25)
    expect(body.after).toBe('cursor-1')
    expect(body.sorts[0]).toEqual({ propertyName: 'closedate', direction: 'DESCENDING' })
    expect(body.filterGroups[0].filters).toEqual([
      { propertyName: 'amount', operator: 'GT', value: '5000' },
      { propertyName: 'closedate', operator: 'BETWEEN', value: '2024-01-01', highValue: '2024-12-31' },
      { propertyName: 'hs_lead_status', operator: 'IN', values: ['qualified', 'open'] }
    ])
  })

  it('returns paging metadata from response', async () => {
    mockedGetToken.mockResolvedValue('token')
    fetchMock.mockResponseOnce(JSON.stringify({
      results: [{ id: '1' }],
      total: 10,
      paging: { next: { after: 'cursor-2' } }
    }))

    const result = await hubspotGetDeals(
      {
        limit: 10,
        properties: ['dealname']
      },
      baseContext
    )

    expect(result.output?.nextCursor).toBe('cursor-2')
    expect(result.output?.hasMore).toBe(true)
    expect(result.output?.total).toBe(10)
  })
})

