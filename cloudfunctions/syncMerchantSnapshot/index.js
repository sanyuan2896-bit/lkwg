const crypto = require('crypto')
const cloud = require('wx-server-sdk')
const { fetchMerchantSnapshot } = require('./merchantParser')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

function pad(value) {
  return String(value).padStart(2, '0')
}

function buildLocalDateText(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
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

exports.main = async () => {
  const snapshot = await fetchMerchantSnapshot()
  const slotKey = `${buildLocalDateText()}-${snapshot.activeSlot || '0'}`
  const snapshotHash = buildSnapshotHash(snapshot)

  await db.collection('merchant_snapshots').add({
    data: {
      slotKey,
      snapshotHash,
      goods: snapshot.goods,
      rangeText: snapshot.rangeText,
      fetchedAt: db.serverDate()
    }
  })

  return {
    count: snapshot.goods.length,
    slotKey,
    snapshotHash
  }
}
