const { DEFAULT_CLOUD_ENV_ID } = require('./utils/merchant')

App({
  onLaunch() {
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云开发能力')
      return
    }

    wx.cloud.init({
      env: DEFAULT_CLOUD_ENV_ID,
      traceUser: true
    })

    this.globalData.cloudEnvId = DEFAULT_CLOUD_ENV_ID
  },

  globalData: {
    version: '0.2.0',
    cloudEnvId: ''
  }
})
