/**
 * Trello Data Handlers Export
 */

import { getTrelloBoards } from './boards'
import { getTrelloListTemplates } from './listTemplates'
import { getTrelloCardTemplates } from './cardTemplates'
import { getTrelloLists } from './lists'
import { getTrelloCards } from './cards'

export const trelloHandlers = {
  'trello-boards': getTrelloBoards,
  'trello-list-templates': getTrelloListTemplates,
  'trello-card-templates': getTrelloCardTemplates,
  'trello_lists': getTrelloLists,
  'trello_cards': getTrelloCards
}

export {
  getTrelloBoards,
  getTrelloListTemplates,
  getTrelloCardTemplates,
  getTrelloLists,
  getTrelloCards
}