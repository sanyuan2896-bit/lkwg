const crypto = require('crypto')
const https = require('https')
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command
const TOKEN_COLLECTION = 'merchant_runtime_config'
const TOKEN_DOC_ID = 'wechat_access_token'
const TOKEN_EXPIRE_BUFFER_MS = 200 * 1000
const DEFAULT_MINIPROGRAM_STATE = 'developer'

function formatDateTime(timestamp) {
  const date = new Date(Number(timestamp) || Date.now())
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hour = String(date.getHours()).padStart(2, '0')
  const minute = String(date.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day} ${hour}:${minute}`
}

function pad(value) {
  return String(value).padStart(2, '0')
}

function buildLocalDateText(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function parseHourMinutePair(text) {
  const match = String(text || '').trim().match(/^(\d{2}):(\d{2})$/)
  if (!match) {
    return null
  }

  return {
    hour: Number(match[1]),
    minute: Number(match[2])
  }
}

function buildRangeTimestamps({ rangeText, slotKey }) {
  const normalizedRange = String(rangeText || '').trim()
  const normalizedSlotKey = String(slotKey || '').trim()
  const slotDateMatch = normalizedSlotKey.match(/^(\d{4}-\d{2}-\d{2})/)
  const rangeMatch = normalizedRange.match(/(\d{2}:\d{2})-(\d{2}:\d{2})$/)

  if (!slotDateMatch || !rangeMatch) {
    return {
      startAt: Date.now(),
      endAt: Date.now()
    }
  }

  const baseDate = new Date(`${slotDateMatch[1]}T00:00:00+08:00`)
  const startPair = parseHourMinutePair(rangeMatch[1])
  const endPair = parseHourMinutePair(rangeMatch[2])

  if (!startPair || !endPair || Number.isNaN(baseDate.getTime())) {
    return {
      startAt: Date.now(),
      endAt: Date.now()
    }
  }

  const startAt = new Date(baseDate)
  startAt.setHours(startPair.hour, startPair.minute, 0, 0)

  const endAt = new Date(baseDate)
  const crossesDay = endPair.hour === 24 || endPair.hour < startPair.hour
  if (crossesDay) {
    endAt.setDate(endAt.getDate() + 1)
  }
  endAt.setHours(endPair.hour === 24 ? 0 : endPair.hour, endPair.minute, 0, 0)

  return {
    startAt: startAt.getTime(),
    endAt: endAt.getTime()
  }
}

function buildSnapshotHash(snapshot) {
  const payload = {
    rangeText: snapshot.rangeText || '',
    goods: (snapshot.goods || []).map((item) => ({
      name: item.name || '',
      limitText: item.limitText || '',
      priceText: item.priceText || '',
      expireAt: Number(item.expireAt) || 0
    }))
  }

  return crypto.createHash('sha1').update(JSON.stringify(payload)).digest('hex')
}

function buildSummaryText(goodsNames) {
  if (!goodsNames.length) {
    return '远行商人商品有更新'
  }

  return `远行商人商品更新：${goodsNames.slice(0, 3).join('、')}`.slice(0, 20)
}

function normalizeError(error) {
  const message = String(error && (error.errMsg || error.message) || 'unknown_error')
  const code = error && (error.errCode || error.code) ? String(error.errCode || error.code) : ''
  return {
    code,
    message
  }
}

function requestJson(url, options = {}) {
  const method = options.method || 'GET'
  const body = options.body ? JSON.stringify(options.body) : ''

  return new Promise((resolve, reject) => {
    const request = https.request(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    }, (response) => {
      let raw = ''
      response.setEncoding('utf8')
      response.on('data', (chunk) => {
        raw += chunk
      })
      response.on('end', () => {
        try {
          const parsed = raw ? JSON.parse(raw) : {}
          resolve(parsed)
        } catch (error) {
          reject(new Error(`Invalid JSON response: ${raw}`))
        }
      })
    })

    request.on('error', reject)
    if (body) {
      request.write(body)
    }
    request.end()
  })
}

async function readCachedAccessToken() {
  try {
    const result = await db.collection(TOKEN_COLLECTION).doc(TOKEN_DOC_ID).get()
    const data = result.data || {}
    if (data.accessToken && Number(data.expireAt || 0) > Date.now()) {
      return data.accessToken
    }
  } catch (error) {
    if (!String(error.message || '').includes('not exist')) {
      console.warn('read cached access token failed', error)
    }
  }

  return ''
}

async function writeCachedAccessToken(accessToken, expiresIn) {
  const expireAt = Date.now() + (Number(expiresIn || 7200) * 1000) - TOKEN_EXPIRE_BUFFER_MS
  const payload = {
    accessToken,
    expireAt,
    updatedAt: db.serverDate()
  }

  try {
    await db.collection(TOKEN_COLLECTION).doc(TOKEN_DOC_ID).set({
      data: payload
    })
  } catch (error) {
    console.warn('write cached access token failed', error)
  }
}

async function getAccessToken() {
  const cachedToken = await readCachedAccessToken()
  if (cachedToken) {
    return cachedToken
  }

  const appId = process.env.APPID
  const appSecret = process.env.APPSECRET
  if (!appId || !appSecret) {
    throw new Error('Missing APPID or APPSECRET environment variable')
  }

  const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${encodeURIComponent(appId)}&secret=${encodeURIComponent(appSecret)}`
  const result = await requestJson(url)
  if (!result.access_token) {
    throw new Error(`get access_token failed: ${JSON.stringify(result)}`)
  }

  await writeCachedAccessToken(result.access_token, result.expires_in)
  return result.access_token
}

