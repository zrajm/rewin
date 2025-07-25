/*-*- js-indent-level: 2 -*-*/
// Copyright 2025 by zrajm. Licenses: CC BY-SA (text), GPLv2 (code).

async function search(str) {
  const out = document.querySelector('#out')
  const regex = RegExp(str.replace(/ /g, '.*?'), 'i')
  const storage = await browser.storage.local.get()
  const tabs = Object.entries(storage)
    .filter(([rewinTabId]) => rewinTabId[0] === 't')

  out.innerHTML = tabs.flatMap(([rewinTabId, [tabMeta, ...rewinHistEntries]]) => {
    return rewinHistEntries
      .filter(([url, title]) => regex.test(title))
      .map(([url, title, rewinFavId, epoch]) => {
        const favicon = storage[rewinFavId]
        return `<a href="#"><img src="data:image/png;base64,${favicon}">${title.replace(regex, '<mark>$&</mark>')}</a>`
      })
  }).join('\n')
}

/*****************************************************************************/

const q = document.querySelector('#q')

q.oninput = () => { search(q.value) }
q.focus({ preventScroll: true })

//[eof]
