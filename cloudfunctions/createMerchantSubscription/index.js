const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

exports.main = async (event) => {
  const wxContext = cloud.getWXContext()
  const collection = db.collection('merchant_subscriptions')
  const currentGoods = Array.isArray(event.currentGoods) ? event.currentGoods : []
  const slotKey = event.slotKey || ''
  const existing = await collection.where({
    openid: wxContext.OPENID
  }).limit(1).get()

  let remainingCount = 1

  if (existing.data.length) {
    const current = existing.data[0]
    remainingCount = Number(current.remainingCount || 0) + 1

    await collection.doc(current._id).update({
      data: {
        templateId: event.templateId,
        goodsNames: event.goodsNames || [],
        currentGoods,
        slotKey,
        rangeText: event.rangeText || '',
        stageText: event.stageText || '',
        remainingCount,
        status: 'active',
        updatedAt: db.serverDate()
      }
    })
  } else {
    await collection.add({
      data: {
        openid: wxContext.OPENID,
        templateId: event.templateId,
        goodsNames: event.goodsNames || [],
        currentGoods,
        slotKey,
        rangeText: event.rangeText || '',
        stageText: event.stageText || '',
        remainingCount,
        status: 'active',
        createdAt: db.serverDate(),
        updatedAt: db.serverDate()
      }
    })
  }

  return {
    remainingCount
  }
}
