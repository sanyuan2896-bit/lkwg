const STORAGE_KEY = 'merchant-reminder-config'
const SLOT_RECORD_KEY = 'merchant-slot-records'
const MERCHANT_SOURCE_URL = 'https://www.onebiji.com/hykb_tools/comm/lkwgmerchant/preview.php?id=1&immgj=0'
const CLOUD_ENV_STORAGE_KEY = 'merchant-cloud-env-id'
const TEMPLATE_ID_STORAGE_KEY = 'merchant-template-id'
const MOCK_SUBSCRIPTION_COUNT_KEY = 'merchant-mock-subscription-count'
const TEST_TEMPLATE_ID = 'MOCK_MERCHANT_TEMPLATE_ID'
const DEFAULT_CLOUD_ENV_ID = 'cloudbase-d9gfw4fls7375ca47'
const DEFAULT_TEMPLATE_ID = 'zwPG3DQvU8Zji6R4MPhu7vOlURBk1_7Nq6sZ6USEuWA'

const DEFAULT_CONFIG = {
  enabled: true,
  leadMinutes: 10,
  slots: ['08:00', '12:00', '16:00', '20:00'],
  notes: '',
  lastReminderKey: ''
}

function pad(value) {
  return String(value).padStart(2, '0')
}

function cloneConfig(config = DEFAULT_CONFIG) {
  return JSON.parse(JSON.stringify(config))
}

function normalizeTime(text) {
  const match = String(text || '').trim().match(/^(\d{1,2}):(\d{1,2})$/)
  if (!match) {
    return null
  }

  const hour = Number(match[1])
  const minute = Number(match[2])
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null
  }

  return `${pad(hour)}:${pad(minute)}`
}

