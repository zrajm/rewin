/*-*- js-indent-level: 2 -*-*/
// Copyright 2025 by zrajm. Licenses: CC BY-SA (text), GPLv2 (code).

/**********************/
/** Helper Functions **/
/**********************/

// Calls `console.log()` in the active tab.
function out(...msg) {
  runInCurrentTab(x => console.log(...x), msg)
}

function outInTab(tabId, ...msg) {
  runInTab(tabId, x => console.log(...x), msg)
}

// Run `func(args)` inside tab.
function runInCurrentTab(func, ...args) {
  browser.tabs
    .query({ currentWindow: true, active: true })
    .then(([{ id: tabId }]) => runInTab(tabId, func, ...args))
}

function runInTab(tabId, func, ...args) {
  // browser.scripting.executeScript({
  //   target: { tabId },
  //   func: () => console.log("THIS PLACE"),
  //   //args: args,
  // })
  // browser.scripting.executeScript({
  //   target: { tabId },
  //   func: func,
  //   args: args,
  // })
  browser.scripting.executeScript({ target: { tabId }, func, args })
}

function injectionLoad(tabId, url) {
  runInTab(tabId, url => {
    let link = document.createElement('a')
    link.href = url
    link.target = '_self'
    document.body.appendChild(link)
    link.click()
  }, url)
}

function injectionLoadHere(url) {
  console.log('injectionLoadHere')
  let link = document.createElement('a')
  link.href = url
  link.target = '_self'
  document.body.appendChild(link)
  link.click()
}

// Returns Promise().
function getCurrentTab() {
  return browser.tabs.query({ currentWindow: true, active: true })
    .then(([tab]) => tab)
}

function duplicateCurrentTab() {
  return browser.tabs.query({ currentWindow: true, active: true })
    .then(([{ id: tabId }]) => browser.tabs.duplicate(tabId))
}

/***********************/
/** Central Functions **/
/***********************/

function onButton(tab) {
  outInTab(tab.id, '--------------------------------------------------')
  outInTab(tab.id, "XXX Rewin button clicked!", tab)

  let urls = [
    'https://klingonska.org',
    'https://zrajm.org',
    'https://zrajm.devel/rewin',
  ]


  // browser.webNavigation.onHistoryStateUpdated.addListener(onHistoryUpdate)

  // 1. Get list of URL to load into history
  // 2. Open new tab
  // 3. Set `pushState()` hook finishing
  //    3.1. If there are no more URL items, remove `pushState()` hook
  //    3.2. Invoke `pushState()` on next URL item
  // 4. Invoke pustState() or first URL item

  //duplicateCurrentTab()
  getCurrentTab().then(tabDetails => {// duplicate tab
    const { id: tabId, oldTabId } = tabDetails

    runInTab(tabId, (oldTabId, ...urls) => {

      //location.reload()

      // Random string (9 byte = 72bit = 12 characters in websafe base64).
      function randomStr() {
        return btoa(String.fromCharCode(
          ...crypto.getRandomValues(new Uint8Array(9))))
          .replace(/[+/]/g, x => ({ '+': '-', '/': '_' }[x]))
      }

      // Add URL param 'rewin' with random string.
      function setRewinParam(baseUrl, url) {
        baseUrl = new URL(baseUrl)
        baseUrl.searchParams.set('rewin_url', url)
        baseUrl.searchParams.set('rewin', randomStr())
        return baseUrl.toString()
      }

      function addToHistory(...urls) {
        const orgTitle = document.title
        function addHistoryItem(cmd, baseUrl, url, ...urls) {
          console.log("HEREXX:", url)
          if (navigator.userActivation.hasBeenActive) { console.log('(has)') }
          if (navigator.userActivation?.isActive) { console.log('(is)') }

          const title = url.replace(/.*?\/\//, '') // URL without 'http://' part
          const fakeUrl = urls.length > 0 ? setRewinParam(location, url) : url

          history[cmd]({ fakeUrl }, title, fakeUrl)
          document.title = urls.length > 0 ? `${urls.length} ${title}` : orgTitle
          console.log(document.title)

          // outElement.insertAdjacentHTML(
          //   'beforeend',
          //   `${urls.length} <tt>${url}</tt><br><tt>${fakeUrl}<br>`)

          if (urls.length) {
            setTimeout(addHistoryItem, 1, 'pushState', baseUrl, ...urls)
          }
        }
        setTimeout(addHistoryItem, 1, 'replaceState', location.origin, ...urls, `${location}`)
      }

      addToHistory(...urls)

    }, oldTabId, ...urls)

    //outInTab(oldTabId, 'TAB DUPLICATED')
  })
}

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

// On pushState() / replaceState().
//browser.webNavigation.onHistoryStateUpdated.addListener(onHistoryStateUpdated)

// On link click, back/forward, etc.
//browser.webNavigation.onCommitted.addListener(onCommitted)

// Click on addon button in URL toolbar.
//browser.action.onClicked.addListener(onButton)

out('Rewin loaded')
//[eof]
