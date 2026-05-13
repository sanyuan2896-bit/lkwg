const https = require('https')
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

function fetchBinary(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (response) => {
        const chunks = []
        response.on('data', (chunk) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
        })
        response.on('end', () => {
          resolve(Buffer.concat(chunks))
        })
      })
      .on('error', reject)
  })
}

async function toDataUrl(url) {
  if (!url || !/^https?:\/\//i.test(url)) {
    return ''
  }

  try {
    const buffer = await fetchBinary(url)
    if (!buffer.length) {
      return ''
    }
    return `data:image/png;base64,${buffer.toString('base64')}`
  } catch (error) {
    return ''
  }
}

exports.main = async () => {
  const result = await db.collection('merchant_snapshots')
    .orderBy('fetchedAt', 'desc')
    .limit(1)
    .get()

  const snapshot = result.data[0] || null
  if (!snapshot) {
    return {
      ok: true,
      snapshot: null
    }
  }

  const goods = await Promise.all((snapshot.goods || []).map(async (item) => ({
    ...item,
    imageDataUrl: await toDataUrl(item.imageUrl)
  })))

  return {
    ok: true,
    snapshot: {
      ...snapshot,
      goods
    }
  }
}
