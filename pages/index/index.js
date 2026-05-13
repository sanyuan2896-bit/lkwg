const {
  DEFAULT_CLOUD_ENV_ID,
  DEFAULT_TEMPLATE_ID,
  loadCloudSettings,
  loadConfig,
  saveConfig,
  getCurrentSlot,
  getNextSlot,
  getTodayText,
  formatCountdown,
  getReminderState
} = require('../../utils/merchant')

function decorateGoods(goods) {
  return goods.map((item, index) => ({
    ...item,
    remainText: item.expireAt ? formatCountdown(item.expireAt - Date.now()) : '00:00:00',
    tone: index % 4 === 0 ? 'pink' : index % 4 === 1 ? 'orange' : index % 4 === 2 ? 'blue' : 'gold'
  }))
}

function buildSubscriptionText(remainingCount) {
  return remainingCount > 0 ? `订阅提醒（剩 ${remainingCount} 次）` : '订阅提醒'
}

function ensureCloudReady() {
  if (!wx.cloud) {
    return false
  }

  try {
    wx.cloud.init({
      env: DEFAULT_CLOUD_ENV_ID,
      traceUser: true
    })
    return true
  } catch (error) {
    console.warn('wx.cloud.init failed', error)
    return false
  }
}

function buildStageState(now, slots, current, next) {
  const normalizedSlots = Array.isArray(slots) ? slots : []
  const fallbackIndex = next ? Math.max(normalizedSlots.indexOf(next.slot), 0) : 0
  const currentIndex = current ? Math.max(normalizedSlots.indexOf(current.slot), 0) : fallbackIndex
  const startSlot = normalizedSlots[currentIndex] || '--:--'
  const endSlot = currentIndex < normalizedSlots.length - 1 ? normalizedSlots[currentIndex + 1] : '24:00'

  return {
    stageIndex: currentIndex + 1,
    rangeText: `${startSlot}-${endSlot}`,
    slotKey: `${getTodayText(now)}-${currentIndex + 1}`
  }
}

