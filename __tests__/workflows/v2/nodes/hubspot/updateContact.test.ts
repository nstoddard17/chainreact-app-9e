import fetchMock from 'jest-fetch-mock'

jest.mock('@/lib/workflows/actions/core/getDecryptedAccessToken', () => ({
  getDecryptedAccessToken: jest.fn()
}))

import { hubspotUpdateContact } from '@/lib/workflows/actions/hubspot/updateContact'
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

describe('hubspotUpdateContact', () => {
  it('includes custom dynamic properties in update payload', async () => {
    mockedGetToken.mockResolvedValue('token')
    fetchMock.mockResponseOnce(JSON.stringify({
      id: '123',
      properties: { email: 'john@example.com' },
      updatedAt: '2025-01-01T00:00:00.000Z'
    }))

    await hubspotUpdateContact(
      {
        contactSelectionMode: 'picker',
        contactId: '123',
        firstname: 'John',
        customProperties: {
          favorite_color: 'Blue'
        }
      },
      baseContext
    )

    const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string)
    expect(body.properties.firstname).toBe('John')
    expect(body.properties.favorite_color).toBe('Blue')
  })

  it('finds contact by email before updating', async () => {
    mockedGetToken.mockResolvedValue('token')
    fetchMock
      .mockResponseOnce(JSON.stringify({ results: [{ id: '456' }] })) // search
      .mockResponseOnce(JSON.stringify({
        id: '456',
        properties: {},
        updatedAt: '2025-01-01T00:00:00.000Z'
      }))

    await hubspotUpdateContact(
      {
        contactSelectionMode: 'email',
        lookupEmail: 'found@example.com',
        phone: '123-456-7890'
      },
      baseContext
    )

    expect(fetchMock.mock.calls[0][0]).toBe('https://api.hubapi.com/crm/v3/objects/contacts/search')
    expect(fetchMock.mock.calls[1][0]).toBe('https://api.hubapi.com/crm/v3/objects/contacts/456')
  })

  it('creates contact when not found and createIfNotFound enabled', async () => {
    mockedGetToken.mockResolvedValue('token')
    fetchMock
      .mockResponseOnce(JSON.stringify({ results: [] })) // search returns nothing
      .mockResponseOnce(JSON.stringify({ id: '789', properties: { email: 'new@example.com' } })) // create
      .mockResponseOnce(JSON.stringify({ id: '789', properties: {}, updatedAt: '2025-01-01T00:00:00.000Z' })) // patch

    await hubspotUpdateContact(
      {
        contactSelectionMode: 'email',
        lookupEmail: 'new@example.com',
        createIfNotFound: true,
        lastname: 'Smith'
      },
      baseContext
    )

    expect(fetchMock.mock.calls[1][0]).toBe('https://api.hubapi.com/crm/v3/objects/contacts')
    expect(fetchMock.mock.calls[2][0]).toBe('https://api.hubapi.com/crm/v3/objects/contacts/789')
    const createBody = JSON.parse(fetchMock.mock.calls[1][1]?.body as string)
    expect(createBody.properties.email).toBe('new@example.com')
  })
})

