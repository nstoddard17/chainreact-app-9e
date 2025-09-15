/**
 * Trello Data Handlers Export
 */

import { getTrelloBoards } from './boards'
import { getTrelloListTemplates } from './listTemplates'
import { getTrelloCardTemplates } from './cardTemplates'
import { getTrelloBoardTemplates } from './boardTemplates'
import { getTrelloLists } from './lists'
import { getTrelloCards } from './cards'

export const trelloHandlers = {
  'trello-boards': getTrelloBoards,
  'trello_boards': getTrelloBoards,  // Support both hyphen and underscore
  'trello-list-templates': getTrelloListTemplates,
  'trello-card-templates': getTrelloCardTemplates,
  'trello-board-templates': getTrelloBoardTemplates,
  'trello_board_templates': getTrelloBoardTemplates,  // Support both hyphen and underscore
  'trello_lists': getTrelloLists,
  'trello_cards': getTrelloCards
}

export {
  getTrelloBoards,
  getTrelloListTemplates,
  getTrelloCardTemplates,
  getTrelloBoardTemplates,
  getTrelloLists,
  getTrelloCards
}