Page({
  data: {
    countdown: '00:00:00',
    nextSlot: '--:--',
    stageText: '第 1 / 4 场',
    rangeText: '',
    remainingCount: 0,
    subscriptionText: buildSubscriptionText(0),
    featuredGoods: [],
    sourceStatusText: '商品数据加载中',
    adCard: {
      title: '广告位',
      author: '远行商人提醒'
    }
  },

  onLoad() {
    this.refreshPageState()
    this.loadRemoteGoods()
    this.loadSubscriptionStatus()
  },

  onShow() {
    this.refreshPageState()
    this.loadSubscriptionStatus()
    this.startTicker()
  },

  onHide() {
    this.stopTicker()
  },

  onUnload() {
    this.stopTicker()
  },

  startTicker() {
    this.stopTicker()
    this.timer = setInterval(() => {
      this.refreshPageState()
    }, 1000)
  },

  stopTicker() {
    if (!this.timer) {
      return
    }
    clearInterval(this.timer)
    this.timer = null
  },

  setRemainingCount(remainingCount) {
    this.setData({
      remainingCount,
      subscriptionText: buildSubscriptionText(remainingCount)
    })
  },

  loadSubscriptionStatus() {
    if (!ensureCloudReady()) {
      this.setRemainingCount(0)
      return
    }

    wx.cloud.callFunction({
      name: 'getMerchantSubscriptionStatus',
      success: (result) => {
        const remainingCount = Number(result.result?.remainingCount || 0)
        this.setRemainingCount(remainingCount)
      },
      fail: (error) => {
        console.warn('getMerchantSubscriptionStatus failed', error)
        this.setRemainingCount(0)
      }
    })
  },

  refreshPageState() {
    const now = new Date()
    const config = loadConfig()
    const next = getNextSlot(now, config.slots)
    const current = getCurrentSlot(now, config.slots)
    const stageState = buildStageState(now, config.slots, current, next)

    this.setData({
      countdown: next ? formatCountdown(next.target.getTime() - now.getTime()) : '00:00:00',
      nextSlot: next ? next.slot : '--:--',
      rangeText: stageState.rangeText,
      stageText: `第 ${stageState.stageIndex} / ${config.slots.length} 场`,
      featuredGoods: this.data.featuredGoods.map((item) => ({
        ...item,
        remainText: item.expireAt ? formatCountdown(item.expireAt - now.getTime()) : '00:00:00'
      }))
    })

    this.tryNotify(now, config)
  },

  loadRemoteGoods() {
    if (!ensureCloudReady()) {
      this.setData({
        featuredGoods: [],
        sourceStatusText: '数据更新中'
      })
      return
    }

    wx.cloud.callFunction({
      name: 'getMerchantSnapshot',
      success: (result) => {
        const goods = result.result?.snapshot?.goods || []
        this.setData({
          featuredGoods: decorateGoods(goods),
          sourceStatusText: goods.length ? '商品数据来自洛克王国：世界' : '数据更新中'
        })
      },
      fail: (error) => {
        console.warn('getMerchantSnapshot failed', error)
        this.setData({
          featuredGoods: [],
          sourceStatusText: '数据更新中'
        })
      }
    })
  },

  tryNotify(now, config) {
    const reminder = getReminderState(now, config)
    if (!reminder.shouldNotify) {
      return
    }

    saveConfig({
      ...config,
      lastReminderKey: reminder.reminderKey
    })

    wx.vibrateShort({ type: 'medium' })
    wx.showModal({
      title: '远行商人即将刷新',
      content: `${reminder.next.slot} 即将到点，记得上线看货。`,
      showCancel: false,
      confirmText: '知道了'
    })
  },

  selectGoods() {
    wx.showModal({
      title: '商品更新提醒',
      content: '当前规则是：远行商人商品数据一有更新就提醒，不限定具体商品。',
      showCancel: false,
      confirmText: '知道了'
    })
  },

  subscribeReminder() {
    const cloudSettings = loadCloudSettings()
    const templateId = cloudSettings.templateId || DEFAULT_TEMPLATE_ID

    if (!ensureCloudReady()) {
      wx.showToast({
        title: '当前基础库不支持云开发',
        icon: 'none'
      })
      return
    }

    wx.requestSubscribeMessage({
      tmplIds: [templateId],
      success: (subscribeResult) => {
        const result = subscribeResult[templateId]

        if (result !== 'accept') {
          wx.showToast({
            title: '订阅失败',
            icon: 'none'
          })
          return
        }

        const now = new Date()
        const config = loadConfig()
        const currentSlot = getCurrentSlot(now, config.slots)
        const nextSlot = getNextSlot(now, config.slots)
        const stageState = buildStageState(now, config.slots, currentSlot, nextSlot)

        wx.cloud.callFunction({
          name: 'createMerchantSubscription',
          data: {
            cloudEnvId: cloudSettings.cloudEnvId || DEFAULT_CLOUD_ENV_ID,
            goodsNames: [],
            currentGoods: this.data.featuredGoods.map((item) => ({
              name: item.name,
              priceText: item.priceText,
              limitText: item.limitText,
              expireAt: item.expireAt
            })),
            rangeText: stageState.rangeText,
            slotKey: stageState.slotKey,
            stageText: this.data.stageText,
            templateId
          },
          success: (callResult) => {
            const result = callResult.result || {}
            const remainingCount = Number(result.remainingCount || 0)
            this.setRemainingCount(remainingCount)

            wx.showToast({
              title: `订阅成功，剩 ${remainingCount} 次`,
              icon: 'none'
            })
          },
          fail: (error) => {
            console.warn('createMerchantSubscription failed', error)
            wx.showToast({
              title: '订阅失败',
              icon: 'none'
            })
          }
        })
      },
      fail: (error) => {
        console.warn('requestSubscribeMessage failed', error)
        wx.showToast({
          title: '订阅失败',
          icon: 'none'
        })
      }
    })
  }
})
