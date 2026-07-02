App({
  onLaunch() {
    wx.cloud.init({ env: 'cloud1-d2gas6q7cabd01075' });
    this.loadCurrentSpace();
  },

  globalData: {
    currentSpaceId: '',
    currentSpaceName: '个人'
  },

  loadCurrentSpace() {
    const spaceId = wx.getStorageSync('currentSpaceId');
    if (spaceId) {
      this.globalData.currentSpaceId = spaceId;
    }
  },

  setCurrentSpace(id, name) {
    this.globalData.currentSpaceId = id;
    this.globalData.currentSpaceName = name || '个人';
    wx.setStorageSync('currentSpaceId', id);
  }
});