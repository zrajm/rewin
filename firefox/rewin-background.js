/*-*- js-indent-level: 2 -*-*/
// Copyright 2025 by zrajm. Licenses: CC BY-SA (text), GPLv2 (code).

/**********************/
/** Helper Functions **/
/**********************/

// Random string (9 byte = 72bit = 12 characters in websafe base64).
function randomStr() {
  return btoa(String.fromCharCode(
    ...crypto.getRandomValues(new Uint8Array(9))))
    .replace(/[+/]/g, x => ({ '+': '-', '/': '_' }[x]))
}

// Create a new unique Rewin ID (prefix: 't' = tab, 'w' = window).
function createId(prefix) {
  const rewinId = `${prefix}${randomStr()}`
  return browser.storage.local.get(rewinId)
    .then(({ [rewinId]: data }) => data ? createId(prefix) : rewinId)
}

// getRewinTabId(tabId): Given a browser tabId, return an rewinTabId string.
// Use internal mapping table, failing that, read session tab value 'rewinId'
// from the tab itself (this value is restored if tab is reopened). If no
// rewinId could be found, generate a new one.
function getRewinTabId(tabId) {
  return browser.sessions.getTabValue(tabId, 'rewinId').then(rewinId =>
    rewinId ?? createId('t').then(rewinId => (
      browser.sessions.setTabValue(tabId, 'rewinId', rewinId),
      rewinId)))
}
function getRewinWinId(windowId) {
  return browser.sessions.getWindowValue(windowId, 'rewinId').then(rewinId =>
    rewinId ?? createId('w').then(rewinId => (
      browser.sessions.setWindowValue(windowId, 'rewinId', rewinId),
      rewinId)))
}

// All cached data, indexed by rewinId (initial letter of id determines type of
// data). Records are flushed (but kept in storage) for closed tabs/windows.
let recs = {}
function saveRec(rewinId) {
  return browser.storage.local.set({ [rewinId]: recs[rewinId] })
}
function loadRec(rewinId) {
  return recs[rewinId] ?? browser.storage.local.get(rewinId)
    .then(({ [rewinId]: value }) => value)
}

function runInTab(tabId, func, ...args) {
  return browser.scripting.executeScript({ target: { tabId }, func, args })
}

function getCurrentTab() {
  return browser.tabs.query({ currentWindow: true, active: true })
    .then(([tab]) => tab)
}

function getHistoryLength(tabId) {
  return runInTab(tabId, () => history.length).then(([reply]) => {
    const { result: i, error } = reply ?? {}
    if (error) { throw error }
    if (!i) { throw Error(`Bad history length (tab ID ${tabId}): ${i}`) }
    return i
  })
}

/***********************/
/** Central Functions **/
/***********************/

// Add tab to <recs>, also save to to storage.
let tabMap = {}
async function mapTab({ id: tabId }) {
  const rewinTabId = tabMap[tabId] = await getRewinTabId(tabId)
  console.log('TAB OPENED', tabId, rewinTabId)

  // Make sure tab record is initiated (load, or set to empty).
  let [meta] = recs[rewinTabId] ??= await loadRec(rewinTabId) ?? [{ pos: 0 }]

  delete meta.closed // mark tab as non-closed
  await saveRec(rewinTabId)
}
async function unmapTab(tabId, { windowId, isWindowClosing }) {
  const rewinTabId = tabMap[tabId]
  if (!rewinTabId) { throw `Tab unknown to Rewin (tabId: ${tabId})` }
  console.log('TAB CLOSED', tabId, rewinTabId)

  // Make sure tab record is initiated (load, or set to empty).
  let [meta] = recs[rewinTabId] ??= await loadRec(rewinTabId) ?? [{ pos: 0 }]

  // Set tab to 'closed' (unless part of window-close event).
  meta.closed = isWindowClosing ? undefined : Date.now()

  // Save & remove from RAM.
  await saveRec(rewinTabId)
  delete recs[rewinTabId]
  delete tabMap[tabId]
}

// Add window to <recs>, also save to to storage.
let winMap = {}
async function mapWindow({ id: winId }) {
  const rewinWinId = winMap[winId] = await getRewinWinId(winId)
  console.log('WINDOW OPENED', winId, rewinWinId)

  // Make sure window record is initiated (load, or set to empty).
  let [meta] = recs[rewinWinId] ??= await loadRec(rewinWinId) ?? [{}]

  delete meta.closed // mark win as non-closed
  await saveRec(rewinWinId)
}
async function unmapWindow(windowId) {
  const rewinWinId = winMap[windowId]
  if (!rewinWinId) { throw `Window unknown to Rewin (windowId: ${windowId})` }
  console.log('WINDOW CLOSED', windowId, rewinWinId)

  // Make sure win record is initiated (load, or set to empty).
  let [meta] = recs[rewinWinId] ??= await loadRec(rewinWinId) ?? [{}]

  // Set window to 'closed'.
  meta.closed = Date.now()

  // Save & remove from RAM.
  await saveRec(rewinWinId)
  delete recs[rewinWinId]
  delete winMap[windowId]
}

function onURLChange(details) {
  if (details.frameId !== 0) { return } // skip iframes
  const { rewin } = history.state
  if (rewin) {  // previously visited
    // update state
  }
  history.replace({ rewin: history.length, ...history.state })
}

const histIndex = {}
function updateToolbarIcon() {
  getCurrentTab().then(tab => {
    const { id: tabId } = tab
    getHistoryLength(tabId).then(histLen => {
      histIndex[tabId] = histLen
      browser.action.setIcon({ tabId, path: null })
      browser.action.setTitle({ tabId, title: null })
      // FIXME: Only set badge text if there's restored history!
      browser.action.setBadgeText({ tabId, text: histLen ? `${histLen}` : null })
      console.log('HISTINDEX', JSON.stringify(histIndex))
    }).catch(err => {
      histIndex[tabId] = null
      browser.action.setIcon({ tabId, path: 'rewin-off.svg' })
      browser.action.setTitle({ tabId, title: `DISABLED: ${err}` })
      browser.action.setBadgeText({ tabId, text: null })
    })
  })
}

/*****************************************************************************/

function logErr(func) {
  return (...args) => func(...args).catch(err => console.error(err))
}

// Tab/window open/close.
browser.tabs.onCreated.addListener(logErr(mapTab))
browser.tabs.onRemoved.addListener(logErr(unmapTab))
browser.windows.onCreated.addListener(logErr(mapWindow))
browser.windows.onRemoved.addListener(logErr(unmapWindow))

// User switches between tabs.
browser.tabs.onActivated.addListener(logErr(updateToolbarIcon))
browser.windows.onFocusChanged.addListener(logErr(updateToolbarIcon))

// URL changes/navigation (including Back & Forward).
browser.webNavigation.onCommitted.addListener(onURLChange)
browser.webNavigation.onHistoryStateUpdated.addListener(onURLChange)
browser.webNavigation.onReferenceFragmentUpdated.addListener(onURLChange)

console.log('Rewin loaded')

//[eof]
