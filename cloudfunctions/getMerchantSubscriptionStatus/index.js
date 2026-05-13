const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

exports.main = async () => {
  const wxContext = cloud.getWXContext()
  const result = await db.collection('merchant_subscriptions').where({
    openid: wxContext.OPENID
  }).limit(1).get()

  if (!result.data.length) {
    return {
      remainingCount: 0
    }
  }

  return {
    remainingCount: Number(result.data[0].remainingCount || 0)
  }
}
