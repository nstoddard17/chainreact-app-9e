import fetchMock from 'jest-fetch-mock'

jest.mock('@/lib/workflows/actions/core/getDecryptedAccessToken', () => ({
  getDecryptedAccessToken: jest.fn()
}))

jest.mock('@/lib/storage/fileStorage', () => ({
  FileStorageService: {
    getFile: jest.fn()
  }
}))

import { hubspotCreateTicket } from '@/lib/workflows/actions/hubspot/createTicket'
import { getDecryptedAccessToken } from '@/lib/workflows/actions/core/getDecryptedAccessToken'
import { FileStorageService } from '@/lib/storage/fileStorage'

const mockedGetToken = getDecryptedAccessToken as jest.MockedFunction<typeof getDecryptedAccessToken>
const mockedGetFile = FileStorageService.getFile as jest.MockedFunction<typeof FileStorageService.getFile>

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

describe('hubspotCreateTicket', () => {
  it('sends hs_ticket_status and custom properties in payload', async () => {
    mockedGetToken.mockResolvedValue('token')
    fetchMock.mockResponseOnce(
      JSON.stringify({
        id: '1',
        properties: { subject: 'Hi' },
        createdAt: '2024-01-01T00:00:00.000Z'
      })
    )

    await hubspotCreateTicket(
      {
        subject: 'Ticket',
        hs_pipeline: 'default',
        hs_pipeline_stage: 'stage',
        hs_ticket_status: 'WAITING_ON_US',
        customProperties: {
          custom_field: 'custom value'
        }
      },
      baseContext
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const body = fetchMock.mock.calls[0][1]?.body as string
    const parsed = JSON.parse(body)
    expect(parsed.properties.hs_ticket_status).toBe('WAITING_ON_US')
    expect(parsed.properties.custom_field).toBe('custom value')
  })

  it('uploads attachments to HubSpot and associates them with ticket', async () => {
    mockedGetToken.mockResolvedValue('token')

    const fileBuffer = Buffer.from('file-content')
    mockedGetFile.mockResolvedValue({
      file: {
        arrayBuffer: async () => fileBuffer
      },
      metadata: {
        id: 'attachment-node',
        fileName: 'note.txt',
        fileType: 'text/plain',
        fileSize: fileBuffer.length,
        filePath: 'path',
        userId: 'user-123',
        workflowId: 'wf',
        createdAt: new Date(),
        expiresAt: new Date()
      }
    } as any)

    fetchMock
      .mockResponseOnce(
        JSON.stringify({
          id: 'ticket-1',
          properties: { subject: 'Ticket' },
          createdAt: '2024-01-01T00:00:00.000Z'
        })
      )
      .mockResponseOnce(JSON.stringify({ id: 'hubspot-file-1' }))
      .mockResponseOnce('', { status: 204 })

    const result = await hubspotCreateTicket(
      {
        subject: 'Ticket',
        hs_pipeline: 'default',
        hs_pipeline_stage: 'stage',
        attachments: [{ id: 'attachment-node', fileName: 'note.txt', fileType: 'text/plain' }]
      },
      baseContext
    )

    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(fetchMock.mock.calls[1][0]).toBe('https://api.hubapi.com/files/v3/files')
    expect(fetchMock.mock.calls[2][0]).toContain('ticket_to_file')
    expect(result.output?.hubspotAttachmentIds).toEqual(['hubspot-file-1'])
  })
})
