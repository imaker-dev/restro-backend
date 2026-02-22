/**
 * Shared State for E2E Tests
 * Single source of truth for tokens and IDs across all test files
 */

const state = {
  tokens: {},
  createdIds: {
    outlet: null,
    floors: [],
    sections: [],
    tables: [],
    kitchenStations: [],
    taxGroups: [],
    categories: [],
    menuItems: [],
    users: [],
    orders: [],
    kots: [],
    bills: []
  }
};

// Token management
function setToken(role, token) {
  state.tokens[role] = token;
}

function getToken(role) {
  return state.tokens[role];
}

// ID management
function addCreatedId(type, id) {
  if (Array.isArray(state.createdIds[type])) {
    state.createdIds[type].push(id);
  } else {
    state.createdIds[type] = id;
  }
}

function getCreatedId(type) {
  return state.createdIds[type];
}

function getState() {
  return state;
}

module.exports = {
  state,
  setToken,
  getToken,
  addCreatedId,
  getCreatedId,
  getState
};
