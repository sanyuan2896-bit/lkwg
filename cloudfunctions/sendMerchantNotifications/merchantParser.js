const https = require('https')

const MERCHANT_SOURCE_URL = 'https://www.onebiji.com/hykb_tools/comm/lkwgmerchant/preview.php?id=1&immgj=0'

function absolutizeUrl(url) {
  if (!url) {
    return ''
  }
  if (/^https?:\/\//i.test(url)) {
    return url
  }
  if (url.startsWith('//')) {
    return `https:${url}`
  }
  if (url.startsWith('/')) {
    return `https://www.onebiji.com${url}`
  }
  return `https://www.onebiji.com/${url.replace(/^\.?\//, '')}`
}

function dedupeGoods(goods) {
  const seen = new Set()
  return goods.filter((item) => {
    const key = `${item.name}|${item.limitText}|${item.priceText}|${item.expireAt}`
    if (seen.has(key)) {
      return false
    }
    seen.add(key)
    return true
  })
}

function parseMerchantGoods(html) {
  const normalizedHtml = String(html || '').replace(/\r?\n/g, ' ')
  const activeSlotMatch = normalizedHtml.match(/class="[^"]*check_(\d+)[^"]*\son[^"]*"/i)
  if (!activeSlotMatch) {
    return { activeSlot: '', goods: [] }
  }

  const activeSlot = activeSlotMatch[1]
  const itemMatcher = new RegExp(
    `<li[^>]+class="[^"]*li_show[^"]*show_${activeSlot}[^"]*"[^>]*data-time="(\\d+)"[^>]*>[\\s\\S]*?<div class="gitem">[\\s\\S]*?<img src="([^"]+)"[^>]*>[\\s\\S]*?<em>限购(\\d+)</em>[\\s\\S]*?<div class="sp-text">[\\s\\S]*?<p><em>([^<]+)</em></p>[\\s\\S]*?<div><em>价格：?(\\d+)\\s*</em>`,
    'gi'
  )

  const goods = []
  let match = itemMatcher.exec(normalizedHtml)
  while (match) {
    goods.push({
      expireAt: Number(match[1]) * 1000,
      imageUrl: absolutizeUrl(match[2]),
      limitText: `限购 ${match[3]}`,
      name: match[4].trim(),
      priceText: `${match[5]} 洛克贝`
    })
    match = itemMatcher.exec(normalizedHtml)
  }

  const rangeMap = {
    '1': '08:00-12:00',
    '2': '12:00-16:00',
    '3': '16:00-20:00',
    '4': '20:00-24:00'
  }

  return {
    activeSlot,
    goods: dedupeGoods(goods),
    rangeText: rangeMap[activeSlot] || ''
  }
}

function fetchPage(url = MERCHANT_SOURCE_URL) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (response) => {
        let data = ''
        response.on('data', (chunk) => {
          data += chunk
        })
        response.on('end', () => {
          resolve(data)
        })
      })
      .on('error', reject)
  })
}

async function fetchMerchantSnapshot() {
  const html = await fetchPage()
  return parseMerchantGoods(html)
}

module.exports = {
  fetchMerchantSnapshot
}
