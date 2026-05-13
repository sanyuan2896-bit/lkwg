const {
  DEFAULT_CLOUD_ENV_ID,
  DEFAULT_TEMPLATE_ID,
  FIXED_SUBSCRIPTION_GOODS,
  loadCloudSettings,
  loadConfig,
  normalizeTime,
  saveCloudSettings,
  saveConfig,
  splitNameText
} = require('../../utils/merchant')

Page({
  data: {
    enabled: true,
    leadMinutesIndex: 1,
    leadMinutesOptions: [5, 10, 15, 30],
    slotsText: '',
    keywordsText: '',
    cloudEnvId: '',
    templateId: '',
    notes: ''
  },

  onLoad() {
    const config = loadConfig()
    const cloudSettings = loadCloudSettings()
    const leadMinutesIndex = this.data.leadMinutesOptions.findIndex((item) => item === config.leadMinutes)

    this.setData({
      enabled: config.enabled,
      leadMinutesIndex: leadMinutesIndex >= 0 ? leadMinutesIndex : 1,
      slotsText: config.slots.join(', '),
      keywordsText: config.keywords.join(', '),
      cloudEnvId: cloudSettings.cloudEnvId || DEFAULT_CLOUD_ENV_ID,
      templateId: cloudSettings.templateId || DEFAULT_TEMPLATE_ID,
      notes: config.notes || ''
    })
  },

  onEnabledChange(event) {
    this.setData({
      enabled: event.detail.value
    })
  },

  onLeadChange(event) {
    this.setData({
      leadMinutesIndex: Number(event.detail.value)
    })
  },

  onSlotsInput(event) {
    this.setData({
      slotsText: event.detail.value
    })
  },

  onKeywordsInput(event) {
    this.setData({
      keywordsText: event.detail.value
    })
  },

  onCloudEnvInput(event) {
    this.setData({
      cloudEnvId: event.detail.value
    })
  },

  onTemplateIdInput(event) {
    this.setData({
      templateId: event.detail.value
    })
  },

  onNotesInput(event) {
    this.setData({
      notes: event.detail.value
    })
  },

  saveSettings() {
    const slots = this.data.slotsText
      .split(/[,，\s]+/)
      .map(normalizeTime)
      .filter(Boolean)
      .sort()

    if (!slots.length) {
      wx.showToast({
        title: '请至少填写一个有效时段',
        icon: 'none'
      })
      return
    }

    const keywords = splitNameText(this.data.keywordsText)
    const config = loadConfig()

    saveConfig({
      ...config,
      enabled: this.data.enabled,
      keywords,
      leadMinutes: this.data.leadMinutesOptions[this.data.leadMinutesIndex],
      selectedGoodsNames: FIXED_SUBSCRIPTION_GOODS,
      slots,
      notes: this.data.notes.trim(),
      lastReminderKey: ''
    })

    saveCloudSettings({
      cloudEnvId: this.data.cloudEnvId,
      templateId: this.data.templateId
    })

    if (wx.cloud && this.data.cloudEnvId.trim()) {
      wx.cloud.init({
        env: this.data.cloudEnvId.trim(),
        traceUser: true
      })
      getApp().globalData.cloudEnvId = this.data.cloudEnvId.trim()
    } else if (wx.cloud) {
      wx.cloud.init({
        env: DEFAULT_CLOUD_ENV_ID,
        traceUser: true
      })
      getApp().globalData.cloudEnvId = DEFAULT_CLOUD_ENV_ID
    }

    wx.showToast({
      title: '设置已保存',
      icon: 'success'
    })

    setTimeout(() => {
      wx.navigateBack()
    }, 450)
  }
})
