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

// Convert arbitrary image to 16×16 pixel PNG (preserving transparency).
// (Returns promise, which resolves to base64 encoded string.)
async function normalizeFavicon(imageDataUrl) {
  if (!imageDataUrl || imageDataUrl === 'data:,') { return null }
  return new Promise((resolve, reject) => {
    let img = new Image()
    img.onerror = () => {
      reject(Error(`Cannot load image: '${imageDataUrl}':`))
    }
    img.onload = () => {
      let canvas = document.createElement('canvas')
      canvas.width = 16; canvas.height = 16
      let ctx = canvas.getContext('2d')
      ctx.imageSmoothingEnabled = false        // good for small images
      ctx.drawImage(img, 0, 0, 16, 16)         // scale image to 16×16 pixels
      resolve(canvas.toDataURL('image/png').split(',')[1])
    }
    img.src = imageDataUrl
  })
}

// Create a new unique Rewin ID (prefix: 't' = tab, 'w' = window).
function createId(prefix) {
  const rewinId = `${prefix}${randomStr()}`
  return loadRec(rewinId).then(data => data ? createId(prefix) : rewinId)
}

// getRewinTabId(tabId) / getRewinWinId(windowId): Return the Rewin tab/window
// ID, corresponding to given (browser) tabId/windowId. If no Rewin ID exists
// for the tab/window, a new one is created and returned.
function getRewinTabId(tabId) {
  return browser.sessions.getTabValue(+tabId, 'rewinId').then(rewinId =>
    rewinId ?? createId('t').then(rewinId =>
      browser.sessions.setTabValue(+tabId, 'rewinId', rewinId).then(() =>
        rewinId)))
}
function getRewinWinId(windowId) {
  return browser.sessions.getWindowValue(+windowId, 'rewinId').then(rewinId =>
    rewinId ?? createId('w').then(rewinId =>
      browser.sessions.setWindowValue(+windowId, 'rewinId', rewinId).then(() =>
        rewinId)))
}
// Generate checksum based Rewin ID for a favicon. (Returns a promise.)
async function getRewinFavId(str) {
  const data = new TextEncoder().encode(str)
  const hashBuffer = await crypto.subtle.digest('SHA-1', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  const base64Hash = btoa(String.fromCharCode(...hashArray))
  return 'f' + base64Hash.slice(0, 12)
    .replace(/[+/]/g, x => ({ '+': '-', '/': '_' }[x]))
}

// Save/load data from storage.local.
function saveRec(rewinId, data) {
  return browser.storage.local.set({ [rewinId]: data })
}
function loadRec(rewinId) {
  return browser.storage.local.get(rewinId).then(({ [rewinId]: data }) => data)
}

function runInTab(tabId, func, ...args) {
  return browser.scripting.executeScript({ target: { tabId }, func, args })
}

function getCurrentTab() {
  return browser.tabs.query({ currentWindow: true, active: true })
    .then(([tab]) => tab)
}

async function getHistoryLength(tabId) {
  return runInTab(tabId, () => history.length).then(([reply]) => {
    const { result: i, error } = reply ?? {}
    if (error) { throw error }
    if (!i) { throw Error(`Bad history length (tabId ${tabId}): ${i}`) }
    return i
  })
}

function errlog(...msg) { console.error(...msg) }

// Save all currently open window/tabs/favicons that aren't already saved
// (never modifies/overwrites records that already exists).
async function scanTabs() {
  let favicons = {}
  const promises = (await browser.windows.getAll({ populate: true }))
    .filter(({ type }) => type === 'normal')   // skip non-'normal' windows
    .flatMap(({                                // windows
      id: windowId, tabs, incognito,
    }) => {
      // Create tab records.
      let activeRewinTabId
      return Promise.all(tabs.map(({           // tabs
        id: tabId, url, title, favIconUrl, lastAccessed, active,
      }) => {
        return getRewinTabId(tabId).then(rewinTabId => {
          if (active) { activeRewinTabId = rewinTabId }
          return loadRec(rewinTabId).then(savedTabRecord => {
            if (savedTabRecord) { return }     // already exists, skip
            return normalizeFavicon(favIconUrl)
              .catch(errlog)
              .then(faviconData => {
                return Promise.all([
                  getRewinFavId(faviconData)
                    .catch(err => errlog(err, `(getRewinFavId() for tabId ${tabId}/${rewinTabId})`)),
                  getHistoryLength(tabId).catch(() => {}), // suppress errors
                ]).then(([rewinFavId, histLength]) => {
                  favicons[rewinFavId] = faviconData
                  // FIXME: Include full history
                  const tabData = [url, title, rewinFavId, lastAccessed]
                  const tabMeta = Object.assign(
                    { pos: 0 },
                    histLength === 1 ? {} : { partial: 1 },
                  )
                  return [rewinTabId, [tabMeta, tabData]] // tab entry
                })
              })
          }).catch(errlog)
        })
      })).then(tabEntries => {
        // Create window record.
        return getRewinWinId(windowId).then(rewinWinId => {
          return loadRec(rewinWinId).then(savedWinRecord => {
            if (savedWinRecord) {              // window already exists, skip
              return tabEntries
            }
            const rewinTabIds = tabEntries.map(([rewinTabId]) => rewinTabId)
            const winMeta = Object.assign(
              { active: activeRewinTabId },
              incognito ? { incognito: 1 } : {},
            )
            return [[rewinWinId, [winMeta, ...rewinTabIds]], ...tabEntries]
          }).catch(errlog)
        })
      })
    })
  return Promise.all(promises).then(entries => {
    // Each promise resolve into an entry for either a tab, a window, or a
    // favicon record: [id => data].
    return browser.storage.local.set({
      ...Object.fromEntries(entries.flat()),
      ...favicons,
    })
  }).catch(errlog)
}

// Save tab to storage.
async function mapTab({ id: tabId }) {
  const rewinTabId = await getRewinTabId(tabId)
  console.log(`TAB OPENED ${tabId}/${rewinTabId}`)

  // Make sure tab record is initiated (load, or set to empty).
  let rewinHist = await loadRec(rewinTabId) ?? [{ pos: 0 }]
  let [meta] = rewinHist

  delete meta.closed // mark tab as non-closed
  return saveRec(rewinTabId, rewinHist)
}
async function unmapTab(tabId, { windowId, isWindowClosing }) {
  const rewinTabId = await getRewinTabId(tabId)
  console.log(`TAB CLOSED ${tabId}/${rewinTabId}`)

  // Make sure tab record is initiated (load, or set to empty).
  let rewinHist = await loadRec(rewinTabId) ?? [{ pos: 0 }]
  let [meta] = rewinHist

  // Set tab to 'closed' (unless part of window-close event).
  if (isWindowClosing) {
    delete meta.closed
  } else {
    meta.closed = Date.now()
  }
  // Save & remove from RAM.
  return saveRec(rewinTabId, rewinHist)
}

// Save window to storage.
async function mapWindow({ id: winId }) {
  const rewinWinId = await getRewinWinId(winId)
  console.log(`WINDOW OPENED ${winId}/${rewinWinId}`)

  // Make sure window record is initiated (load, or set to empty).
  let rewinTabIds = await loadRec(rewinWinId) ?? [{}]
  let [meta] = rewinTabIds

  delete meta.closed // mark win as non-closed
  return saveRec(rewinWinId, rewinTabIds)
}
async function unmapWindow(winId) {
  const rewinWinId = await getRewinWinId(winId)
  if (!rewinWinId) { throw `Window unknown to Rewin (winId: ${winId})` }
  console.log(`WINDOW CLOSED ${winId}/${rewinWinId}`)

  // Make sure win record is initiated (load, or set to empty).
  let rewinTabIds = await loadRec(rewinWinId) ?? [{}]
  let [meta] = rewinTabIds

  // Set window to 'closed'.
  meta.closed = Date.now()

  // Save & remove from RAM.
  return saveRec(rewinWinId, rewinTabIds)
}

function onURLChange(details) {
  if (details.frameId !== 0) { return } // skip iframes
  const { rewin } = history.state
  if (rewin) {  // previously visited
    // update state
  }
  history.replace({ rewin: history.length, ...history.state })
}

async function updateToolbarIcon() {
  const { id: tabId, windowId: winId } = await getCurrentTab()
  const [rewinTabId, rewinWinId] = await Promise.all([
    getRewinTabId(tabId).catch(errlog),
    getRewinWinId(winId).catch(errlog),
  ])
  console.log(`TAB CHANGED ${tabId}/${rewinTabId} (window ${winId}/${rewinWinId})`)
  getHistoryLength(tabId).then(histLen => {
    browser.action.setIcon({ tabId, path: null })
    browser.action.setTitle({ tabId, title: null })
    loadRec(rewinTabId).then(rewinHist => {
      const rewinHistLen = (rewinHist ?? [0]).length - 1
      const missing = histLen - rewinHistLen
      const text = missing ? `${missing}` : null
      // Badge displays number of unsaved history entries.
      browser.action.setBadgeText({ tabId, text })
    })
  }).catch(err => {
    browser.action.setIcon({ tabId, path: 'rewin-off.svg' })
    browser.action.setTitle({ tabId, title: `DISABLED: ${err}` })
    browser.action.setBadgeText({ tabId, text: null })
  })
  // Update window's 'tab' property.
  let rewinTabIds = await loadRec(rewinWinId) ?? [{}]
  let [meta] = rewinTabIds

  if (meta.tab != rewinTabId) {
    meta.tab = rewinTabId
    return saveRec(rewinWinId, rewinTabIds)
  }
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

window.scanTabs = scanTabs // FIXME: Make available for debugging
window.getRewinTabId = getRewinTabId

//[eof]
