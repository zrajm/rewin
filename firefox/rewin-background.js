/*-*- js-indent-level: 2 -*-*/
// Copyright 2025 by zrajm. Licenses: CC BY-SA (text), GPLv2 (code).

/**********************/
/** Helper Functions **/
/**********************/

function runInTab(tabId, func, ...args) {
  browser.scripting.executeScript({ target: { tabId }, func, args })
}

function getCurrentTab() {
  return browser.tabs.query({ currentWindow: true, active: true })
    .then(([tab]) => tab)
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
function onTabFocusChange() {
  getCurrentTab().then(tab => {
    console.log('TABDETAILS:', tab)
    const { id: tabId } = tab
    browser.scripting.executeScript({
      target: { tabId },
      func: () => history.length,
    }).then(([reply]) => {
      const { result, error } = reply ?? {}
      histIndex[tabId] = error ? null : result
      if (error) { throw error }
      if (!result) { throw (`Bad history length: ${result}`) }
      browser.action.setIcon({ tabId, path: null })
      browser.action.setTitle({ tabId, title: null })
      // FIXME: Only set badge text if there's restored history!
      browser.action.setBadgeText({ tabId, text: result ? `${result}` : null })
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
browser.tabs.onActivated.addListener(onTabFocusChange)
browser.windows.onFocusChanged.addListener(onTabFocusChange)

// URL changes/navigation (including Back & Forward).
browser.webNavigation.onCommitted.addListener(onURLChange)
browser.webNavigation.onHistoryStateUpdated.addListener(onURLChange)
browser.webNavigation.onReferenceFragmentUpdated.addListener(onURLChange)

console.log('Rewin loaded')

//[eof]