async function sendSubscribeMessage({ task, startAt, endAt, summaryText }) {
  const accessToken = await getAccessToken()
  const url = `https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token=${encodeURIComponent(accessToken)}`
  const payload = {
    touser: task.openid,
    template_id: task.templateId,
    page: 'pages/index/index',
    miniprogram_state: process.env.MINIPROGRAM_STATE || DEFAULT_MINIPROGRAM_STATE,
    data: {
      time5: {
        value: formatDateTime(startAt)
      },
      time6: {
        value: formatDateTime(endAt)
      },
      thing11: {
        value: summaryText
      }
    }
  }

  const result = await requestJson(url, {
    method: 'POST',
    body: payload
  })

  if (result.errcode && result.errcode !== 0) {
    throw new Error(`subscribe send failed: ${JSON.stringify(result)}`)
  }

  return result
}

exports.main = async () => {
  const snapshotResult = await db.collection('merchant_snapshots')
    .orderBy('fetchedAt', 'desc')
    .limit(1)
    .get()

  const snapshot = snapshotResult.data[0]
  if (!snapshot) {
    return {
      matched: 0,
      sendResults: [],
      summary: {
        reason: 'no_snapshot_document'
      }
    }
  }

  if (!Array.isArray(snapshot.goods) || !snapshot.goods.length) {
    return {
      matched: 0,
      sendResults: [],
      summary: {
        reason: 'no_snapshot_goods',
        slotKey: snapshot.slotKey || '',
        rangeText: snapshot.rangeText || '',
        snapshotHash: snapshot.snapshotHash || buildSnapshotHash(snapshot)
      }
    }
  }

  const snapshotHash = snapshot.snapshotHash || buildSnapshotHash(snapshot)
  const { startAt, endAt } = buildRangeTimestamps({
    rangeText: snapshot.rangeText,
    slotKey: snapshot.slotKey || `${buildLocalDateText()}-0`
  })

  const subscriptionResult = await db.collection('merchant_subscriptions')
    .where({
      status: 'active',
      remainingCount: _.gt(0)
    })
    .get()

  const goodsNames = snapshot.goods.map((item) => item.name).filter(Boolean)
  const summaryText = buildSummaryText(goodsNames)
  const sendResults = []
  const failedResults = []
  let skippedSameSnapshot = 0
  let attempted = 0

  for (const task of subscriptionResult.data) {
    if (task.lastSentSnapshotHash && task.lastSentSnapshotHash === snapshotHash) {
      skippedSameSnapshot += 1
      continue
    }

    attempted += 1

    try {
      const sendResult = await sendSubscribeMessage({
        task,
        startAt,
        endAt,
        summaryText
      })

      const nextCount = Math.max(0, Number(task.remainingCount || 0) - 1)
      await db.collection('merchant_subscriptions').doc(task._id).update({
        data: {
          remainingCount: nextCount,
          lastSentSnapshotHash: snapshotHash,
          lastSentSlotKey: snapshot.slotKey || '',
          lastSentAt: db.serverDate(),
          status: nextCount > 0 ? 'active' : 'idle',
          updatedAt: db.serverDate()
        }
      })

      sendResults.push({
        id: task._id,
        remainingCount: nextCount,
        sendResult
      })
    } catch (error) {
      failedResults.push({
        id: task._id,
        openid: task.openid,
        ...normalizeError(error)
      })
    }
  }

  console.log(JSON.stringify({
    type: 'merchant_notification_summary',
    transport: 'wechat_http_api',
    slotKey: snapshot.slotKey || '',
    rangeText: snapshot.rangeText || '',
    snapshotHash,
    goodsCount: snapshot.goods.length,
    activeSubscriptionCount: subscriptionResult.data.length,
    skippedSameSnapshot,
    attempted,
    sentCount: sendResults.length,
    failedCount: failedResults.length,
    failures: failedResults
  }))

  return {
    matched: sendResults.length,
    sendResults,
    failedResults,
    summary: {
      reason: sendResults.length
        ? 'sent'
        : failedResults.length
          ? 'send_failed'
          : attempted
            ? 'send_failed_or_filtered'
            : 'same_snapshot_or_no_active_subscription',
      transport: 'wechat_http_api',
      slotKey: snapshot.slotKey || '',
      rangeText: snapshot.rangeText || '',
      snapshotHash,
      goodsCount: snapshot.goods.length,
      activeSubscriptionCount: subscriptionResult.data.length,
      skippedSameSnapshot,
      attempted,
      failedCount: failedResults.length
    }
  }
}
