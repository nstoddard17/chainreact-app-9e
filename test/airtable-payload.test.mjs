import test from 'node:test'
import assert from 'node:assert/strict'

import {
  matchesAirtableTable,
  normalizeTableName
} from '../lib/integrations/airtable/payloadUtils.js'

test('normalizeTableName trims and lowercases values', () => {
  assert.equal(normalizeTableName(' Feedback '), 'feedback')
  assert.equal(normalizeTableName(null), '')
})

test('matchesAirtableTable returns true when table ID matches', () => {
  const triggerConfig = { tableId: 'tbl123' }
  const tableData = { name: 'Other Table' }

  assert.equal(matchesAirtableTable('tbl123', tableData, triggerConfig), true)
})

test('matchesAirtableTable matches by normalized table name when ID not provided', () => {
  const triggerConfig = { tableName: 'Feedback' }
  const tableData = { name: 'feedback' }

  assert.equal(matchesAirtableTable('tbl123', tableData, triggerConfig), true)
})

test('matchesAirtableTable respects webhook metadata fallbacks', () => {
  const triggerConfig = { tableName: '' }
  const tableData = { name: undefined }
  const metadata = { tableId: 'tbl999' }

  assert.equal(matchesAirtableTable('tbl999', tableData, triggerConfig, metadata), true)
  assert.equal(matchesAirtableTable('tbl000', tableData, triggerConfig, metadata), false)
})

test('matchesAirtableTable returns false when neither ID nor normalized name align', () => {
  const triggerConfig = { tableName: 'Feedback' }
  const tableData = { name: 'Requests' }

  assert.equal(matchesAirtableTable('tbl123', tableData, triggerConfig), false)
})
