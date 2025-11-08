/**
 * Trello Data Handlers Export
 */

import { getTrelloBoards } from './boards'
import { getTrelloListTemplates } from './listTemplates'
import { getTrelloCardTemplates } from './cardTemplates'
import { getTrelloBoardTemplates } from './boardTemplates'
import { getTrelloLists } from './lists'
import { getTrelloCards } from './cards'
import { getTrelloBoardMembers } from './members'
import { getTrelloBoardLabels } from './labels'
import { getTrelloAllCards } from './allCards'
import { getTrelloCardChecklists } from './cardChecklists'

export const trelloHandlers = {
  'trello-boards': getTrelloBoards,
  'trello_boards': getTrelloBoards, // Support both hyphen and underscore
  'trello-list-templates': getTrelloListTemplates,
  'trello-card-templates': getTrelloCardTemplates,
  'trello_card_templates': getTrelloCardTemplates, // Support both hyphen and underscore
  'trello-board-templates': getTrelloBoardTemplates,
  'trello_board_templates': getTrelloBoardTemplates, // Support both hyphen and underscore
  'trello_lists': getTrelloLists,
  'trello_cards': getTrelloCards,
  'trello_board_members': getTrelloBoardMembers,
  'trello_board_labels': getTrelloBoardLabels,
  'trello_all_cards': getTrelloAllCards,
  'trello_card_checklists': getTrelloCardChecklists
}

export {
  getTrelloBoards,
  getTrelloListTemplates,
  getTrelloCardTemplates,
  getTrelloBoardTemplates,
  getTrelloLists,
  getTrelloCards,
  getTrelloBoardMembers,
  getTrelloBoardLabels,
  getTrelloAllCards,
  getTrelloCardChecklists
}