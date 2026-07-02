const app = getApp();
const db = wx.cloud.database();

Page({
  data: {
    spaces: [],
    showCreate: false,
    newSpaceName: '',
    showJoin: false,
    joinCode: ''
  },

  onShow() {
    this.fetchSpaces();
  },

  async fetchSpaces() {
    try {
      const { data } = await db.collection('spaces').get();
      this.setData({ spaces: data });
    } catch (e) {
      wx.showToast({ title: '加载空间失败，请检查数据库权限', icon: 'none' });
    }
  },

  onSwitchSpace(e) {
    const { id, name } = e.currentTarget.dataset;
    app.setCurrentSpace(id, name);
    wx.switchTab({ url: '/pages/index/index' });
  },

  onSpaceDetail(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: '/pages/space/space?id=' + id });
  },

  onCreateTap() {
    this.setData({ showCreate: true, newSpaceName: '' });
  },

  async onConfirmCreate() {
    const name = this.data.newSpaceName.trim();
    if (!name) return;
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'initUser',
        data: { action: 'createSpace', name }
      });
      if (result && result.spaceId) {
        app.setCurrentSpace(result.spaceId, name);
        this.setData({ showCreate: false, newSpaceName: '' });
        wx.switchTab({ url: '/pages/index/index' });
      }
    } catch (e) {
      wx.showToast({ title: '创建失败', icon: 'none' });
    }
  },

  onNameInput(e) { this.setData({ newSpaceName: e.detail.value }); },
  onCancelCreate() { this.setData({ showCreate: false, newSpaceName: '' }); },

  // 加入空间
  onTapJoin() { this.setData({ showJoin: true, joinCode: '' }); },
  onCancelJoin() { this.setData({ showJoin: false, joinCode: '' }); },
  onJoinCodeInput(e) { this.setData({ joinCode: e.detail.value }); },

  async onJoinByCode() {
    const code = this.data.joinCode.trim();
    if (!code) return;
    wx.showLoading({ title: '加入中' });
    try {
      await wx.cloud.callFunction({
        name: 'manageInvite',
        data: { action: 'accept', code }
      });
      wx.hideLoading();
      wx.showToast({ title: '加入成功' });
      this.setData({ showJoin: false, joinCode: '' });
      this.fetchSpaces();
    } catch (e) {
      wx.hideLoading();
      wx.showToast({ title: '邀请码无效或已过期', icon: 'none' });
    }
  }
});