function splitNameText(text) {
  return String(text || '')
    .split(/[、，,\n\s]+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function loadConfig() {
  try {
    const stored = wx.getStorageSync(STORAGE_KEY)
    const merged = {
      ...cloneConfig(),
      ...(stored || {})
    }

    merged.slots = (merged.slots || [])
      .map(normalizeTime)
      .filter(Boolean)
      .sort()

    if (!merged.slots.length) {
      merged.slots = cloneConfig().slots
    }

    return merged
  } catch (error) {
    return cloneConfig()
  }
}

function saveConfig(config) {
  wx.setStorageSync(STORAGE_KEY, config)
}

function loadSlotRecords() {
  try {
    return wx.getStorageSync(SLOT_RECORD_KEY) || {}
  } catch (error) {
    return {}
  }
}

function saveSlotRecord(slotKey, payload) {
  const records = loadSlotRecords()
  records[slotKey] = payload
  wx.setStorageSync(SLOT_RECORD_KEY, records)
}

function loadCloudSettings() {
  const storedCloudEnvId = wx.getStorageSync(CLOUD_ENV_STORAGE_KEY) || ''
  const storedTemplateId = wx.getStorageSync(TEMPLATE_ID_STORAGE_KEY) || ''
  return {
    cloudEnvId: storedCloudEnvId || DEFAULT_CLOUD_ENV_ID,
    templateId: storedTemplateId && storedTemplateId !== TEST_TEMPLATE_ID
      ? storedTemplateId
      : DEFAULT_TEMPLATE_ID
  }
}

function saveCloudSettings({ cloudEnvId, templateId }) {
  if (typeof cloudEnvId === 'string') {
    wx.setStorageSync(CLOUD_ENV_STORAGE_KEY, cloudEnvId.trim())
  }
  if (typeof templateId === 'string') {
    wx.setStorageSync(TEMPLATE_ID_STORAGE_KEY, templateId.trim())
  }
}

function loadMockSubscriptionCount() {
  try {
    return Number(wx.getStorageSync(MOCK_SUBSCRIPTION_COUNT_KEY) || 0)
  } catch (error) {
    return 0
  }
}

function saveMockSubscriptionCount(count) {
  wx.setStorageSync(MOCK_SUBSCRIPTION_COUNT_KEY, Math.max(0, Number(count) || 0))
}

function increaseMockSubscriptionCount() {
  const nextCount = loadMockSubscriptionCount() + 1
  saveMockSubscriptionCount(nextCount)
  return nextCount
}

function getTodayText(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function buildSlotDate(date, slot) {
  const [hour, minute] = slot.split(':').map(Number)
  const target = new Date(date)
  target.setHours(hour, minute, 0, 0)
  return target
}

function getNextSlot(now = new Date(), slots = DEFAULT_CONFIG.slots) {
  const normalizedSlots = slots.map(normalizeTime).filter(Boolean).sort()
  if (!normalizedSlots.length) {
    return null
  }

  for (let index = 0; index < normalizedSlots.length; index += 1) {
    const slot = normalizedSlots[index]
    const target = buildSlotDate(now, slot)
    if (target.getTime() > now.getTime()) {
      return {
        slot,
        target,
        slotKey: `${getTodayText(now)} ${slot}`
      }
    }
  }

  const tomorrow = new Date(now)
  tomorrow.setDate(now.getDate() + 1)
  const slot = normalizedSlots[0]
  const target = buildSlotDate(tomorrow, slot)
  return {
    slot,
    target,
    slotKey: `${getTodayText(tomorrow)} ${slot}`
  }
}

function getCurrentSlot(now = new Date(), slots = DEFAULT_CONFIG.slots) {
  const normalizedSlots = slots.map(normalizeTime).filter(Boolean).sort()
  let current = null

  normalizedSlots.forEach((slot) => {
    const target = buildSlotDate(now, slot)
    if (target.getTime() <= now.getTime()) {
      current = {
        slot,
        target,
        slotKey: `${getTodayText(now)} ${slot}`
      }
    }
  })

  return current
}

function formatCountdown(diffMs) {
  const clamped = Math.max(0, diffMs)
  const totalSeconds = Math.floor(clamped / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
}

function getReminderState(now = new Date(), config = DEFAULT_CONFIG) {
  const next = getNextSlot(now, config.slots)
  if (!next) {
    return { shouldNotify: false }
  }

  const leadMs = Number(config.leadMinutes || 0) * 60 * 1000
  const reminderAt = next.target.getTime() - leadMs
  const slotKey = `${next.slotKey}@${config.leadMinutes}`
  const withinWindow = now.getTime() >= reminderAt && now.getTime() < next.target.getTime()
  const shouldNotify = Boolean(config.enabled && withinWindow && config.lastReminderKey !== slotKey)

  return {
    shouldNotify,
    reminderKey: slotKey,
    next
  }
}

function decodeHtmlEntities(text) {
  return String(text || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .trim()
}

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
    return []
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
      imageUrl: absolutizeUrl(decodeHtmlEntities(match[2])),
      limitText: `限购 ${match[3]}`,
      name: decodeHtmlEntities(match[4]),
      priceText: `${match[5]} 洛克贝`
    })
    match = itemMatcher.exec(normalizedHtml)
  }

  return dedupeGoods(goods)
}

function fetchRemoteMerchantGoods() {
  return new Promise((resolve, reject) => {
    wx.request({
      url: MERCHANT_SOURCE_URL,
      method: 'GET',
      success(response) {
        const html = typeof response.data === 'string' ? response.data : ''
        const goods = parseMerchantGoods(html)
        if (!goods.length) {
          reject(new Error('No goods parsed from merchant source'))
          return
        }
        resolve(goods)
      },
      fail(error) {
        reject(error)
      }
    })
  })
}

module.exports = {
  CLOUD_ENV_STORAGE_KEY,
  DEFAULT_CONFIG,
  DEFAULT_CLOUD_ENV_ID,
  DEFAULT_TEMPLATE_ID,
  MERCHANT_SOURCE_URL,
  MOCK_SUBSCRIPTION_COUNT_KEY,
  STORAGE_KEY,
  TEMPLATE_ID_STORAGE_KEY,
  TEST_TEMPLATE_ID,
  fetchRemoteMerchantGoods,
  formatCountdown,
  getCurrentSlot,
  getNextSlot,
  getReminderState,
  getTodayText,
  increaseMockSubscriptionCount,
  loadCloudSettings,
  loadConfig,
  loadMockSubscriptionCount,
  loadSlotRecords,
  normalizeTime,
  saveCloudSettings,
  saveConfig,
  saveMockSubscriptionCount,
  saveSlotRecord,
  splitNameText
}
