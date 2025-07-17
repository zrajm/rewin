/*-*- js-indent-level: 2 -*-*/
// Copyright 2025 by zrajm. Licenses: CC BY-SA (text), GPLv2 (code).

/**********************/
/** Helper Functions **/
/**********************/

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

//
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

// User switches between tabs.
browser.tabs.onActivated.addListener(updateToolbarIcon)
browser.windows.onFocusChanged.addListener(updateToolbarIcon)

// URL changes/navigation (including Back & Forward).
browser.webNavigation.onCommitted.addListener(onURLChange)
browser.webNavigation.onHistoryStateUpdated.addListener(onURLChange)
browser.webNavigation.onReferenceFragmentUpdated.addListener(onURLChange)

console.log('Rewin loaded')

//[eof]
